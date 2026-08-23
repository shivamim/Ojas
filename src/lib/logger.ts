// Ojas — structured logging + observability.
//
// Structured JSON logs with a per-request ID. PII/PHI is NEVER logged — only
// resource IDs, action names, and non-sensitive metadata. Errors are forwarded
// to Sentry when SENTRY_DSN is configured (runtime init in sentry.*.config.ts).
//
// Usage in route handlers:
//   const log = logger(req);       // binds requestId
//   log.info("patient.enrolled", { patientId, hospitalId });
//   log.error("whatsapp.send_failed", err, { messageId });
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  hospitalId?: string | null;
  actorId?: string | null;
  [k: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "mobile", "phone", "email", "address", "password", "token", "secret",
  "otp", "abhaNumber", "piI", "phi", "diagnosis", "medications", "freeText",
  "symptomsText", "mobileEncrypted", "addressEncrypted", "nextOfKinContactEncrypted",
  "familyContactEncrypted", "refreshToken", "accessToken", "abdmResponseRaw",
  "fhirClaimResponse", "fhirPreauthResponse",
]);

/** Recursively redact sensitive keys from an object before logging. */
export function redactPII(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactPII(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactPII(v, depth + 1);
    }
  }
  return out;
}

function emit(level: LogLevel, event: string, ctx: LogContext, error?: unknown) {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(redactPII(ctx) as Record<string, unknown>),
    ...(error instanceof Error
      ? { error: error.message, stack: error.stack?.split("\n").slice(0, 5).join(" | ") }
      : error
        ? { error: String(error) }
        : {}),
  };
  // JSON to stdout (structured for log aggregators). NEVER include raw PII.
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(req?: Request | { headers?: { get?: (n: string) => string | null } }) {
  const requestId =
    (req && "headers" in req && req.headers?.get?.("x-request-id")) ||
    (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}`);
  return {
    requestId,
    info: (event: string, ctx: LogContext = {}) => emit("info", event, { requestId, ...ctx }),
    warn: (event: string, ctx: LogContext = {}) => emit("warn", event, { requestId, ...ctx }),
    error: (event: string, err: unknown, ctx: LogContext = {}) => emit("error", event, { requestId, ...ctx }, err),
    debug: (event: string, ctx: LogContext = {}) => {
      if (process.env.NODE_ENV !== "production") emit("debug", event, { requestId, ...ctx });
    },
  };
}

/** Capture an exception to Sentry (no-op if SENTRY_DSN not configured). */
export function captureException(err: unknown, ctx: LogContext = {}) {
  // Sentry runtime init is in sentry.{client,server}.config.ts. We only forward
  // non-PII context. PII is redacted before capture.
  try {
    // Dynamic import avoids loading Sentry in environments without it.
    import("@sentry/nextjs")
      .then(({ captureException: cap, setContext }) => {
        if (typeof setContext === "function") {
          setContext("ojas", redactPII(ctx) as Record<string, unknown>);
        }
        cap(err);
      })
      .catch(() => {
        // Sentry not available — fall back to structured log.
        emit("error", "sentry.capture_failed", { requestId: ctx.requestId }, err);
      });
  } catch {
    // ignore
  }
}
