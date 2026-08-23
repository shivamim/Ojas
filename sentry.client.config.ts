import * as Sentry from "@sentry/nextjs";

// Ojas — Sentry client config (browser). Disabled when SENTRY_DSN is unset
// (Sentry.init with no DSN is a no-op). We attach hospitalId/userId/role as
// operational context for triage — NEVER patient PII (mobile, address,
// next-of-kin, patient name). A beforeSend scrubber strips any request body /
// header data that might leak PII before events are sent.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Scrub potential PII / sensitive request data before sending to Sentry.
    beforeSend(event) {
      // Drop request bodies + headers entirely (could contain PII).
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
      }
      // Drop any breadcrumb data that looks like it could carry PII.
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter((b) => {
          const data = JSON.stringify(b.data ?? {}).toLowerCase();
          // Filter out breadcrumbs that captured encrypted PII field names.
          return !/mobileencrypted|addressencrypted|nextofkincontactencrypted|familycontactencrypted/.test(data);
        });
      }
      return event;
    },
  });
}
