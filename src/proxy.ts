import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers middleware for Ojas.
 * Adds protective headers while skipping API routes and static assets
 * to avoid interfering with their normal operation.
 */

function isStaticOrAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname.includes("/favicon") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|map)$/) !== null
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes and static assets — they handle their own headers
  if (pathname.startsWith("/api/") || isStaticOrAsset(pathname)) {
    return NextResponse.next();
  }

  const isProduction = process.env.NODE_ENV === "production";

  // Build Content-Security-Policy
  // Next.js 16 requires 'unsafe-inline' for hydration scripts and styled-jsx.
  // We also need 'unsafe-eval' for some runtime optimizations.
  // In production, we keep these but restrict other directives tightly.
  const scriptSrc = isProduction
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // unsafe-inline needed for Tailwind/styled-jsx
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const response = NextResponse.next();

  // Content-Security-Policy
  response.headers.set("Content-Security-Policy", cspDirectives);

  // X-Frame-Options: DENY — prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // X-Content-Type-Options: nosniff — prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer-Policy — only send origin to cross-origin targets
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy — disable camera, microphone, geolocation
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Strict-Transport-Security — only in production (requires HTTPS)
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - api (API routes)
     * We still process those in the function body for fine-grained control,
     * but this matcher ensures we only invoke the middleware on page routes.
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
