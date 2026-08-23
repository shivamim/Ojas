"use client";

import * as React from "react";
import { OJAS_BRAND } from "@/lib/brand";
import { AppFooter } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Lock, Server, Brain, Clock, Cookie, Globe, Users, FileCheck, Mail } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

const EFFECTIVE_DATE = new Date().toLocaleDateString("en-IN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

interface Section {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "info-collected",
    title: "1. Information We Collect",
    icon: FileCheck,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} collects the following categories of information to
          deliver and improve the Service:
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <p className="font-medium text-foreground">A. Information You Provide</p>
            <ul className="list-disc pl-6 mt-1.5 space-y-1 text-muted-foreground">
              <li>Account registration details (name, email, phone number, role)</li>
              <li>Hospital and department information</li>
              <li>Patient demographic and clinical data entered during enrollment</li>
              <li>Discharge summaries and care pathway details</li>
              <li>Check-in responses received via WhatsApp or the platform</li>
              <li>Feedback, support requests, and other communications</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground">B. Information Collected Automatically</p>
            <ul className="list-disc pl-6 mt-1.5 space-y-1 text-muted-foreground">
              <li>Device information (browser type, operating system)</li>
              <li>Usage logs and interaction patterns within the platform</li>
              <li>IP address and approximate geographic location</li>
              <li>Cookies and similar tracking technologies (see Section 8)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground">C. Information from Third Parties</p>
            <ul className="list-disc pl-6 mt-1.5 space-y-1 text-muted-foreground">
              <li>WhatsApp Business API metadata (message delivery status, timestamps)</li>
              <li>Integration data from connected hospital information systems</li>
            </ul>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "2. How We Use Information",
    icon: Brain,
    content: (
      <>
        <p>We use the information we collect for the following purposes:</p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li><strong>Service Delivery:</strong> To operate and maintain the platform, process check-ins, generate AI risk assessments, and manage escalations</li>
          <li><strong>Patient Care Coordination:</strong> To route alerts, prioritise worklists, and support care coordination between hospital staff</li>
          <li><strong>AI Processing:</strong> To train, validate, and improve our AI models for risk stratification and care pathway recommendations (see Section 5)</li>
          <li><strong>Communication:</strong> To send service-related notifications, WhatsApp check-in messages, and critical alerts</li>
          <li><strong>Improvement:</strong> To analyse usage patterns, identify bugs, and improve platform performance and user experience</li>
          <li><strong>Security:</strong> To detect, prevent, and address fraud, unauthorised access, and other illegal activities</li>
          <li><strong>Compliance:</strong> To comply with applicable Indian laws and regulations, including the DPDPA 2023</li>
          <li><strong>Analytics:</strong> To generate anonymised, aggregated reports and benchmarking data that do not identify individual patients</li>
        </ul>
      </>
    ),
  },
  {
    id: "data-security",
    title: "3. Data Storage & Security",
    icon: Lock,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} implements industry-standard security measures to
          protect your data:
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3">
            <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Encryption at Rest</p>
              <p className="text-muted-foreground">
                All personally identifiable information (PII) and patient health
                data is encrypted at rest using <strong>AES-256-GCM</strong>,
                an authenticated encryption algorithm that provides both
                confidentiality and integrity assurance.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Encryption in Transit</p>
              <p className="text-muted-foreground">
                All data transmitted between clients and our servers, and between
                internal services, is encrypted using <strong>TLS 1.2 or higher</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Server className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Infrastructure Security</p>
              <p className="text-muted-foreground">
                Data is stored in data centres located within India. We employ
                network segmentation, firewalls, intrusion detection systems, and
                regular vulnerability assessments.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Users className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Access Controls</p>
              <p className="text-muted-foreground">
                Access to production systems and data is restricted through
                role-based access controls (RBAC), multi-factor authentication,
                and the principle of least privilege. All access is logged and
                auditable.
              </p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-muted-foreground">
          While we strive to protect your data using commercially reasonable
          measures, no method of electronic storage or transmission is 100%
          secure. We cannot guarantee absolute security.
        </p>
      </>
    ),
  },
  {
    id: "patient-data",
    title: "4. Patient Data (PII Encrypted)",
    icon: ShieldCheck,
    content: (
      <>
        <p>
          Patient data is treated with the highest level of care:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>PII Encryption:</strong> All patient personally identifiable
            information (name, contact details, medical record numbers) is
            encrypted at the field level using AES-256-GCM before storage
          </li>
          <li>
            <strong>Multi-Tenant Isolation:</strong> Each hospital&apos;s data
            is logically and physically isolated. Cross-tenant data access is
            technically prevented at the database level
          </li>
          <li>
            <strong>Consent-Based Processing:</strong> Patient data is processed
            only after explicit consent is captured at enrollment, in compliance
            with DPDPA 2023
          </li>
          <li>
            <strong>Audit Trail:</strong> Every access to patient data is logged
            with the accessing user, timestamp, and purpose
          </li>
          <li>
            <strong>Data Minimisation:</strong> We collect only the minimum data
            necessary for delivering post-discharge care services
          </li>
          <li>
            <strong>De-identification:</strong> For analytics, benchmarking, and
            AI model training, data is de-identified or anonymised so that
            individuals cannot be re-identified
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "5. AI Processing",
    icon: Brain,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} uses artificial intelligence and machine learning
          models to provide risk stratification, care pathway recommendations,
          and other decision-support features. Important disclosures:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Decision Support Only:</strong> AI outputs are decision-support
            tools and do not constitute medical advice, diagnosis, or treatment
            recommendations. All clinical decisions must be made by qualified
            healthcare professionals
          </li>
          <li>
            <strong>Training Data:</strong> AI models are trained on de-identified
            and anonymised datasets. We do not use identifiable patient data for
            model training without explicit consent
          </li>
          <li>
            <strong>Human Oversight:</strong> Critical AI-generated alerts and
            risk escalations are always reviewed by human coordinators before
            patient contact
          </li>
          <li>
            <strong>Bias Mitigation:</strong> We regularly evaluate our models
            for fairness and bias across demographic groups. However, AI systems
            may reflect biases present in training data
          </li>
          <li>
            <strong>Transparency:</strong> Hospitals can request an explanation
            of how AI risk scores are calculated for their patients
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "6. Data Retention",
    icon: Clock,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} retains personal data only for as long as necessary
          to fulfil the purposes outlined in this Privacy Policy:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Active Account Data:</strong> Retained for the duration of
            the service agreement with the hospital
          </li>
          <li>
            <strong>Patient Data:</strong> Retained for the duration of the
            service agreement plus any legally mandated retention period under
            Indian healthcare regulations
          </li>
          <li>
            <strong>Audit Logs:</strong> Retained for a minimum of three (3)
            years for compliance and security purposes
          </li>
          <li>
            <strong>Anonymised/Aggregated Data:</strong> May be retained
            indefinitely in a form that does not identify individuals
          </li>
          <li>
            <strong>Post-Termination:</strong> Upon termination of the service
            agreement, all patient PII will be deleted within ninety (90) days,
            subject to legal retention requirements
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "dpdpa-rights",
    title: "7. Your Rights Under DPDP Act, 2023 & Rules, 2025",
    icon: ShieldCheck,
    content: (
      <>
        <p>
          Under the Digital Personal Data Protection Act, 2023 and the DPDP
          Rules, 2025 (notified 13–14 November 2025; enforcement phased to
          14 May 2027), data principals (patients) have the following rights:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Right to Access:</strong> Obtain confirmation of whether
            personal data is being processed and a summary of such data
          </li>
          <li>
            <strong>Right to Correction:</strong> Request correction of
            inaccurate or incomplete personal data
          </li>
          <li>
            <strong>Right to Erasure:</strong> Request deletion of personal
            data, subject to legal retention requirements. Note: PII fields
            (name, mobile, address) will be anonymized within 90 days of
            contract termination, but clinical records and audit trails may
            be retained where legally required for medical record-keeping
            under Indian healthcare regulations. This means a patient record
            may persist in anonymized form even after erasure is requested.
          </li>
          <li>
            <strong>Right to Nominate:</strong> Nominate another individual to
            exercise rights on the data principal&apos;s behalf in the event of
            death or incapacity
          </li>
          <li>
            <strong>Right to Grievance Redressal:</strong> File a complaint with
            {OJAS_BRAND.name}&apos;s Grievance Officer regarding the processing
            of personal data
          </li>
        </ul>
        <p className="mt-3">
          To exercise these rights, patients should contact their hospital
          administration or reach out to {OJAS_BRAND.name}&apos;s Grievance
          Officer at{" "}
          <a
            href={`mailto:${OJAS_BRAND.email}`}
            className="text-primary hover:underline"
          >
            {OJAS_BRAND.email}
          </a>{" "}
          with the subject line &quot;DPDPA Rights Request&quot;.
        </p>
      </>
    ),
  },
  {
    id: "erasure-process",
    title: "7a. Erasure Process",
    icon: FileCheck,
    content: (
      <>
        <p>
          Upon receiving an erasure request, {OJAS_BRAND.name} will anonymize
          PII fields (name, contact details, address) within 90 days. Clinical
          data (diagnosis, surgery type, recovery metrics) is retained in
          anonymized form as required by medical record-keeping regulations.
          The 90-day deletion commitment is operationalized through the patient
          erasure API endpoint.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "8. Cookies & Tracking Technologies",
    icon: Cookie,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} uses cookies and similar technologies for:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Essential Cookies:</strong> Required for authentication,
            security, and basic platform functionality. These cannot be disabled
          </li>
          <li>
            <strong>Analytics Cookies:</strong> Help us understand how users
            interact with the platform so we can improve the experience. These
            are anonymised and do not track individual patients
          </li>
          <li>
            <strong>Preference Cookies:</strong> Remember user settings such as
            theme preference and layout choices
          </li>
        </ul>
        <p className="mt-3">
          We do not use advertising cookies or sell data to advertising
          networks. Users can manage cookie preferences through their browser
          settings.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "9. Third-Party Services",
    icon: Globe,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} integrates with the following categories of
          third-party services to deliver the platform:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            <strong>Messaging Providers:</strong> WhatsApp Business API for
            patient check-in communications
          </li>
          <li>
            <strong>Cloud Infrastructure:</strong> Data centres located within
            India for hosting and processing
          </li>
          <li>
            <strong>Analytics:</strong> Internal analytics tools for platform
            monitoring and improvement
          </li>
        </ul>
        <p className="mt-3">
          All third-party service providers are contractually bound to maintain
          the confidentiality and security of personal data in accordance with
          the DPDPA 2023 and our data processing agreements.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "10. Children&apos;s Data",
    icon: Users,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} does not knowingly collect personal data from
          children under the age of eighteen (18). In the context of paediatric
          post-discharge care:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            Data of minor patients is entered and managed by their parents or
            lawful guardians through the hospital
          </li>
          <li>
            Verifiable parental or guardian consent is required before processing
            any personal data relating to a minor
          </li>
          <li>
            Such data is subject to the same encryption and security measures
            as adult patient data, with additional access restrictions
          </li>
        </ul>
        <p className="mt-3">
          If you become aware that a minor&apos;s data has been collected
          without verifiable consent, please contact us immediately at{" "}
          <a
            href={`mailto:${OJAS_BRAND.email}`}
            className="text-primary hover:underline"
          >
            {OJAS_BRAND.email}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "11. International Transfers",
    icon: Globe,
    content: (
      <>
        <p>
          {OJAS_BRAND.name} stores and processes all personal data within data
          centres located in India. We do not transfer personal data outside of
          India unless:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li>
            Explicit consent is obtained from the data principal
          </li>
          <li>
            The transfer is necessary for the performance of the service
            agreement
          </li>
          <li>
            The transfer is to a country or territory approved by the Central
            Government of India under the DPDPA 2023
          </li>
        </ul>
        <p className="mt-3">
          In the event that an international transfer becomes necessary, we will
          ensure that adequate safeguards are in place, including standard
          contractual clauses and ensuring the receiving country provides an
          adequate level of data protection.
        </p>
      </>
    ),
  },
  {
    id: "contact-grievance",
    title: "12. Contact & Grievance Officer",
    icon: Mail,
    content: (
      <>
        <p>
          For privacy-related inquiries, data access requests, or to file a
          grievance regarding the processing of your personal data under the
          DPDP Act, 2023 and the DPDP Rules, 2025:
        </p>
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30">
          <p className="font-semibold text-foreground">
            {OJAS_BRAND.name} — {OJAS_BRAND.grievanceOfficer.role}
          </p>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>Attn: {OJAS_BRAND.grievanceOfficer.role}</p>
            <p>
              Email:{" "}
              <a
                href={`mailto:${OJAS_BRAND.grievanceOfficer.email}?subject=DPDPA Grievance`}
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
              >
                {OJAS_BRAND.grievanceOfficer.email}
              </a>
            </p>
            <p>{OJAS_BRAND.grievanceOfficer.address}</p>
          </div>
        </div>
        <p className="mt-4 text-muted-foreground">
          We acknowledge receipt of grievances within forty-eight (48) hours and
          endeavour to resolve them within thirty (30) days, in line with Rule
          11 of the DPDP Rules, 2025. If you are unsatisfied with the
          resolution, you may file a complaint with the Data Protection Board
          of India.
        </p>
      </>
    ),
  },
];

export function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1">
        {/* Header */}
        <MarketingHeader />

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-12 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Privacy Policy
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                How {OJAS_BRAND.name} collects, uses, and protects your data
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
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3" />
              AES-256-GCM
            </Badge>
          </div>
          <p className="mt-6 text-muted-foreground leading-relaxed">
            This Privacy Policy describes how {OJAS_BRAND.name} (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;) collects, uses, stores, and
            protects personal data when you use our platform. This policy is
            aligned with the Digital Personal Data Protection Act, 2023 (DPDPA)
            and the Digital Personal Data Protection Rules, 2025 (notified
            13–14 November 2025; enforcement phased to 14 May 2027), and is
            designed for Indian healthcare organisations and their patients.
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
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-1.5 px-2 rounded-md hover:bg-primary/5"
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      {section.title}
                    </a>
                  );
                })}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Sections */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 pb-16 space-y-10">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <div className="flex items-center gap-2.5 mb-3">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <h2 className="text-lg font-semibold tracking-tight">
                    {section.title}
                  </h2>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-0">
                  {section.content}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
