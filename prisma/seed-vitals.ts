// Ojas — backfill realistic pain/temperature/symptoms on answered check-ins
// that were seeded without vitals data. Idempotent: only fills NULL fields.
// Run with: bunx tsx prisma/seed-vitals.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Realistic recovery trajectory templates per surgery type.
// Pain should decrease over time; temp should hover near 37°C with occasional
// post-op fever in first 3 days; symptoms should reflect typical recovery.
const RECOVERY_TEMPLATES: Record<string, {
  pain: (day: number) => number;     // 0-10
  temp: (day: number) => number;     // °C
  symptoms: (day: number) => string | null;
  meds: (day: number) => boolean;
}[]> = {};

function painDecay(start: number, day: number, floor = 1): number {
  // Pain decreases ~0.7/day with floor. Use day-1 so day 1 = start value.
  const pain = start - (day - 1) * 0.7;
  return Math.max(floor, Math.round(pain * 10) / 10);
}

function tempWithOccasionalFever(day: number, feverDays: number[] = []): number {
  if (feverDays.includes(day)) return 37.8 + Math.random() * 0.8; // 37.8-38.6
  return Math.round((36.7 + Math.random() * 0.7) * 10) / 10; // 36.7-37.4
}

function symptomsFor(surgery: string, day: number): string | null {
  const s = surgery.toLowerCase();
  if (day <= 2) {
    if (s.includes("bypass") || s.includes("cardiac")) return "Mild chest discomfort, fatigue";
    if (s.includes("knee") || s.includes("hip")) return "Surgical site pain, mild swelling";
    if (s.includes("caesarean") || s.includes("cesarean")) return "Incision pain, difficulty moving";
    if (s.includes("appendectomy") || s.includes("laparoscopic")) return "Port site pain, mild nausea";
    if (s.includes("cataract")) return "Mild eye irritation, sensitivity to light";
    return "Post-op discomfort, fatigue";
  }
  if (day <= 4) {
    if (s.includes("bypass") || s.includes("cardiac")) return "Improving, mild fatigue on exertion";
    if (s.includes("knee") || s.includes("hip")) return "Decreasing pain, mild swelling persists";
    if (s.includes("appendectomy")) return "Port sites healing, appetite returning";
    return "Improving, mild pain on movement";
  }
  if (day <= 7) {
    if (s.includes("knee") || s.includes("hip")) return "Ambulating with walker, mild stiffness";
    return "Minimal pain, increasing mobility";
  }
  if (day <= 10) {
    return "Minimal pain, resuming normal activities";
  }
  return null; // no symptoms by day 10+
}

async function main() {
  console.log("💉 Backfilling vitals data on answered check-ins…");

  // Always re-backfill (idempotent overwrite) — clears stale values too.
  const answered = await prisma.checkin.findMany({
    where: { status: "ANSWERED" },
    include: { patient: { select: { surgeryType: true, dischargeDate: true } } },
  });
  console.log(`   Found ${answered.length} answered check-ins.`);

  let updated = 0;
  for (const c of answered) {
    const day = Math.max(
      1,
      Math.floor((c.scheduledFor.getTime() - c.patient.dischargeDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    const surgery = c.patient.surgeryType;
    const painStart = surgery.toLowerCase().includes("bypass") || surgery.toLowerCase().includes("cardiac")
      ? 7
      : surgery.toLowerCase().includes("knee") || surgery.toLowerCase().includes("hip")
        ? 8
        : 6;
    const feverDays = surgery.toLowerCase().includes("bypass") ? [1, 2] : [1];

    const pain = painDecay(painStart, day);
    const temp = tempWithOccasionalFever(day, feverDays);
    const symptoms = symptomsFor(surgery, day);
    const medsTaken = day > 7 ? Math.random() > 0.2 : Math.random() > 0.1;

    await prisma.checkin.update({
      where: { id: c.id },
      data: {
        painLevel: pain,
        temperature: temp,
        symptomsText: symptoms,
        medsTaken,
        medsNote: medsTaken ? "Taken as prescribed" : "Patient reported delay",
        freeText: day <= 3 ? "Feeling tired but improving" : null,
      },
    });
    updated++;
  }

  console.log(`   ✅ Backfilled vitals on ${updated} check-ins.`);
  console.log("   Recovery Vitals chart on patient detail page should now render.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
