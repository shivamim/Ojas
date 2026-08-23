-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'COORDINATOR', 'DOCTOR');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PILOT', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "FamilyLanguage" AS ENUM ('HINGLISH', 'HINDI', 'ENGLISH', 'TAMIL', 'TELUGU', 'MARATHI', 'BENGALI');

-- CreateEnum
CREATE TYPE "FamilyUpdateType" AS ENUM ('DAILY_RECOVERY', 'MEDICATION_REMINDER', 'APPOINTMENT_ALERT', 'ESCALATION_NOTICE', 'MILESTONE_ACHIEVED');

-- CreateEnum
CREATE TYPE "DpdpRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'GRIEVANCE');

-- CreateEnum
CREATE TYPE "DpdpRequestStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GROQ', 'BEDROCK', 'RULE_BASED');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ENROLLED', 'ACTIVE', 'RECOVERED', 'READMITTED', 'LOST_TO_FOLLOWUP');

-- CreateEnum
CREATE TYPE "LostToFollowupReason" AS ENUM ('UNREACHABLE', 'REFUSED', 'TRANSFERRED', 'DECEASED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EscalationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EscalationType" AS ENUM ('CLINICAL', 'GRIEVANCE');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('SCHEDULED', 'SENT', 'ANSWERED', 'MISSED');

-- CreateEnum
CREATE TYPE "NabhAccreditationLevel" AS ENUM ('ENTRY_LEVEL', 'FULL_6TH_EDITION', 'PRE_ACCREDITATION', 'NOT_ACCREDITED');

-- CreateEnum
CREATE TYPE "MedicationAlertCategory" AS ENUM ('STANDARD', 'HIGH_ALERT');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('AUTO_APPLIED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'OVERRIDDEN', 'FAILED', 'FALLBACK');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SENDING', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "PmjayProviderMode" AS ENUM ('MANUAL_PORTAL', 'STATE_API', 'OFFICIAL_API', 'SANDBOX', 'LOCAL');

-- CreateEnum
CREATE TYPE "HemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WasaAuditStatus" AS ENUM ('NOT_STARTED', 'SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReadinessStatus" AS ENUM ('MISSING', 'CONFIGURED', 'PENDING_VERIFICATION', 'VERIFIED', 'EXPIRED', 'EXPIRING_SOON');

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "planTier" "PlanTier" NOT NULL DEFAULT 'STARTER',
    "bedCount" INTEGER NOT NULL DEFAULT 0,
    "nabhLevel" TEXT,
    "nabhAccreditationLevel" "NabhAccreditationLevel" NOT NULL DEFAULT 'NOT_ACCREDITED',
    "country" TEXT NOT NULL DEFAULT 'India',
    "city" TEXT,
    "hfrId" TEXT,
    "pmjayFacilityId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalSettings" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "recoveryWindowDays" INTEGER NOT NULL DEFAULT 14,
    "checkinCadenceHours" INTEGER NOT NULL DEFAULT 24,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiTriageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notificationPreferences" TEXT NOT NULL DEFAULT '{"emailDailyDigest":true,"whatsappDeliveryReports":false,"escalationAlerts":true,"checkinReminders":true}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'COORDINATOR',
    "passwordHash" TEXT NOT NULL,
    "forceReset" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionToken" TEXT,
    "hospitalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "mobileEncrypted" TEXT NOT NULL,
    "mobileHash" TEXT NOT NULL,
    "addressEncrypted" TEXT,
    "nextOfKinContactEncrypted" TEXT,
    "nextOfKinName" TEXT,
    "uhid" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "surgeryType" TEXT NOT NULL,
    "surgeryDate" TIMESTAMP(3) NOT NULL,
    "dischargeDate" TIMESTAMP(3) NOT NULL,
    "comorbidities" TEXT,
    "lostToFollowupReason" "LostToFollowupReason",
    "status" "PatientStatus" NOT NULL DEFAULT 'ENROLLED',
    "dpdpaConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "enrolledById" TEXT NOT NULL,
    "familyContactEncrypted" TEXT,
    "familyContactHash" TEXT,
    "familyLanguage" "FamilyLanguage" NOT NULL DEFAULT 'HINGLISH',
    "familyOptIn" BOOLEAN NOT NULL DEFAULT false,
    "familyName" TEXT,
    "familyRelation" TEXT,
    "deletedAt" TIMESTAMP(3),
    "riskLevel" TEXT,
    "riskScore" INTEGER,
    "riskAssessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachNotification" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedDataTypes" TEXT NOT NULL,
    "protectiveSteps" TEXT NOT NULL,
    "contactPoint" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "dpbNotifiedAt" TIMESTAMP(3),
    "affectedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreachNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DischargeSummaryRecord" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "proceduresPerformed" TEXT,
    "medicationsOnDischarge" TEXT,
    "followUpInstructions" TEXT,
    "conditionAtDischarge" TEXT NOT NULL,
    "dietaryInstructions" TEXT,
    "activityRestrictions" TEXT,
    "warningSigns" TEXT,
    "emergencyContact" TEXT,
    "attendingDoctorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DischargeSummaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpPlan" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "responsibleClinician" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "careQuality" INTEGER,
    "communication" INTEGER,
    "responsiveness" INTEGER,
    "wouldRecommend" BOOLEAN,
    "freeText" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isHighAlert" BOOLEAN NOT NULL DEFAULT false,
    "alertCategory" "MedicationAlertCategory" NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DischargeChecklist" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DischargeChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "status" "CheckinStatus" NOT NULL DEFAULT 'SCHEDULED',
    "painLevel" INTEGER,
    "temperature" DOUBLE PRECISION,
    "symptomsText" TEXT,
    "freeText" TEXT,
    "medsTaken" BOOLEAN,
    "medsNote" TEXT,
    "aiRiskScore" DOUBLE PRECISION,
    "aiRiskLevel" TEXT,
    "aiRationale" TEXT,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "checkinId" TEXT,
    "severity" "EscalationSeverity" NOT NULL DEFAULT 'LOW',
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "type" "EscalationType" NOT NULL DEFAULT 'CLINICAL',
    "reason" TEXT NOT NULL,
    "aiProposed" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "aiRationale" TEXT,
    "assignedToId" TEXT,
    "resolution" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "fieldPath" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL DEFAULT 'STARTER',
    "patientLimit" INTEGER NOT NULL DEFAULT 50,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentRun" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "promptRef" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "outcome" "AiOutcome" NOT NULL DEFAULT 'AUTO_APPLIED',
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "checkinId" TEXT,
    "provider" "AiProvider" NOT NULL DEFAULT 'GROQ',
    "primaryProvider" "AiProvider" NOT NULL DEFAULT 'GROQ',
    "fallbackReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "toAddress" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "checkinId" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePathwayTemplate" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "surgeryType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "milestones" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePathwayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyUpdate" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "FamilyUpdateType" NOT NULL DEFAULT 'DAILY_RECOVERY',
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "language" "FamilyLanguage" NOT NULL DEFAULT 'HINGLISH',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'DOCTOR',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentVersion" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DpdpRequest" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "DpdpRequestType" NOT NULL,
    "status" "DpdpRequestStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "response" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DpdpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotStudy" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "patientCount" INTEGER NOT NULL DEFAULT 0,
    "controlCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PilotStatus" NOT NULL DEFAULT 'ACTIVE',
    "readmissionRateWithOjas" DOUBLE PRECISION,
    "readmissionRateWithoutOjas" DOUBLE PRECISION,
    "medicationAdherenceRate" DOUBLE PRECISION,
    "patientSatisfactionScore" DOUBLE PRECISION,
    "responseRate" DOUBLE PRECISION,
    "escalationCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalIntegrationProfile" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hfrId" TEXT,
    "pmjayFacilityId" TEXT,
    "shaCode" TEXT,
    "stateHealthAgencyCode" TEXT,
    "hemStatus" "HemStatus" DEFAULT 'NOT_STARTED',
    "hemLinked" BOOLEAN,
    "wasaAuditStatus" "WasaAuditStatus" DEFAULT 'NOT_STARTED',
    "wasaAuditDate" TIMESTAMP(3),
    "safeToHostCertRef" TEXT,
    "safeToHostCertificateRef" TEXT,
    "certExpiryDate" TIMESTAMP(3),
    "certificateExpiryDate" TIMESTAMP(3),
    "certificationStatus" TEXT,
    "abdmMode" TEXT,
    "abhaMode" TEXT,
    "hfrVerified" BOOLEAN NOT NULL DEFAULT false,
    "pmjayEmpanelmentVerified" BOOLEAN NOT NULL DEFAULT false,
    "ojasFacilityMappingComplete" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT,
    "district" TEXT,
    "notes" TEXT,
    "nhcxParticipantCode" TEXT,
    "nhcxMode" TEXT,
    "gateSandboxConfigured" BOOLEAN NOT NULL DEFAULT false,
    "gateSandboxVerified" BOOLEAN NOT NULL DEFAULT false,
    "gatePartnerOnboardingVerified" BOOLEAN NOT NULL DEFAULT false,
    "gateCertificatesVerified" BOOLEAN NOT NULL DEFAULT false,
    "gateProductionEndpointVerified" BOOLEAN NOT NULL DEFAULT false,
    "gateProductionConnectivityVerified" BOOLEAN NOT NULL DEFAULT false,
    "gateLiveApproved" BOOLEAN NOT NULL DEFAULT false,
    "sandboxConfiguredAt" TIMESTAMP(3),
    "sandboxVerifiedAt" TIMESTAMP(3),
    "productionOnboardingStartedAt" TIMESTAMP(3),
    "productionReadyAt" TIMESTAMP(3),
    "liveApprovedAt" TIMESTAMP(3),
    "pmjayMode" "PmjayProviderMode",
    "overallReadiness" TEXT DEFAULT 'NOT_READY',
    "readinessLastEval" TIMESTAMP(3),

    CONSTRAINT "HospitalIntegrationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbhaIdentity" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "abhaNumber" TEXT,
    "abhaAddress" TEXT,
    "verificationStatus" TEXT NOT NULL,
    "verificationSource" TEXT,
    "verificationOtpRef" TEXT,
    "abdmOtpTxnId" TEXT,
    "abdmResponseRaw" TEXT,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT false,
    "nameAsPerAbha" TEXT,
    "genderAsPerAbha" TEXT,
    "yearOfBirthAsPerAbha" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "reconciliationResult" TEXT,
    "reconciliationOverrideReason" TEXT,
    "reconciliationTimestamp" TIMESTAMP(3),
    "reconciliationActor" TEXT,
    "pmjayEligible" BOOLEAN,
    "pmjayEligibilitySource" TEXT,
    "pmjayVerifiedAt" TIMESTAMP(3),
    "pmjayFamilyId" TEXT,
    "pmjayCardNo" TEXT,
    "pmjayBalance" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbhaIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhcxClaim" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "abhaIdentityId" TEXT,
    "claimId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "packageCode" TEXT,
    "packageName" TEXT,
    "estimatedAmount" DECIMAL(65,30),
    "approvedAmount" DECIMAL(65,30),
    "patientShare" DECIMAL(65,30),
    "sandboxMode" BOOLEAN NOT NULL DEFAULT false,
    "integrationSource" TEXT,
    "submittedAt" TIMESTAMP(3),
    "preAuthDeadlineAt" TIMESTAMP(3),
    "finalAuthDeadlineAt" TIMESTAMP(3),
    "preAuthBreached" BOOLEAN NOT NULL DEFAULT false,
    "finalAuthBreached" BOOLEAN NOT NULL DEFAULT false,
    "fhirClaimBundleRef" TEXT,
    "fhirPreauthResponse" TEXT,
    "fhirClaimResponse" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NhcxClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhcxCoverageEligibility" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "abhaIdentityId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "providerFacilityId" TEXT NOT NULL,
    "serviceType" TEXT,
    "eligible" BOOLEAN,
    "eligibleAmount" DOUBLE PRECISION,
    "fhirRequest" TEXT,
    "fhirRequestHash" TEXT,
    "fhirResponse" TEXT,
    "fhirResponseHash" TEXT,
    "fhirProfileVersion" TEXT,
    "environmentState" TEXT,
    "source" TEXT,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NhcxCoverageEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhcxCommunication" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "claimId" TEXT,
    "coverageEligibilityId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "payload" TEXT,
    "payloadHash" TEXT,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "environmentState" TEXT,
    "source" TEXT,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NhcxCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTransaction" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "claimId" TEXT,
    "integration" TEXT NOT NULL,
    "payer" TEXT,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "externalReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responseHash" TEXT,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NabhEvidence" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "standardCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "evidenceSource" TEXT,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "fileMimeType" TEXT,
    "autoCount" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "gapDescription" TEXT,
    "correctiveAction" TEXT,
    "correctiveOwner" TEXT,
    "correctiveDueDate" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NabhEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedClaim" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "payerProfileId" TEXT,
    "routedVia" TEXT,
    "diagnosis" TEXT,
    "packageCode" TEXT,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "claimedAmount" DECIMAL(65,30),
    "completenessStatus" TEXT,
    "completenessMissingItems" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormalizedClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerProfile" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "payerCode" TEXT NOT NULL,
    "payerName" TEXT,
    "nhcxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayBeneficiary" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "abhaIdentityId" TEXT,
    "beneficiaryReference" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verificationMethod" TEXT,
    "verificationSource" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "externalTxnId" TEXT,
    "rawResponse" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "eligibilityCategory" TEXT,
    "isInterStatePortability" BOOLEAN NOT NULL DEFAULT false,
    "homeState" TEXT,
    "treatmentState" TEXT,
    "coveragePool" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "canUseForBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayPreauth" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "beneficiaryId" TEXT NOT NULL,
    "packageId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3),
    "diagnosis" TEXT,
    "documents" TEXT,
    "packageAmount" DECIMAL(65,30),
    "estimatedAmount" DECIMAL(65,30),
    "providerMode" TEXT,
    "source" TEXT,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "externalTxnId" TEXT,
    "rawResponse" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayPreauth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayClaim" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "patientId" TEXT,
    "beneficiaryId" TEXT NOT NULL,
    "packageId" TEXT,
    "preauthId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dischargeDate" TIMESTAMP(3),
    "documents" TEXT,
    "packageAmount" DECIMAL(65,30),
    "claimedAmount" DECIMAL(65,30),
    "approvedAmount" DECIMAL(65,30),
    "deductionAmount" DECIMAL(65,30),
    "patientShare" DECIMAL(65,30),
    "settledAmount" DECIMAL(65,30),
    "rejectionReason" TEXT,
    "externalClaimId" TEXT,
    "rawResponse" TEXT,
    "settledAt" TIMESTAMP(3),
    "providerMode" TEXT,
    "source" TEXT,
    "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
    "queryReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayDocument" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "pmjayClaimId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "name" TEXT,
    "storageRef" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayQuery" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "claimId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "request" TEXT,
    "response" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "documents" TEXT,
    "actorId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmjayPackage" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "packageCode" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "preauthRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PmjayPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimDocumentRequirement" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "packageId" TEXT,
    "documentType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSettings_hospitalId_key" ON "HospitalSettings"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_sessionToken_key" ON "User"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mobileHash_key" ON "Patient"("mobileHash");

-- CreateIndex
CREATE UNIQUE INDEX "DischargeSummaryRecord_patientId_key" ON "DischargeSummaryRecord"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_patientId_key" ON "SatisfactionSurvey"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "CarePathwayTemplate_hospitalId_surgeryType_key" ON "CarePathwayTemplate"("hospitalId", "surgeryType");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyUpdate_providerMessageId_key" ON "FamilyUpdate"("providerMessageId");

-- CreateIndex
CREATE INDEX "FamilyUpdate_hospitalId_status_idx" ON "FamilyUpdate"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "FamilyUpdate_patientId_createdAt_idx" ON "FamilyUpdate"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineShare_token_key" ON "TimelineShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineShare_tokenHash_key" ON "TimelineShare"("tokenHash");

-- CreateIndex
CREATE INDEX "TimelineShare_patientId_idx" ON "TimelineShare"("patientId");

-- CreateIndex
CREATE INDEX "ConsentVersion_purpose_effectiveAt_idx" ON "ConsentVersion"("purpose", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentVersion_purpose_version_key" ON "ConsentVersion"("purpose", "version");

-- CreateIndex
CREATE INDEX "DpdpRequest_hospitalId_status_idx" ON "DpdpRequest"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PilotStudy_hospitalId_key" ON "PilotStudy"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalIntegrationProfile_hospitalId_key" ON "HospitalIntegrationProfile"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalIntegrationProfile_hospitalId_idx" ON "HospitalIntegrationProfile"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalIntegrationProfile_pmjayMode_idx" ON "HospitalIntegrationProfile"("pmjayMode");

-- CreateIndex
CREATE UNIQUE INDEX "AbhaIdentity_patientId_key" ON "AbhaIdentity"("patientId");

-- CreateIndex
CREATE INDEX "AbhaIdentity_hospitalId_idx" ON "AbhaIdentity"("hospitalId");

-- CreateIndex
CREATE INDEX "AbhaIdentity_patientId_idx" ON "AbhaIdentity"("patientId");

-- CreateIndex
CREATE INDEX "AbhaIdentity_abhaNumber_idx" ON "AbhaIdentity"("abhaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "NhcxClaim_claimId_key" ON "NhcxClaim"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "NhcxClaim_clientRequestId_key" ON "NhcxClaim"("clientRequestId");

-- CreateIndex
CREATE INDEX "NhcxClaim_hospitalId_idx" ON "NhcxClaim"("hospitalId");

-- CreateIndex
CREATE INDEX "NhcxClaim_patientId_idx" ON "NhcxClaim"("patientId");

-- CreateIndex
CREATE INDEX "NhcxClaim_status_idx" ON "NhcxClaim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NhcxCoverageEligibility_clientRequestId_key" ON "NhcxCoverageEligibility"("clientRequestId");

-- CreateIndex
CREATE INDEX "NhcxCoverageEligibility_hospitalId_idx" ON "NhcxCoverageEligibility"("hospitalId");

-- CreateIndex
CREATE INDEX "NhcxCoverageEligibility_patientId_idx" ON "NhcxCoverageEligibility"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "NhcxCommunication_clientRequestId_key" ON "NhcxCommunication"("clientRequestId");

-- CreateIndex
CREATE INDEX "NhcxCommunication_hospitalId_idx" ON "NhcxCommunication"("hospitalId");

-- CreateIndex
CREATE INDEX "NhcxCommunication_patientId_idx" ON "NhcxCommunication"("patientId");

-- CreateIndex
CREATE INDEX "NhcxCommunication_claimId_idx" ON "NhcxCommunication"("claimId");

-- CreateIndex
CREATE INDEX "ExternalTransaction_hospitalId_idx" ON "ExternalTransaction"("hospitalId");

-- CreateIndex
CREATE INDEX "ExternalTransaction_patientId_idx" ON "ExternalTransaction"("patientId");

-- CreateIndex
CREATE INDEX "ExternalTransaction_integration_externalTransactionId_idx" ON "ExternalTransaction"("integration", "externalTransactionId");

-- CreateIndex
CREATE INDEX "NabhEvidence_hospitalId_idx" ON "NabhEvidence"("hospitalId");

-- CreateIndex
CREATE INDEX "NabhEvidence_status_idx" ON "NabhEvidence"("status");

-- CreateIndex
CREATE INDEX "NormalizedClaim_hospitalId_idx" ON "NormalizedClaim"("hospitalId");

-- CreateIndex
CREATE INDEX "NormalizedClaim_patientId_idx" ON "NormalizedClaim"("patientId");

-- CreateIndex
CREATE INDEX "PayerProfile_hospitalId_idx" ON "PayerProfile"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayBeneficiary_hospitalId_idx" ON "PmjayBeneficiary"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayBeneficiary_patientId_idx" ON "PmjayBeneficiary"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PmjayPreauth_clientRequestId_key" ON "PmjayPreauth"("clientRequestId");

-- CreateIndex
CREATE INDEX "PmjayPreauth_hospitalId_idx" ON "PmjayPreauth"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayPreauth_patientId_idx" ON "PmjayPreauth"("patientId");

-- CreateIndex
CREATE INDEX "PmjayPreauth_beneficiaryId_idx" ON "PmjayPreauth"("beneficiaryId");

-- CreateIndex
CREATE UNIQUE INDEX "PmjayClaim_clientRequestId_key" ON "PmjayClaim"("clientRequestId");

-- CreateIndex
CREATE INDEX "PmjayClaim_hospitalId_idx" ON "PmjayClaim"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayClaim_patientId_idx" ON "PmjayClaim"("patientId");

-- CreateIndex
CREATE INDEX "PmjayClaim_beneficiaryId_idx" ON "PmjayClaim"("beneficiaryId");

-- CreateIndex
CREATE INDEX "PmjayClaim_status_idx" ON "PmjayClaim"("status");

-- CreateIndex
CREATE INDEX "PmjayDocument_hospitalId_idx" ON "PmjayDocument"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayDocument_pmjayClaimId_idx" ON "PmjayDocument"("pmjayClaimId");

-- CreateIndex
CREATE INDEX "PmjayQuery_hospitalId_idx" ON "PmjayQuery"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayQuery_claimId_idx" ON "PmjayQuery"("claimId");

-- CreateIndex
CREATE INDEX "PmjayQuery_status_idx" ON "PmjayQuery"("status");

-- CreateIndex
CREATE INDEX "PmjayPackage_hospitalId_idx" ON "PmjayPackage"("hospitalId");

-- CreateIndex
CREATE INDEX "PmjayPackage_packageCode_idx" ON "PmjayPackage"("packageCode");

-- CreateIndex
CREATE INDEX "ClaimDocumentRequirement_hospitalId_idx" ON "ClaimDocumentRequirement"("hospitalId");

-- CreateIndex
CREATE INDEX "ClaimDocumentRequirement_packageId_idx" ON "ClaimDocumentRequirement"("packageId");

-- CreateIndex
CREATE INDEX "WebhookEvent_hospitalId_idx" ON "WebhookEvent"("hospitalId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_leaseExpiresAt_idx" ON "WebhookEvent"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "HospitalSettings" ADD CONSTRAINT "HospitalSettings_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachNotification" ADD CONSTRAINT "BreachNotification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummaryRecord" ADD CONSTRAINT "DischargeSummaryRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeSummaryRecord" ADD CONSTRAINT "DischargeSummaryRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpPlan" ADD CONSTRAINT "FollowUpPlan_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpPlan" ADD CONSTRAINT "FollowUpPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeChecklist" ADD CONSTRAINT "DischargeChecklist_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeChecklist" ADD CONSTRAINT "DischargeChecklist_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePathwayTemplate" ADD CONSTRAINT "CarePathwayTemplate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyUpdate" ADD CONSTRAINT "FamilyUpdate_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyUpdate" ADD CONSTRAINT "FamilyUpdate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineShare" ADD CONSTRAINT "TimelineShare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineShare" ADD CONSTRAINT "TimelineShare_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpdpRequest" ADD CONSTRAINT "DpdpRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpdpRequest" ADD CONSTRAINT "DpdpRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotStudy" ADD CONSTRAINT "PilotStudy_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalIntegrationProfile" ADD CONSTRAINT "HospitalIntegrationProfile_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbhaIdentity" ADD CONSTRAINT "AbhaIdentity_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbhaIdentity" ADD CONSTRAINT "AbhaIdentity_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxClaim" ADD CONSTRAINT "NhcxClaim_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxClaim" ADD CONSTRAINT "NhcxClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxClaim" ADD CONSTRAINT "NhcxClaim_abhaIdentityId_fkey" FOREIGN KEY ("abhaIdentityId") REFERENCES "AbhaIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCoverageEligibility" ADD CONSTRAINT "NhcxCoverageEligibility_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCoverageEligibility" ADD CONSTRAINT "NhcxCoverageEligibility_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCoverageEligibility" ADD CONSTRAINT "NhcxCoverageEligibility_abhaIdentityId_fkey" FOREIGN KEY ("abhaIdentityId") REFERENCES "AbhaIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCommunication" ADD CONSTRAINT "NhcxCommunication_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCommunication" ADD CONSTRAINT "NhcxCommunication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCommunication" ADD CONSTRAINT "NhcxCommunication_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NhcxClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhcxCommunication" ADD CONSTRAINT "NhcxCommunication_coverageEligibilityId_fkey" FOREIGN KEY ("coverageEligibilityId") REFERENCES "NhcxCoverageEligibility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTransaction" ADD CONSTRAINT "ExternalTransaction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTransaction" ADD CONSTRAINT "ExternalTransaction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTransaction" ADD CONSTRAINT "ExternalTransaction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NhcxClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NabhEvidence" ADD CONSTRAINT "NabhEvidence_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedClaim" ADD CONSTRAINT "NormalizedClaim_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedClaim" ADD CONSTRAINT "NormalizedClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedClaim" ADD CONSTRAINT "NormalizedClaim_payerProfileId_fkey" FOREIGN KEY ("payerProfileId") REFERENCES "PayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerProfile" ADD CONSTRAINT "PayerProfile_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayBeneficiary" ADD CONSTRAINT "PmjayBeneficiary_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayBeneficiary" ADD CONSTRAINT "PmjayBeneficiary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayBeneficiary" ADD CONSTRAINT "PmjayBeneficiary_abhaIdentityId_fkey" FOREIGN KEY ("abhaIdentityId") REFERENCES "AbhaIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayPreauth" ADD CONSTRAINT "PmjayPreauth_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayPreauth" ADD CONSTRAINT "PmjayPreauth_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayPreauth" ADD CONSTRAINT "PmjayPreauth_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "PmjayBeneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayPreauth" ADD CONSTRAINT "PmjayPreauth_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PmjayPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayClaim" ADD CONSTRAINT "PmjayClaim_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayClaim" ADD CONSTRAINT "PmjayClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayClaim" ADD CONSTRAINT "PmjayClaim_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "PmjayBeneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayClaim" ADD CONSTRAINT "PmjayClaim_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PmjayPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayClaim" ADD CONSTRAINT "PmjayClaim_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "PmjayPreauth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayDocument" ADD CONSTRAINT "PmjayDocument_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayDocument" ADD CONSTRAINT "PmjayDocument_pmjayClaimId_fkey" FOREIGN KEY ("pmjayClaimId") REFERENCES "PmjayClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayQuery" ADD CONSTRAINT "PmjayQuery_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayQuery" ADD CONSTRAINT "PmjayQuery_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PmjayClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmjayPackage" ADD CONSTRAINT "PmjayPackage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimDocumentRequirement" ADD CONSTRAINT "ClaimDocumentRequirement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimDocumentRequirement" ADD CONSTRAINT "ClaimDocumentRequirement_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PmjayPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

