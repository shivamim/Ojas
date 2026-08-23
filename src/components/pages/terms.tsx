"use client";

import * as React from "react";
import { OJAS_BRAND } from "@/lib/brand";

import { AppFooter } from "@/components/app-shell";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Scale } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

const EFFECTIVE_DATE = new Date().toLocaleDateString("en-IN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    content: (
      <>
        <p>
          By accessing or using the <strong>{OJAS_BRAND.name}</strong> platform
          (&quot;Service&quot;), you agree to be bound by these Terms of Service
          (&quot;Terms&quot;). If you are using the Service on behalf of a
          hospital, clinic, or other healthcare organisation, you represent and
          warrant that you have the authority to bind that entity to these Terms.
        </p>
        <p className="mt-3">
          If you do not agree to all of these Terms, you must not access or use
          the Service. {OJAS_BRAND.name} reserves the right to modify these Terms
          at any time as described in Section 13 below.
        </p>
      </>
    ),
  },
  {
    id: "description",
    title: "2. Service Description",
    content: (
      <>
        <p>
          {OJAS_BRAND.name} is an AI-native, multi-tenant SaaS platform that
          enables hospitals and healthcare providers to monitor patients after
          discharge. The Service includes, but is not limited to:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>Scheduled WhatsApp check-ins with post-discharge patients</li>
          <li>AI-triaged risk stratification and escalation alerts</li>
          <li>Prioritised coordinator worklists for care management</li>
          <li>Discharge summary management and care pathway tracking</li>
          <li>Medication adherence monitoring and alerting</li>
          <li>Readmission analytics and benchmarking</li>
          <li>Team productivity and performance reporting</li>
        </ul>
        <p className="mt-3">
          The Service is provided as &quot;Software-as-a-Service&quot; and is
          accessed via web browsers and supported messaging channels.{" "}
          {OJAS_BRAND.name} does not provide medical advice, diagnosis, or
          treatment. All AI-generated insights are decision-support tools and
          must be verified by qualified healthcare professionals.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. User Accounts & Responsibilities",
    content: (
      <>
        <p>
          Access to the Service requires a registered user account. You are
          responsible for:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            Maintaining the confidentiality of your login credentials and for
            all activities that occur under your account
          </li>
          <li>
            Notifying {OJAS_BRAND.name} immediately of any unauthorised access
            or use of your account
          </li>
          <li>
            Ensuring that all information you provide during registration is
            accurate and complete
          </li>
          <li>
            Complying with all applicable Indian laws, including the Clinical
            Establishments (Registration and Regulation) Act, 2010, and the
            Indian Medical Council Act, where relevant
          </li>
          <li>
            Using the Service only for lawful purposes and in accordance with
            these Terms
          </li>
        </ul>
        <p className="mt-3">
          Account roles (Hospital Admin, Coordinator, Doctor, Super Admin) carry
          specific permissions. Users must not attempt to exceed their authorised
          access level or impersonate another user.
        </p>
      </>
    ),
  },
  {
    id: "patient-data",
    title: "4. Patient Data & Privacy",
    content: (
      <>
        <p>
          {OJAS_BRAND.name} processes patient data solely for the purpose of
          delivering post-discharge care management services. Patient data
          includes personally identifiable information (PII), health records,
          check-in responses, and AI-generated risk assessments.
        </p>
        <p className="mt-3">
          All patient PII is encrypted at rest using AES-256-GCM and in transit
          using TLS 1.2 or higher. Access to patient data is restricted on a
          need-to-know basis through role-based access controls (RBAC).
        </p>
        <p className="mt-3">
          Hospitals retain full ownership of their patient data.{" "}
          {OJAS_BRAND.name} acts as a data processor under the Digital Personal
          Data Protection Act, 2023 (DPDPA). We will not sell, share, or
          transfer patient data to third parties except as required to deliver
          the Service or as compelled by law.
        </p>
      </>
    ),
  },
  {
    id: "dpdpa",
    title: "5. DPDP Act, 2023 & DPDP Rules, 2025",
    content: (
      <>
        <p>
          {OJAS_BRAND.name} is committed to compliance with the Digital Personal
          Data Protection Act, 2023 (&quot;DPDPA&quot;) and the Digital Personal
          Data Protection Rules, 2025 (&quot;DPDP Rules&quot;), notified in the
          Gazette on 13–14 November 2025. Enforcement is phased across three
          notified dates — 14 Nov 2025 (Data Protection Board established),
          14 Nov 2026, and full enforcement from 14 May 2027 — and we are
          building towards each milestone. In particular:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Consent (Rule 4):</strong> Patient consent is captured at
            the point of enrollment with a timestamp, purpose, and consent
            version. Consent records are versioned and auditable through the
            platform&apos;s ConsentRecord / ConsentVersion models.
          </li>
          <li>
            <strong>Breach Notification (Rule 7):</strong> On becoming aware of a
            personal data breach, {OJAS_BRAND.name} will notify the Data
            Protection Board of India without delay, followed by a detailed
            report within 72 hours, and notify affected Data Principals. Note:
            hospitals may additionally be bound by CERT-In&apos;s 6-hour
            cyber-incident reporting window under the IT Act — these are
            parallel, stacking obligations the platform is designed to support.
          </li>
          <li>
            <strong>Purpose Limitation:</strong> Personal data is processed only
            for the purposes specified at the time of consent collection.
          </li>
          <li>
            <strong>Data Minimisation:</strong> We collect only the personal data
            necessary for delivering the Service.
          </li>
          <li>
            <strong>Data Principal Rights (Section 11–14):</strong> Patients
            (data principals) may exercise their rights to access, correct,
            erase, and nominate by contacting the hospital or{" "}
            {OJAS_BRAND.name}&apos;s Grievance Officer (see Section 14).
          </li>
          <li>
            <strong>Grievance Redressal (Rule 11):</strong> We acknowledge
            grievances within 48 hours and endeavour to resolve them within
            30 days. Penalties under the DPDP framework can reach ₹250 crore
            for inadequate safeguards and ₹200 crore for failure to notify a
            breach — these may stack, which is why our breach protocol is
            engineered to the 72-hour window.
          </li>
          <li>
            <strong>Roadmap (honest):</strong> Today the platform ships DPDP
            Lite — versioned consent, the 72-hour breach clock, and a Data
            Subject Request (DSR) tracker. A full DPIA / data-inventory engine
            is on the roadmap and is not yet shipped. We will not claim
            coverage that does not exist.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-processing",
    title: "6. Data Processing",
    content: (
      <>
        <p>
          {OJAS_BRAND.name} processes data in data centres located within India.
          As a data processor, we:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            Process personal data only on documented instructions from the
            hospital (data fiduciary)
          </li>
          <li>
            Ensure that persons authorised to process the data are bound by
            confidentiality obligations
          </li>
          <li>
            Implement appropriate technical and organisational measures to
            secure personal data
          </li>
          <li>
            Assist the hospital in fulfilling its obligations regarding data
            principal rights
          </li>
          <li>
            Delete or return all personal data upon termination of the service
            agreement, subject to legal retention requirements
          </li>
        </ul>
        <p className="mt-3">
          Sub-processors, if any, are engaged only with the hospital&apos;s prior
          authorisation and under contractual obligations that provide the same
          level of data protection.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "7. Intellectual Property",
    content: (
      <>
        <p>
          The {OJAS_BRAND.name} platform, including its software, design,
          algorithms, AI models, documentation, and branding, is the exclusive
          intellectual property of {OJAS_BRAND.name} and its licensors.
        </p>
        <p className="mt-3">
          Hospitals retain all rights to their patient data, clinical protocols,
          and any content they create within the platform.{" "}
          {OJAS_BRAND.name} retains a limited licence to process such content
          solely for the purpose of delivering the Service.
        </p>
        <p className="mt-3">
          Users may not copy, modify, distribute, sell, or lease any part of the
          Service or its included software, nor may they reverse engineer or
          attempt to extract the source code, unless applicable law permits it or
          the user has written permission from {OJAS_BRAND.name}.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "8. Limitation of Liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by applicable law:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            {OJAS_BRAND.name} provides AI-generated insights as{" "}
            <strong>decision-support tools only</strong> and does not guarantee
            the accuracy, completeness, or reliability of any AI output. All
            clinical decisions remain the sole responsibility of qualified
            healthcare professionals.
          </li>
          <li>
            {OJAS_BRAND.name} shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, including but not
            limited to loss of profits, data, or goodwill, arising from the use
            of or inability to use the Service.
          </li>
          <li>
            {OJAS_BRAND.name}&apos;s total aggregate liability under these Terms
            shall not exceed the fees paid by the hospital in the twelve (12)
            months preceding the event giving rise to the claim.
          </li>
        </ul>
        <p className="mt-3">
          Nothing in these Terms excludes or limits liability for death or
          personal injury caused by negligence, fraud, or any other liability
          that cannot be excluded by law.
        </p>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "9. Indemnification",
    content: (
      <>
        <p>
          You agree to indemnify, defend, and hold harmless {OJAS_BRAND.name},
          its officers, directors, employees, and agents from and against any and
          all claims, damages, losses, and expenses (including reasonable
          legal fees) arising from:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>Your breach of these Terms</li>
          <li>
            Your use of the Service in a manner not authorised by these Terms
          </li>
          <li>
            Your violation of any applicable law, regulation, or third-party
            right
          </li>
          <li>
            Any claim that content you provide infringes the intellectual
            property rights of a third party
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "termination",
    title: "10. Termination",
    content: (
      <>
        <p>
          Either party may terminate the service agreement in accordance with
          the terms of the executed service agreement between the parties.
        </p>
        <p className="mt-3">
          Upon termination:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            {OJAS_BRAND.name} will provide a reasonable transition period for
            data export, not exceeding thirty (30) days
          </li>
          <li>
            All patient data will be deleted from {OJAS_BRAND.name}&apos;s
            systems within ninety (90) days, subject to legal retention
            requirements
          </li>
          <li>
            Your right to use the Service will immediately cease
          </li>
          <li>
            Sections 4, 5, 6, 7, 8, 9, 11, and 12 shall survive termination
          </li>
        </ul>
        <p className="mt-3">
          {OJAS_BRAND.name} reserves the right to suspend or terminate access
          immediately, without prior notice, for conduct that {OJAS_BRAND.name}{" "}
          reasonably believes violates these Terms or is harmful to other users
          or the Service.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "11. Governing Law",
    content: (
      <>
        <p>
          These Terms are governed by and construed in accordance with the laws
          of India, without regard to its conflict of law principles. The
          Courts of <strong>Uttar Pradesh, India</strong> shall have exclusive
          jurisdiction over any disputes arising under these Terms.
        </p>
        <p className="mt-3">
          For hospitals located outside Uttar Pradesh, the jurisdiction shall be
          as mutually agreed in the executed service agreement, provided that
          Indian law remains the governing law.
        </p>
      </>
    ),
  },
  {
    id: "dispute",
    title: "12. Dispute Resolution",
    content: (
      <>
        <p>
          Any dispute arising out of or in connection with these Terms shall be
          resolved in the following manner:
        </p>
        <ol className="list-decimal pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Negotiation:</strong> The parties shall first attempt to
            resolve the dispute through good-faith negotiation within thirty
            (30) days of written notice.
          </li>
          <li>
            <strong>Mediation:</strong> If negotiation fails, the parties shall
            refer the dispute to mediation under the mediation rules of the
            Indian Institute of Arbitration or a mutually agreed mediator.
          </li>
          <li>
            <strong>Arbitration:</strong> If mediation fails, the dispute shall
            be finally resolved by arbitration in accordance with the Arbitration
            and Conciliation Act, 1996. The arbitration shall be conducted in
            English, and the seat of arbitration shall be{" "}
            {OJAS_BRAND.location}.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "modifications",
    title: "13. Modifications to Terms",
    content: (
      <>
        <p>
          {OJAS_BRAND.name} reserves the right to modify these Terms at any
          time. Material changes will be communicated via:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>Email notification to registered users at least thirty (30) days
            before the changes take effect</li>
          <li>A prominent notice within the Service</li>
          <li>Updated effective date on this page</li>
        </ul>
        <p className="mt-3">
          Continued use of the Service after the effective date of any changes
          constitutes your acceptance of the revised Terms. If you do not agree
          to the modified Terms, you must discontinue use of the Service.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "14. Contact & Grievance Officer",
    content: (
      <>
        <p>
          For questions, concerns, or notices regarding these Terms, please
          contact:
        </p>
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 space-y-1.5">
          <p className="font-semibold text-foreground">
            {OJAS_BRAND.name} — {OJAS_BRAND.grievanceOfficer.role}
          </p>
          <p>Attn: Legal &amp; Compliance</p>
          <p>
            Email:{" "}
            <a
              href={`mailto:${OJAS_BRAND.grievanceOfficer.email}`}
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            >
              {OJAS_BRAND.grievanceOfficer.email}
            </a>
          </p>
          <p>{OJAS_BRAND.grievanceOfficer.address}</p>
        </div>
        <p className="mt-3">
          For data protection inquiries under the DPDP Act, 2023 and the DPDP
          Rules, 2025, please email the Grievance Officer at{" "}
          <a
            href={`mailto:${OJAS_BRAND.grievanceOfficer.email}?subject=DPDPA Grievance`}
            className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
          >
            {OJAS_BRAND.grievanceOfficer.email}
          </a>{" "}
          with the subject line &quot;DPDPA Grievance&quot;. We acknowledge
          grievances within {OJAS_BRAND.grievanceOfficer.acknowledgementSLA} and
          endeavour to resolve them within {OJAS_BRAND.grievanceOfficer.resolutionSLA},
          in line with Rule 11 of the DPDP Rules, 2025. If you are unsatisfied
          with the resolution, you may escalate to the Data Protection Board of
          India.
        </p>
      </>
    ),
  },
];

export function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1">
        {/* Header */}
        <MarketingHeader />

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-12 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Terms of Service
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Legal agreement between you and {OJAS_BRAND.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Badge variant="outline" className="text-xs">
              Effective: {EFFECTIVE_DATE}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              v1.0
            </Badge>
          </div>
          <p className="mt-6 text-muted-foreground leading-relaxed">
            These Terms of Service govern your access to and use of the{" "}
            {OJAS_BRAND.name} platform. Please read them carefully before using
            the Service. By accessing or using the Service, you agree to be
            bound by these Terms.
          </p>
        </div>

        <Separator className="max-w-4xl mx-auto" />

        {/* Table of contents */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
          <Card className="border-border/60">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Table of Contents
              </h2>
              <nav className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {SECTIONS.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors py-1 px-2 rounded-md hover:bg-primary/5"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Sections */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 pb-16 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold tracking-tight mb-3">
                {section.title}
              </h2>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-0">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
