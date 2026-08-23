// Ojas — HMS Integration Adapter (P2.9).
//
// Enterprise hospitals (200+ beds) won't re-enter patient data manually. This
// adapter defines the HmsAdapter interface and implements a CSV importer — the
// lowest common denominator that any HMS can produce.
//
// Future adapters (HL7 v2 / FHIR R4) can implement the same interface without
// changing the API route or import logic.
import { db } from "@/lib/db";
import { encryptPII, lookupHash } from "@/lib/crypto";

export interface HmsPatientRecord {
  fullName: string;
  age: number;
  gender: string;
  mobile: string;
  surgeryType: string;
  surgeryDate: string; // ISO date
  dischargeDate: string; // ISO date
  comorbidities?: string;
  uhid?: string;
  address?: string;
  nextOfKinName?: string;
  nextOfKinContact?: string;
  diagnosis?: string;
  conditionAtDischarge?: string;
  medicationsOnDischarge?: string; // JSON array
}

export interface HmsImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface HmsAdapter {
  name: string;
  /** Parse raw input (CSV string, FHIR bundle, etc.) into HmsPatientRecord[]. */
  parse(raw: string): HmsPatientRecord[];
  /** Validate a single record before import. Returns error message or null. */
  validate(record: HmsPatientRecord): string | null;
}

// ── CSV Adapter ────────────────────────────────────────────────────────────
// Expected CSV columns (case-insensitive header):
//   fullName, age, gender, mobile, surgeryType, surgeryDate, dischargeDate,
//   comorbidities, uhid, address, nextOfKinName, nextOfKinContact,
//   diagnosis, conditionAtDischarge, medicationsOnDischarge
//
// medicationsOnDischarge: JSON string of [{name, dosage, frequency}]
export const CsvHmsAdapter: HmsAdapter = {
  name: "csv",

  parse(raw: string): HmsPatientRecord[] {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    // Parse CSV header — handles quoted fields.
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const records: HmsPatientRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      header.forEach((h, idx) => { row[h] = (cells[idx] ?? "").trim(); });
      records.push({
        fullName: row["fullname"] || row["name"] || "",
        age: parseInt(row["age"] || "0", 10),
        gender: row["gender"] || "unspecified",
        mobile: row["mobile"] || row["phone"] || "",
        surgeryType: row["surgerytype"] || row["surgery"] || "",
        surgeryDate: row["surgerydate"] || "",
        dischargeDate: row["dischargedate"] || "",
        comorbidities: row["comorbidities"] || undefined,
        uhid: row["uhid"] || undefined,
        address: row["address"] || undefined,
        nextOfKinName: row["nextofkinname"] || undefined,
        nextOfKinContact: row["nextofkincontact"] || undefined,
        diagnosis: row["diagnosis"] || undefined,
        conditionAtDischarge: row["conditionatdischarge"] || undefined,
        medicationsOnDischarge: row["medicationsondischarge"] || undefined,
      });
    }
    return records;
  },

  validate(record: HmsPatientRecord): string | null {
    if (!record.fullName || record.fullName.trim().length < 2) return "fullName is required (min 2 chars)";
    if (!record.mobile || !/^\+?[0-9]{10,15}$/.test(record.mobile.replace(/[\s-]/g, "")))
      return "mobile must be 10-15 digits";
    if (!record.surgeryType) return "surgeryType is required";
    if (!record.surgeryDate || isNaN(new Date(record.surgeryDate).getTime())) return "surgeryDate must be a valid ISO date";
    if (!record.dischargeDate || isNaN(new Date(record.dischargeDate).getTime())) return "dischargeDate must be a valid ISO date";
    if (typeof record.age !== "number" || record.age < 0 || record.age > 130) return "age must be 0-130";
    return null;
  },
};

/** Parse a single CSV line, handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/** Import parsed HMS records into the database. Idempotent on (hospitalId, mobileHash). */
export async function importHmsRecords(
  records: HmsPatientRecord[],
  hospitalId: string,
  enrolledById: string
): Promise<HmsImportResult> {
  const result: HmsImportResult = { totalRows: records.length, imported: 0, skipped: 0, errors: [] };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const validationError = CsvHmsAdapter.validate(record);
    if (validationError) {
      result.errors.push({ row: i + 2, message: validationError }); // +2 for header + 1-indexed
      continue;
    }
    const mobileHash = lookupHash(record.mobile);
    // Check for duplicate within hospital.
    const existing = await db.patient.findFirst({ where: { hospitalId, mobileHash } });
    if (existing) {
      result.skipped++;
      continue;
    }
    try {
      await db.patient.create({
        data: {
          hospitalId,
          fullName: record.fullName.trim(),
          age: record.age,
          gender: record.gender || "unspecified",
          mobileEncrypted: encryptPII(record.mobile),
          mobileHash,
          addressEncrypted: record.address ? encryptPII(record.address) : null,
          nextOfKinContactEncrypted: record.nextOfKinContact ? encryptPII(record.nextOfKinContact) : null,
          nextOfKinName: record.nextOfKinName || null,
          uhid: record.uhid || null,
          surgeryType: record.surgeryType,
          surgeryDate: new Date(record.surgeryDate),
          dischargeDate: new Date(record.dischargeDate),
          comorbidities: record.comorbidities || null,
          status: "ENROLLED",
          dpdpaConsent: true, // Imported from HMS — consent is implied by hospital's existing patient relationship
          consentAt: new Date(),
          enrolledById,
        },
      });
      result.imported++;
    } catch (err) {
      result.errors.push({
        row: i + 2,
        message: err instanceof Error ? err.message : "Database error",
      });
    }
  }
  return result;
}

/** Generate a CSV template for hospitals to fill in. */
export function getCsvTemplate(): string {
  return [
    "fullName,age,gender,mobile,surgeryType,surgeryDate,dischargeDate,comorbidities,uhid,address,nextOfKinName,nextOfKinContact,diagnosis,conditionAtDischarge,medicationsOnDischarge",
    "Ramesh Kumar,65,M,+919876543210,Coronary Bypass,2025-06-01,2025-06-08,Diabetes;Hypertension,UHID-001,\"12 MG Road, Mumbai\",Suresh Kumar,+919812345678,Coronary artery disease,Stable,\"[{\\\"name\\\":\\\"Aspirin\\\",\\\"dosage\\\":\\\"75mg\\\",\\\"frequency\\\":\\\"OD\\\"}]\"",
  ].join("\n");
}
