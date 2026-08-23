import * as Sentry from "@sentry/nextjs";

// Ojas — Sentry edge config (Edge runtime / middleware). Disabled when
// SENTRY_DSN is unset. Mirrors the server config for the edge runtime.
const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
      }
      return event;
    },
  });
}
