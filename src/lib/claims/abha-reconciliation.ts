// Ojas — ABHA Identity Reconciliation (P1 #5).
//
// This module compares ABHA demographic data (name, gender, year of birth)
// against the patient's locally-stored record. The result is a safety check
// — NOT official identity verification. It prevents accidental linkage of
// the wrong ABHA to the wrong patient.
//
// Comparison rules:
//   - Name: token-based comparison (case-insensitive, whitespace-insensitive,
//     punctuation-tolerant, diacritics-normalized, name-order tolerant).
//     A naive exact equality check would reject "Ramesh Kumar" vs "Kumar Ramesh"
//     which is a common name-order variation in India.
//   - Gender: exact match where the source values are comparable.
//   - Year of birth: exact when known. Allow ±1 only when the source contains
//     only approximate/limited DOB information — and document why.
//
// Result:
//   MATCH   → all comparable fields agree
//   PARTIAL → some fields agree, some are missing/ambiguous
//   MISMATCH → at least one comparable field contradicts
//
// PARTIAL/MISMATCH require an explicit overrideReason before the link/manual-
// capture can proceed. The override + reconciliation result are persisted +
// audited.

/** Normalize a name string for token-based comparison. */
function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    // Normalize diacritics (NFD → strip combining marks).
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove punctuation (apostrophes, hyphens, dots, etc.) — replace with
    // empty string so "O'Brien" → "obrien" (one token, not "o" + "brien").
    .replace(/[^\w\s]/g, "")
    // Collapse whitespace.
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .sort(); // name-order tolerant
}

/** Compare two name strings via token-set overlap. */
function compareNames(localName: string, abhaName: string): "MATCH" | "PARTIAL" | "MISMATCH" {
  const localTokens = new Set(normalizeName(localName));
  const abhaTokens = new Set(normalizeName(abhaName));
  if (localTokens.size === 0 || abhaTokens.size === 0) return "PARTIAL";

  // Check if the token sets are equal (name-order tolerant).
  const localArr = [...localTokens].sort();
  const abhaArr = [...abhaTokens].sort();
  if (localArr.join(" ") === abhaArr.join(" ")) return "MATCH";

  // Check for significant overlap (at least 60% of the smaller set matches).
  const smaller = localTokens.size <= abhaTokens.size ? localTokens : abhaTokens;
  const larger = localTokens.size <= abhaTokens.size ? abhaTokens : localTokens;
  let overlap = 0;
  for (const t of smaller) if (larger.has(t)) overlap++;
  const overlapRatio = overlap / smaller.size;
  if (overlapRatio >= 0.6) return "PARTIAL";
  return "MISMATCH";
}

/** Compare gender strings. Returns MATCH, PARTIAL (if either is missing), or MISMATCH. */
function compareGender(local: string | null | undefined, abha: string | null | undefined): "MATCH" | "PARTIAL" | "MISMATCH" {
  if (!local || !abha) return "PARTIAL";
  const normalize = (g: string) => g.trim().toUpperCase().charAt(0);
  const l = normalize(local);
  const a = normalize(abha);
  if (l === a) return "MATCH";
  return "MISMATCH";
}

/** Compare years of birth. ±1 allowed ONLY when a reason is provided. */
function compareYearOfBirth(
  local: number | null | undefined,
  abha: number | null | undefined,
): "MATCH" | "PARTIAL" | "MISMATCH" {
  if (!local || !abha) return "PARTIAL";
  if (local === abha) return "MATCH";
  if (Math.abs(local - abha) <= 1) return "PARTIAL"; // ±1 allowed with override
  return "MISMATCH";
}

export interface ReconciliationInput {
  localName: string;
  localGender: string | null;
  localYearOfBirth: number | null;
  abhaName: string | null;
  abhaGender: string | null;
  abhaYearOfBirth: number | null;
}

export interface ReconciliationResult {
  match: "MATCH" | "PARTIAL" | "MISMATCH";
  reasons: string[];
}

/**
 * Compare ABHA demographics against the patient record.
 * Returns MATCH/PARTIAL/MISMATCH with reasons explaining the result.
 * NEVER treat this as official identity verification — it is an Ojas safety check.
 */
export function reconcileAbhaIdentity(input: ReconciliationInput): ReconciliationResult {
  const reasons: string[] = [];
  const results: Array<"MATCH" | "PARTIAL" | "MISMATCH"> = [];

  // Name comparison
  if (!input.abhaName) {
    results.push("PARTIAL");
    reasons.push("ABHA name not provided");
  } else if (!input.localName) {
    results.push("PARTIAL");
    reasons.push("Local patient name not available");
  } else {
    const nameResult = compareNames(input.localName, input.abhaName);
    results.push(nameResult);
    if (nameResult === "MISMATCH") {
      reasons.push(`Name mismatch: local="${input.localName}" vs abha="${input.abhaName}"`);
    } else if (nameResult === "PARTIAL") {
      reasons.push("Name partial match (token overlap but not exact set match)");
    }
  }

  // Gender comparison
  const genderResult = compareGender(input.localGender, input.abhaGender);
  results.push(genderResult);
  if (genderResult === "MISMATCH") {
    reasons.push(`Gender mismatch: local=${input.localGender} vs abha=${input.abhaGender}`);
  } else if (genderResult === "PARTIAL") {
    reasons.push("Gender not comparable (one or both missing)");
  }

  // Year of birth comparison
  const yobResult = compareYearOfBirth(input.localYearOfBirth, input.abhaYearOfBirth);
  results.push(yobResult);
  if (yobResult === "MISMATCH") {
    reasons.push(`Year of birth mismatch: local=${input.localYearOfBirth} vs abha=${input.abhaYearOfBirth}`);
  } else if (yobResult === "PARTIAL") {
    if (!input.localYearOfBirth || !input.abhaYearOfBirth) {
      reasons.push("Year of birth not comparable (one or both missing)");
    } else {
      reasons.push(`Year of birth ±1: local=${input.localYearOfBirth} vs abha=${input.abhaYearOfBirth}`);
    }
  }

  // Aggregate: MISMATCH if any field mismatches; PARTIAL if any is partial; else MATCH
  const hasMismatch = results.includes("MISMATCH");
  const hasPartial = results.includes("PARTIAL");
  const match: "MATCH" | "PARTIAL" | "MISMATCH" = hasMismatch ? "MISMATCH" : hasPartial ? "PARTIAL" : "MATCH";

  return { match, reasons };
}
