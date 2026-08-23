// Ojas — brand constants.
//
// Privacy-by-design: this file intentionally holds NO personal name and NO
// personal mobile number. Founder identity is reduced to a single
// professionally-framed label ("Founder-led · based in Lucknow, India") used
// in exactly ONE place on the public landing page — never as a footer credit
// on every authenticated/internal screen.
//
// DPDP obligation: a named Grievance Officer role + business contact is
// required under the DPDP Rules, 2025. We expose it as a structured object
// (not a personal cell) so legal pages can render it canonically and the
// shared AppFooter stays impersonal.
export const OJAS_BRAND = {
  name: "Ojas",
  tagline: "AI-native post-discharge care",
  description:
    "Ojas is an agentic, multi-tenant SaaS platform hospitals use to monitor patients after discharge — scheduled WhatsApp check-ins, AI-triaged risk, and a prioritized coordinator worklist so nothing falls through the cracks.",
  // Business inbox (monitored by the team). Not a personal address surfaced
  // on every page — used for sales, support, and DPDP grievances.
  email: "team.ojas@outlook.com",
  foundedYear: 2024,
  location: "Lucknow, India",
  // Single, professional founder-identity label. NO personal name.
  // Used in ONE place: landing.tsx "About Ojas" block. Never in AppFooter.
  founderLed: "Founder-led · based in Lucknow, India",
  // DPDP Rules, 2025 — named role (not a person) for grievance redressal.
  // Rendered canonically on /privacy and /terms; never on internal dashboards.
  grievanceOfficer: {
    role: "Data Protection & Grievance Officer",
    org: "Ojas",
    email: "team.ojas@outlook.com",
    // Postal address only — no personal phone published site-wide.
    address: "Lucknow, Uttar Pradesh, India",
    acknowledgementSLA: "48 hours",
    resolutionSLA: "30 days",
  },
} as const;
