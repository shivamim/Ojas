// Ojas — API route error handler. Wraps route handlers so thrown errors with
// a `status` property (UNAUTHORIZED=401, FORBIDDEN=403, FORBIDDEN_TENANT=403)
// become proper HTTP responses instead of generic 500s. Server-side errors are
// captured to Sentry (operational context only — hospitalId/userId/role, never
// PII; the beforeSend scrubber in sentry.server.config.ts strips request bodies
// + headers). Sentry is a no-op when SENTRY_DSN is unset.
import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError } from "@/lib/server-utils";
import { getCurrentUser } from "@/lib/auth";

type RouteContext = { params: Promise<Record<string, string | string[]>> };

type Handler<C = RouteContext> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

/** Best-effort: read the acting user from the request cookie to tag Sentry
 *  events with hospitalId/userId/role. Never throws — failing to read the user
 *  must not weaken error handling. */
async function bestEffortUserContext() {
  try {
    const user = await getCurrentUser();
    if (user) {
      return {
        user: { id: user.sub, email: undefined, username: undefined },
        tags: { hospitalId: user.hospitalId ?? "none", role: user.role },
      };
    }
  } catch {
    // ignore — not authenticated or cookie unreadable
  }
  return null;
}

/** Capture a server error to Sentry with operational context (no PII). */
async function captureApiError(req: NextRequest, err: unknown, opts: { reason: string }) {
  try {
    const ctx = await bestEffortUserContext();
    Sentry.captureException(err, {
      tags: { source: "api-handler", reason: opts.reason, ...(ctx?.tags ?? {}) },
      user: ctx?.user,
      // Request URL/method are operational (no PII); Sentry auto-attaches
      // request data on the server scope, and sentry.server.config.ts beforeSend
      // scrubs bodies + headers that could carry PII.
      contexts: { request: { url: req.url, method: req.method } },
    });
  } catch {
    // Sentry unavailable — must not affect error handling.
  }
}

/** Wrap a route handler with structured error handling. */
export function withErrors<C extends RouteContext = RouteContext>(handler: Handler<C>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 401) return jsonError("Authentication required", 401);
      if (status === 403) {
        // Cross-tenant denials are security events — capture to Sentry.
        if (message === "FORBIDDEN_TENANT") {
          void captureApiError(req, err, { reason: "forbidden_tenant" });
        }
        // Don't leak tenant-access details — generic forbidden
        return jsonError(message === "FORBIDDEN_TENANT" ? "Access denied" : "You don't have permission to do this", 403);
      }
      if (status === 404) return jsonError("Not found", 404);
      if (status === 409) return jsonError(message, 409);
      if (status === 429) return jsonError("Too many requests. Try again later.", 429);
      // Unknown error — capture to Sentry (with user/hospital context) + log
      // full detail server-side, return generic to client.
      void captureApiError(req, err, { reason: "unhandled_500" });
      console.error("[api-error]", message, (err as { stack?: string }).stack);
      return jsonError("Internal server error", 500);
    }
  };
}
