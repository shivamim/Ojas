// Ojas — supplementary seed for P0.2 Family Companion + P2.8 DPDP demo data.
// Run with: bunx tsx prisma/seed-family.ts
import { PrismaClient } from "@prisma/client";
import { encryptPII, lookupHash } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding family companion + DPDP demo data...");

  const hospital = await prisma.hospital.findFirst({ where: { slug: "ojas-demo" } });
  if (!hospital) {
    console.error("❌ Ojas Demo Hospital not found. Run `bunx tsx prisma/seed.ts` first.");
    process.exit(1);
  }

  // Pick 5 patients to opt into family companion.
  const patients = await prisma.patient.findMany({
    where: { hospitalId: hospital.id, deletedAt: null },
    take: 5,
    orderBy: { createdAt: "asc" },
  });

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const familyMobile = `+9198${String(10000000 + i * 111111).slice(0, 8)}`;
    const familyName = ["Ramesh Kumar", "Priya Sharma", "Anil Patel", "Sunita Devi", "Vikram Singh"][i];
    const familyRelation = ["son", "daughter", "spouse", "son", "daughter"][i];
    const familyLanguage = (["HINGLISH", "HINDI", "ENGLISH", "TAMIL", "HINGLISH"][i] as "HINGLISH" | "HINDI" | "ENGLISH" | "TAMIL");

    await prisma.patient.update({
      where: { id: p.id },
      data: {
        familyContactEncrypted: encryptPII(familyMobile),
        familyContactHash: lookupHash(familyMobile),
        familyName,
        familyRelation,
        familyLanguage,
        familyOptIn: true,
      },
    });

    // Create a few sample family updates for each patient.
    const updates = [
      {
        type: "DAILY_RECOVERY" as const,
        content: `Namaste ${familyName} ji,\nAaj 3 ka din hai recovery mein.\n✅ Dawa: Aspirin 75mg\n⚡ Taapman: 98.6°F\n🩹 Dard: Kam\n🩺 Wound: theek\n📅 Agla check: kal subah\nKoi problem ho toh reply karein.`,
        status: "DELIVERED" as const,
        sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000),
      },
      {
        type: "DAILY_RECOVERY" as const,
        content: `Namaste ${familyName} ji,\nAaj 2 ka din hai recovery mein.\n✅ Dawa: Aspirin 75mg, Metformin 500mg\n⚡ Taapman: 99.1°F\n🩹 Dard: Madhyam\n🩺 Wound: check karna\n📅 Agla check: aaj shaam\nKoi problem ho toh reply karein.`,
        status: "READ" as const,
        sentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 60000),
        readAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 3600000),
      },
      {
        type: "DAILY_RECOVERY" as const,
        content: `Namaste ${familyName} ji,\nAaj 1 ka din hai recovery mein.\n✅ Dawa: Aspirin 75mg\n⚡ Taapman: 98.4°F\n🩹 Dard: Kam\n🩺 Wound: theek\n📅 Agla check: kal\nKoi problem ho toh reply karein.`,
        status: "QUEUED" as const,
      },
    ];

    for (const u of updates) {
      await prisma.familyUpdate.create({
        data: {
          patientId: p.id,
          hospitalId: hospital.id,
          content: u.content,
          type: u.type,
          status: u.status,
          language: familyLanguage,
          sentAt: u.sentAt ?? null,
          deliveredAt: u.deliveredAt ?? null,
          readAt: u.readAt ?? null,
        },
      });
    }
  }

  // Create a sample breach notification with SLA clock running.
  const existingBreach = await prisma.breachNotification.findFirst({
    where: { hospitalId: hospital.id },
  });
  if (!existingBreach) {
    const detectedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await prisma.breachNotification.create({
      data: {
        hospitalId: hospital.id,
        title: "Test breach: unauthorized access to patient list",
        description: "A hospital admin account accessed the patient list from an unrecognized IP address.",
        affectedDataTypes: "patient_names,mobile_numbers",
        protectiveSteps: "Password reset triggered for the affected account. Audit log reviewed.",
        contactPoint: "dpo@ojas.care",
        detectedAt,
        slaDeadline: new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000),
        status: "PENDING_APPROVAL",
        affectedCount: 10,
      },
    });
    console.log("   ✅ Sample breach notification created (SLA clock running)");
  }

  // Create a sample DSR.
  const existingDsr = await prisma.dpdpRequest.findFirst({ where: { hospitalId: hospital.id } });
  if (!existingDsr && patients.length > 0) {
    await prisma.dpdpRequest.create({
      data: {
        hospitalId: hospital.id,
        patientId: patients[0].id,
        type: "ACCESS",
        status: "IN_REVIEW",
        description: "Patient requested full data access via email",
        slaDeadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      },
    });
    console.log("   ✅ Sample DSR (ACCESS) created with 30-day SLA");
  }

  console.log(`✅ Seeded family companion + DPDP demo data for ${patients.length} patients`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
