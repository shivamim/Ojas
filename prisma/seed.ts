import { PrismaClient, Role, PlanTier, PatientStatus, EscalationStatus, EscalationSeverity, EscalationType, CheckinStatus, NabhAccreditationLevel, MedicationAlertCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptPII, lookupHash } from '../src/lib/crypto';

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// ───────────────────────────────────────────────────────────────────────────
// Main Seed
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting Ojas demo data seeding...\n');

  // ── 1. Hospital ─────────────────────────────────────────────────────────
  console.log('🏥 Creating Ojas Demo Hospital...');
  const hospital = await prisma.hospital.upsert({
    where: { slug: 'ojas-demo' },
    update: {},
    create: {
      name: 'Ojas Demo Hospital',
      slug: 'ojas-demo',
      planTier: PlanTier.GROWTH,
      bedCount: 150,
      nabhAccreditationLevel: NabhAccreditationLevel.FULL_6TH_EDITION,
      country: 'India',
      city: 'Mumbai',
    },
  });
  console.log(`   ✅ Hospital created: ${hospital.name} (${hospital.slug})`);

  // ── 2. Hospital Settings ────────────────────────────────────────────────
  console.log('⚙️  Creating hospital settings...');
  await prisma.hospitalSettings.upsert({
    where: { hospitalId: hospital.id },
    update: {},
    create: {
      hospitalId: hospital.id,
      recoveryWindowDays: 30,
      checkinCadenceHours: 24,
      whatsappEnabled: true,
      emailDigestEnabled: true,
      aiTriageEnabled: true,
      notificationPreferences: JSON.stringify({
        emailDailyDigest: true,
        whatsappDeliveryReports: true,
        escalationAlerts: true,
        checkinReminders: true,
      }),
    },
  });
  console.log('   ✅ Hospital settings created');

  // ── 3. Subscription ───────────────────────────────────────────────────────
  console.log('💳 Creating subscription...');
  const existingSub = await prisma.subscription.findFirst({
    where: { hospitalId: hospital.id },
  });
  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        planTier: PlanTier.GROWTH,
        patientLimit: 500,
        aiEnabled: true,
        status: 'active',
        currentPeriodEnd: daysFromNow(30),
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        hospitalId: hospital.id,
        planTier: PlanTier.GROWTH,
        patientLimit: 500,
        aiEnabled: true,
        status: 'active',
        currentPeriodEnd: daysFromNow(30),
      },
    });
  }
  console.log('   ✅ Subscription created (GROWTH plan, 500 patients)');

  // ── 4. Users ──────────────────────────────────────────────────────────────
  console.log('👤 Creating users...');
  const passwordHash = await hashPassword('ojas321');

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@ojas.care' },
      update: {},
      create: {
        email: 'admin@ojas.care',
        name: 'Super Admin',
        role: Role.SUPER_ADMIN,
        passwordHash,
        hospitalId: null,
      },
    }),
    prisma.user.upsert({
      where: { email: 'hospitaladmin@ojas.care' },
      update: {},
      create: {
        email: 'hospitaladmin@ojas.care',
        name: 'Hospital Admin',
        role: Role.HOSPITAL_ADMIN,
        passwordHash,
        hospitalId: hospital.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'coordinator@ojas.care' },
      update: {},
      create: {
        email: 'coordinator@ojas.care',
        name: 'Care Coordinator',
        role: Role.COORDINATOR,
        passwordHash,
        hospitalId: hospital.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'doctor@ojas.care' },
      update: {},
      create: {
        email: 'doctor@ojas.care',
        name: 'Dr. Rajesh Kumar',
        role: Role.DOCTOR,
        passwordHash,
        hospitalId: hospital.id,
      },
    }),
  ]);

  console.log(`   ✅ Created ${users.length} users:`);
  console.log('      • admin@ojas.care (SUPER_ADMIN)');
  console.log('      • hospitaladmin@ojas.care (HOSPITAL_ADMIN)');
  console.log('      • coordinator@ojas.care (COORDINATOR)');
  console.log('      • doctor@ojas.care (DOCTOR)');
  console.log('      Password: ojas321');

  const [superAdmin, hospitalAdmin, coordinator, doctor] = users;

  // ── 5. Care Pathway Templates ───────────────────────────────────────────
  console.log('📋 Creating care pathway templates...');
  const pathways = await Promise.all([
    prisma.carePathwayTemplate.upsert({
      where: { hospitalId_surgeryType: { hospitalId: hospital.id, surgeryType: 'Coronary Bypass' } },
      update: {},
      create: {
        hospitalId: hospital.id,
        surgeryType: 'Coronary Bypass',
        name: 'CABG Recovery Pathway',
        description: 'Standard post-operative care pathway for Coronary Artery Bypass Graft surgery',
        milestones: JSON.stringify([
          { type: 'FIRST_WALK', label: 'First assisted walk', dayOffset: 1 },
          { type: 'WOUND_CHECK', label: 'Incision site check', dayOffset: 2 },
          { type: 'SUTURE_REMOVAL', label: 'Suture removal', dayOffset: 10 },
          { type: 'PHYSIOTHERAPY', label: 'Start physiotherapy', dayOffset: 3 },
          { type: 'FOLLOW_UP', label: 'Cardiology follow-up', dayOffset: 14 },
        ]),
        isActive: true,
      },
    }),
    prisma.carePathwayTemplate.upsert({
      where: { hospitalId_surgeryType: { hospitalId: hospital.id, surgeryType: 'Knee Replacement' } },
      update: {},
      create: {
        hospitalId: hospital.id,
        surgeryType: 'Knee Replacement',
        name: 'Total Knee Replacement Recovery',
        description: 'Post-operative care pathway for total knee arthroplasty',
        milestones: JSON.stringify([
          { type: 'FIRST_WALK', label: 'First assisted walk', dayOffset: 1 },
          { type: 'WOUND_CHECK', label: 'Incision site check', dayOffset: 3 },
          { type: 'STAPLE_REMOVAL', label: 'Staple removal', dayOffset: 14 },
          { type: 'PHYSIOTHERAPY', label: 'Physiotherapy sessions', dayOffset: 2 },
          { type: 'FOLLOW_UP', label: 'Orthopedic follow-up', dayOffset: 21 },
        ]),
        isActive: true,
      },
    }),
    prisma.carePathwayTemplate.upsert({
      where: { hospitalId_surgeryType: { hospitalId: hospital.id, surgeryType: 'Appendectomy' } },
      update: {},
      create: {
        hospitalId: hospital.id,
        surgeryType: 'Appendectomy',
        name: 'Appendectomy Recovery',
        description: 'Standard recovery pathway for laparoscopic appendectomy',
        milestones: JSON.stringify([
          { type: 'FIRST_WALK', label: 'First walk', dayOffset: 0 },
          { type: 'WOUND_CHECK', label: 'Wound check', dayOffset: 5 },
          { type: 'FOLLOW_UP', label: 'Surgeon follow-up', dayOffset: 10 },
        ]),
        isActive: true,
      },
    }),
  ]);
  console.log(`   ✅ Created ${pathways.length} care pathway templates`);

  // ── 6. Demo Patients ────────────────────────────────────────────────────
  console.log('👥 Creating demo patients...');
  const patientData = [
    { fullName: 'Ramesh Sharma', age: 58, gender: 'Male', mobile: '+919876543210', surgeryType: 'Coronary Bypass', comorbidities: 'Diabetes, Hypertension' },
    { fullName: 'Sunita Devi', age: 62, gender: 'Female', mobile: '+919876543211', surgeryType: 'Knee Replacement', comorbidities: 'Osteoarthritis' },
    { fullName: 'Mohammad Ali', age: 45, gender: 'Male', mobile: '+919876543212', surgeryType: 'Appendectomy', comorbidities: null },
    { fullName: 'Lakshmi Narayan', age: 71, gender: 'Female', mobile: '+919876543213', surgeryType: 'Coronary Bypass', comorbidities: 'Hypertension, CAD' },
    { fullName: 'Vikram Singh', age: 35, gender: 'Male', mobile: '+919876543214', surgeryType: 'Knee Replacement', comorbidities: 'Sports injury' },
    { fullName: 'Anita Patel', age: 52, gender: 'Female', mobile: '+919876543215', surgeryType: 'Appendectomy', comorbidities: 'Obesity' },
    { fullName: 'Krishnan Iyer', age: 68, gender: 'Male', mobile: '+919876543216', surgeryType: 'Coronary Bypass', comorbidities: 'Diabetes, CKD' },
    { fullName: 'Meera Reddy', age: 41, gender: 'Female', mobile: '+919876543217', surgeryType: 'Knee Replacement', comorbidities: 'RA' },
    { fullName: 'Arjun Kapoor', age: 29, gender: 'Male', mobile: '+919876543218', surgeryType: 'Appendectomy', comorbidities: null },
    { fullName: 'Kamala Das', age: 75, gender: 'Female', mobile: '+919876543219', surgeryType: 'Coronary Bypass', comorbidities: 'Hypertension, AFib' },
  ];

  const patients: any[] = [];
  for (const data of patientData) {
    const dischargeDate = daysAgo(Math.floor(Math.random() * 20) + 5);
    const surgeryDate = new Date(dischargeDate);
    surgeryDate.setDate(surgeryDate.getDate() - (Math.floor(Math.random() * 5) + 3));

    const patient = await prisma.patient.upsert({
      where: { mobileHash: lookupHash(data.mobile) },
      update: {},
      create: {
        hospitalId: hospital.id,
        fullName: data.fullName,
        age: data.age,
        gender: data.gender,
        mobileEncrypted: encryptPII(data.mobile),
        mobileHash: lookupHash(data.mobile),
        addressEncrypted: encryptPII(`${data.fullName}, Ward ${Math.floor(Math.random() * 10) + 1}, Room ${Math.floor(Math.random() * 50) + 1}`),
        nextOfKinContactEncrypted: encryptPII(`+91${Math.floor(Math.random() * 9000000000) + 1000000000}`),
        nextOfKinName: `${data.fullName.split(' ')[0]} (Spouse)`,
        uhid: `UHID-${Math.floor(Math.random() * 900000) + 100000}`,
        dateOfBirth: new Date(new Date().getFullYear() - data.age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        surgeryType: data.surgeryType,
        surgeryDate: surgeryDate,
        dischargeDate: dischargeDate,
        comorbidities: data.comorbidities,
        status: PatientStatus.ACTIVE,
        dpdpaConsent: true,
        consentAt: new Date(),
        enrolledById: coordinator.id,
        riskLevel: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)] as 'LOW' | 'MEDIUM' | 'HIGH',
        riskScore: Math.floor(Math.random() * 40) + 30,
        riskAssessedAt: new Date(),
      },
    });
    patients.push(patient);
  }
  console.log(`   ✅ Created ${patients.length} demo patients`);

  // ── 7. Medications ────────────────────────────────────────────────────────
  console.log('💊 Creating medications...');
  const medicationTemplates: Record<string, { name: string; dosage: string; frequency: string; isHighAlert: boolean }[]> = {
    'Coronary Bypass': [
      { name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', isHighAlert: false },
      { name: 'Clopidogrel', dosage: '75mg', frequency: 'Once daily', isHighAlert: false },
      { name: 'Atorvastatin', dosage: '40mg', frequency: 'Once daily at bedtime', isHighAlert: false },
      { name: 'Metoprolol', dosage: '25mg', frequency: 'Twice daily', isHighAlert: false },
      { name: 'Enoxaparin', dosage: '40mg', frequency: 'Once daily SC', isHighAlert: true },
    ],
    'Knee Replacement': [
      { name: 'Tramadol', dosage: '50mg', frequency: 'Every 6 hours PRN', isHighAlert: true },
      { name: 'Pantoprazole', dosage: '40mg', frequency: 'Once daily', isHighAlert: false },
      { name: 'Rivaroxaban', dosage: '10mg', frequency: 'Once daily', isHighAlert: true },
      { name: 'Paracetamol', dosage: '650mg', frequency: 'Every 8 hours', isHighAlert: false },
    ],
    'Appendectomy': [
      { name: 'Cefixime', dosage: '200mg', frequency: 'Twice daily', isHighAlert: false },
      { name: 'Paracetamol', dosage: '500mg', frequency: 'Every 6 hours PRN', isHighAlert: false },
      { name: 'Pantoprazole', dosage: '20mg', frequency: 'Once daily', isHighAlert: false },
    ],
  };

  let medCount = 0;
  for (const patient of patients) {
    const meds = medicationTemplates[patient.surgeryType] || medicationTemplates['Appendectomy'];
    for (const med of meds) {
      await prisma.medication.create({
        data: {
          hospitalId: hospital.id,
          patientId: patient.id,
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          startDate: patient.dischargeDate,
          endDate: daysFromNow(14),
          status: 'ACTIVE',
          isHighAlert: med.isHighAlert,
          alertCategory: med.isHighAlert ? MedicationAlertCategory.HIGH_ALERT : MedicationAlertCategory.STANDARD,
        },
      });
      medCount++;
    }
  }
  console.log(`   ✅ Created ${medCount} medication records`);

  // ── 8. Milestones ───────────────────────────────────────────────────────
  console.log('📅 Creating milestones...');
  const milestoneTemplates: Record<string, { type: string; label: string; dayOffset: number }[]> = {
    'Coronary Bypass': [
      { type: 'FIRST_WALK', label: 'First assisted walk', dayOffset: 1 },
      { type: 'WOUND_CHECK', label: 'Incision site check', dayOffset: 2 },
      { type: 'SUTURE_REMOVAL', label: 'Suture removal', dayOffset: 10 },
      { type: 'PHYSIOTHERAPY', label: 'Start physiotherapy', dayOffset: 3 },
      { type: 'FOLLOW_UP', label: 'Cardiology follow-up', dayOffset: 14 },
    ],
    'Knee Replacement': [
      { type: 'FIRST_WALK', label: 'First assisted walk', dayOffset: 1 },
      { type: 'WOUND_CHECK', label: 'Incision site check', dayOffset: 3 },
      { type: 'STAPLE_REMOVAL', label: 'Staple removal', dayOffset: 14 },
      { type: 'PHYSIOTHERAPY', label: 'Physiotherapy sessions', dayOffset: 2 },
      { type: 'FOLLOW_UP', label: 'Orthopedic follow-up', dayOffset: 21 },
    ],
    'Appendectomy': [
      { type: 'FIRST_WALK', label: 'First walk', dayOffset: 0 },
      { type: 'WOUND_CHECK', label: 'Wound check', dayOffset: 5 },
      { type: 'FOLLOW_UP', label: 'Surgeon follow-up', dayOffset: 10 },
    ],
  };

  let milestoneCount = 0;
  for (const patient of patients) {
    const milestones = milestoneTemplates[patient.surgeryType] || milestoneTemplates['Appendectomy'];
    for (const ms of milestones) {
      const targetDate = new Date(patient.dischargeDate);
      targetDate.setDate(targetDate.getDate() + ms.dayOffset);
      const completed = ms.dayOffset < 5 && Math.random() > 0.3;

      await prisma.milestone.create({
        data: {
          hospitalId: hospital.id,
          patientId: patient.id,
          type: ms.type,
          label: ms.label,
          targetDate,
          completedAt: completed ? daysAgo(Math.floor(Math.random() * 3)) : null,
          status: completed ? 'COMPLETED' : 'PENDING',
          notes: completed ? 'Completed successfully' : null,
        },
      });
      milestoneCount++;
    }
  }
  console.log(`   ✅ Created ${milestoneCount} milestones`);

  // ── 9. Check-ins ──────────────────────────────────────────────────────────
  console.log('📱 Creating check-ins...');
  let checkinCount = 0;
  for (const patient of patients) {
    const checkinCountForPatient = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < checkinCountForPatient; i++) {
      const scheduledAt = daysAgo(i * 2 + 1);
      const answered = Math.random() > 0.2;
      const checkin = await prisma.checkin.create({
        data: {
          hospitalId: hospital.id,
          patientId: patient.id,
          status: answered ? CheckinStatus.ANSWERED : CheckinStatus.MISSED,
          scheduledFor: scheduledAt,
          answeredAt: answered ? new Date(scheduledAt.getTime() + 1000 * 60 * 30) : null,
          aiRiskLevel: answered ? (Math.random() > 0.7 ? 'ESCALATE' : 'NORMAL') : null,
          aiRiskScore: answered ? Math.random() * 0.4 + 0.6 : null,
        },
      });
      checkinCount++;

      if (answered && checkin.aiRiskLevel === 'ESCALATE' && Math.random() > 0.5) {
        await prisma.escalation.create({
          data: {
            hospitalId: hospital.id,
            patientId: patient.id,
            status: EscalationStatus.OPEN,
            severity: EscalationSeverity.MEDIUM,
            type: EscalationType.CLINICAL,
            reason: `AI triage flagged patient ${patient.fullName} for review`,
            assignedToId: doctor.id,
            resolvedAt: null,
            aiProposed: true,
          },
        });
      }
    }
  }
  console.log(`   ✅ Created ${checkinCount} check-ins`);

  // ── 10. Escalations ─────────────────────────────────────────────────────
  console.log('🚨 Creating escalations...');
  let escalationCount = 0;
  const escalationTypes = [
    { type: EscalationType.CLINICAL, severity: EscalationSeverity.LOW, desc: 'Patient missed scheduled check-in' },
    { type: EscalationType.CLINICAL, severity: EscalationSeverity.HIGH, desc: 'Patient reported severe pain (8/10)' },
    { type: EscalationType.CLINICAL, severity: EscalationSeverity.MEDIUM, desc: 'Patient reported wound drainage' },
    { type: EscalationType.CLINICAL, severity: EscalationSeverity.MEDIUM, desc: 'Nausea and dizziness after medication' },
  ];

  for (let i = 0; i < 5; i++) {
    const patient = patients[Math.floor(Math.random() * patients.length)];
    const esc = escalationTypes[Math.floor(Math.random() * escalationTypes.length)];
    const isResolved = Math.random() > 0.5;

    await prisma.escalation.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        status: isResolved ? EscalationStatus.RESOLVED : EscalationStatus.OPEN,
        severity: esc.severity,
        type: esc.type,
        reason: esc.desc,
        assignedToId: doctor.id,
        resolvedAt: isResolved ? daysAgo(Math.floor(Math.random() * 3)) : null,
        resolution: isResolved ? 'Issue resolved via teleconsultation' : null,
        aiProposed: false,
      },
    });
    escalationCount++;
  }
  console.log(`   ✅ Created ${escalationCount} escalations`);

  // ── 11. Timeline Events ─────────────────────────────────────────────────
  console.log('📜 Creating timeline events...');
  let timelineCount = 0;
  const eventTypes = [
    { type: 'CHECKIN', title: 'Daily Check-in Completed', desc: 'Patient completed daily wellness check-in' },
    { type: 'MEDICATION', title: 'Medication Reminder Sent', desc: 'WhatsApp medication reminder delivered' },
    { type: 'ESCALATION', title: 'Escalation Triggered', desc: 'Care team notified of patient concern' },
    { type: 'MILESTONE', title: 'Milestone Achieved', desc: 'Patient reached recovery milestone' },
    { type: 'FOLLOW_UP', title: 'Follow-up Scheduled', desc: 'Teleconsultation appointment booked' },
  ];

  for (const patient of patients) {
    const eventCount = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < eventCount; i++) {
      const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      await prisma.timelineEvent.create({
        data: {
          hospitalId: hospital.id,
          patientId: patient.id,
          eventType: evt.type,
          title: evt.title,
          detail: evt.desc,
        },
      });
      timelineCount++;
    }
  }
  console.log(`   ✅ Created ${timelineCount} timeline events`);

  // ── 12. Consent Records ─────────────────────────────────────────────────
  console.log('📝 Creating consent records...');
  let consentCount = 0;
  const consentPurposes = ['TREATMENT', 'DATA_PROCESSING', 'TELECONSULT', 'WHATSAPP_COMMUNICATION'];
  for (const patient of patients) {
    for (const purpose of consentPurposes) {
      await prisma.consentRecord.create({
        data: {
          hospitalId: hospital.id,
          patientId: patient.id,
          purpose,
          consentTextVersion: 'v2.1',
          grantedAt: patient.consentAt || new Date(),
          ip: '192.168.1.100',
        },
      });
      consentCount++;
    }
  }
  console.log(`   ✅ Created ${consentCount} consent records`);

  // ── 13. Follow-up Plans ───────────────────────────────────────────────────
  console.log('📆 Creating follow-up plans...');
  let followUpCount = 0;
  for (const patient of patients) {
    const followUpDate = daysFromNow(Math.floor(Math.random() * 14) + 7);
    await prisma.followUpPlan.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        plannedDate: followUpDate,
        mode: ['IN_PERSON', 'TELECONSULT', 'CALL'][Math.floor(Math.random() * 3)],
        responsibleClinician: doctor.name,
        notes: 'Routine post-operative follow-up',
        status: 'SCHEDULED',
      },
    });
    followUpCount++;
  }
  console.log(`   ✅ Created ${followUpCount} follow-up plans`);

  // ── 14. Discharge Summaries ─────────────────────────────────────────────
  console.log('📄 Creating discharge summaries...');
  let dischargeSummaryCount = 0;
  for (const patient of patients) {
    const diagnosis =
      patient.surgeryType === 'Coronary Bypass'
        ? 'Coronary Artery Disease'
        : patient.surgeryType === 'Knee Replacement'
        ? 'Osteoarthritis'
        : 'Acute Appendicitis';

    await prisma.dischargeSummaryRecord.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        diagnosis,
        proceduresPerformed: JSON.stringify([patient.surgeryType]),
        medicationsOnDischarge: JSON.stringify(['Aspirin', 'Pain relief', 'Antibiotics']),
        followUpInstructions: 'Take medications as prescribed. Keep wound clean and dry. Report any fever or excessive pain immediately.',
        conditionAtDischarge: 'Stable',
        dietaryInstructions: 'Low salt diet, high protein intake for wound healing',
        activityRestrictions:
          patient.surgeryType === 'Coronary Bypass'
            ? 'No heavy lifting for 6 weeks'
            : patient.surgeryType === 'Knee Replacement'
            ? 'Use walker for 2 weeks'
            : 'Light activity for 1 week',
        warningSigns: 'Fever > 100°F, excessive bleeding, severe pain, shortness of breath',
        emergencyContact: '+91-22-1234-5678',
        attendingDoctorName: doctor.name,
      },
    });
    dischargeSummaryCount++;
  }
  console.log(`   ✅ Created ${dischargeSummaryCount} discharge summary records`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n✅ Seeding completed successfully!\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🏥 Hospital: ${hospital.name}`);
  console.log(`👥 Users: ${users.length} (including Super Admin)`);
  console.log(`🧑‍🤝‍🧑 Patients: ${patients.length}`);
  console.log(`💊 Medications: ${medCount}`);
  console.log(`📅 Milestones: ${milestoneCount}`);
  console.log(`📱 Check-ins: ${checkinCount}`);
  console.log(`🚨 Escalations: ${escalationCount}`);
  console.log(`📜 Timeline Events: ${timelineCount}`);
  console.log(`📝 Consent Records: ${consentCount}`);
  console.log(`📆 Follow-up Plans: ${followUpCount}`);
  console.log(`📄 Discharge Summaries: ${dischargeSummaryCount}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
