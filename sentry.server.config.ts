import * as Sentry from "@sentry/nextjs";

// Ojas — Sentry server config (Node runtime). Disabled when SENTRY_DSN is
// unset. Server-side errors captured via withErrors() (api-handler.ts) flow
// through here. We tag events with hospitalId/userId/role for triage — never
// PII. See sentry.client.config.ts for the matching browser scrubber.
const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Scrub request bodies + headers that might contain PII.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
      }
      return event;
    },
  });
}
