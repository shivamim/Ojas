// Ojas — Hospital onboarding checklist API. Returns a checklist of setup
// steps with their completion status, computed from real DB state (not
// fabricated). Helps hospital admins track what's left to configure.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  done: boolean;
  actionView?: string;
  actionLabel?: string;
  category: "Profile" | "Team" | "Patients" | "Protocol" | "Billing";
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const [hospital, settings, users, patients, subscription, invites] = await Promise.all([
    db.hospital.findUnique({
      where: { id: user.hospitalId },
      select: { name: true, bedCount: true, nabhLevel: true, city: true, planTier: true },
    }),
    db.hospitalSettings.findUnique({ where: { hospitalId: user.hospitalId } }),
    db.user.count({ where: { hospitalId: user.hospitalId } }),
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null } }),
    db.subscription.findFirst({ where: { hospitalId: user.hospitalId } }),
    db.invite.count({ where: { hospitalId: user.hospitalId } }),
  ]);

  const checklist: ChecklistItem[] = [
    // Profile
    {
      id: "profile-name",
      title: "Hospital profile configured",
      description: "Hospital name and basic details are set",
      done: !!hospital?.name,
      actionView: "settings",
      actionLabel: "Review settings",
      category: "Profile",
    },
    {
      id: "profile-beds",
      title: "Bed count set",
      description: "Record your hospital's bed count for capacity planning",
      done: !!hospital?.bedCount && hospital.bedCount > 0,
      actionView: "settings",
      actionLabel: "Set bed count",
      category: "Profile",
    },
    {
      id: "profile-nabh",
      title: "NABH level specified",
      description: "Needed for NABH-aligned compliance reporting",
      done: !!hospital?.nabhLevel,
      actionView: "settings",
      actionLabel: "Set NABH level",
      category: "Profile",
    },
    // Team
    {
      id: "team-invites",
      title: "Invite care team members",
      description: "Add coordinators and doctors to share the workload",
      done: users >= 2, // At least the admin + one more
      actionView: "settings",
      actionLabel: "Invite team",
      category: "Team",
    },
    {
      id: "team-coordinator",
      title: "At least one coordinator added",
      description: "Coordinators handle the daily check-in worklist",
      done: await db.user.count({ where: { hospitalId: user.hospitalId, role: "COORDINATOR" } }) > 0,
      actionView: "settings",
      actionLabel: "Invite coordinator",
      category: "Team",
    },
    // Patients
    {
      id: "patients-first",
      title: "Enroll your first patient",
      description: "Start post-discharge monitoring with one patient",
      done: patients >= 1,
      actionView: "enroll",
      actionLabel: "Enroll patient",
      category: "Patients",
    },
    {
      id: "patients-five",
      title: "Enroll 5+ patients",
      description: "Enough volume for meaningful analytics and reporting",
      done: patients >= 5,
      actionView: "enroll",
      actionLabel: "Enroll more",
      category: "Patients",
    },
    // Protocol
    {
      id: "protocol-cadence",
      title: "Review check-in cadence",
      description: "Default is every 24h for 14 days — adjust to your protocol",
      done: !!settings && settings.checkinCadenceHours !== 24,
      actionView: "settings",
      actionLabel: "Adjust cadence",
      category: "Protocol",
    },
    {
      id: "protocol-ai",
      title: "AI triage enabled",
      description: "Real LLM risk-scoring on every check-in response",
      done: settings?.aiTriageEnabled ?? true,
      actionView: "settings",
      actionLabel: "Enable AI triage",
      category: "Protocol",
    },
    // Billing
    {
      id: "billing-plan",
      title: "Review your plan",
      description: `Current: ${hospital?.planTier || "STARTER"} — upgrade for more patients and AI calls`,
      done: !!subscription,
      actionView: "billing",
      actionLabel: "View plans",
      category: "Billing",
    },
  ];

  const byCategory = checklist.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const completedCount = checklist.filter((i) => i.done).length;
  const totalCount = checklist.length;
  const completionRate = Math.round((completedCount / totalCount) * 100);

  return Response.json({
    checklist: byCategory,
    completedCount,
    totalCount,
    completionRate,
    stats: {
      teamMembers: users,
      patients,
      pendingInvites: invites,
      planTier: hospital?.planTier,
    },
  });
}

export const GET = withErrors(GETImpl);
