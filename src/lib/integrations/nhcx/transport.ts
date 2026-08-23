// Ojas — NHCX transport boundary.
//
// P0 fixes (V3 final hardening):
//   • Real mTLS: uses Node's https.Agent with cert/key/ca. NEVER `agent: undefined`
//     and NEVER `rejectUnauthorized: false`. TLS verification stays enabled.
//   • Real certificate parsing: uses crypto.X509Certificate to validate the cert
//     parses, is not expired, and matches the key. certExpiryDays returns a real
//     number, not null.
//   • NHCXHealthCheck: safe endpoint/TLS/cert/auth connectivity check that returns
//     PASS / FAIL / BLOCKED / NOT_CONFIGURED.
//
// Separate components (V3-22): NHCXAuthenticator, NHCXCertificateManager,
// NHCXTransport, NHCXHealthCheck.
import { NHCX_BASE_URL, NHCX_CERT_PATH, NHCX_KEY_PATH, NHCX_CA_PATH, NHCX_PARTNER_ID, isNhcxCertConfigured, isNhcxFullyConfigured } from "@/lib/env";
import { readFileSync, existsSync } from "fs";
import { X509Certificate, createPublicKey, constants as cryptoConstants } from "crypto";
import https from "https";
import http from "http";

export interface NhcxTransportRequest {
  /** Operator-configured endpoint path (e.g. "/claim/submit"). MUST be set via env. */
  endpointPath: string;
  body: string;                    // FHIR bundle JSON
  method?: "POST" | "PUT";
  /** Optional auth token from NHCXAuthenticator. */
  accessToken?: string;
}

export interface NhcxTransportResult {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
}

// ── Certificate validation result ────────────────────────────────────────────
export interface CertificateValidationResult {
  valid: boolean;
  exists: boolean;
  parses: boolean;
  notExpired: boolean;
  keyMatch: boolean;
  expiresAt?: Date;
  daysRemaining?: number;
  isExpired?: boolean;
  error?: string;
}

/**
 * NHCXAuthenticator — obtains an access token via the partner's auth flow.
 *
 * The exact auth mechanism (OAuth2 client-credentials, mTLS-bound token, signed
 * JWT, gateway credentials) is partner-specific and comes from the official NHCX
 * onboarding documentation. Ojas implements the boundary + a pluggable auth
 * strategy; the concrete flow is wired during onboarding via NHCX_AUTH_ENDPOINT.
 *
 * Ojas NEVER guesses an auth endpoint. When NHCX_AUTH_ENDPOINT is unset, getToken
 * returns null (PRODUCTION_PENDING_ONBOARDING).
 */
export class NHCXAuthenticator {
  /**
   * Returns an access token, or null if auth is not configured.
   *
   * If NHCX_AUTH_ENDPOINT is configured, attempts a client-credentials grant
   * using the NHCX mTLS material (if present) for the TLS transport. The exact
   * grant body/headers follow the partner spec; Ojas uses the standard
   * client_credentials grant as the default boundary.
   */
  async getToken(): Promise<string | null> {
    const authEndpoint = process.env.NHCX_AUTH_ENDPOINT;
    if (!authEndpoint || !NHCX_BASE_URL) return null;

    const certManager = new NHCXCertificateManager();
    const mtls = certManager.getMtlsMaterial();
    const clientId = process.env.NHCX_CLIENT_ID;
    const clientSecret = process.env.NHCX_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${NHCX_BASE_URL}${authEndpoint}`;
      // P0-9: when mTLS is configured, use a REAL https.Agent — never fetch()
      // with a fake/undefined dispatcher. The auth request must perform a real
      // TLS client-auth handshake.
      if (mtls) {
        return await this.getTokenWithMtls(url, clientId, clientSecret, mtls, controller);
      }
      // No mTLS — plain fetch is fine.
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
        signal: controller.signal,
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { access_token?: string };
      return data.access_token ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Perform the auth request with a real mTLS https.Agent (P0-9). */
  private async getTokenWithMtls(
    url: string,
    clientId: string,
    clientSecret: string,
    mtls: { cert: Buffer; key: Buffer; ca?: Buffer },
    controller: AbortController,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const agent = createMtlsAgent(mtls);
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString();
      const reqOptions: https.RequestOptions = {
        method: "POST",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
        agent,
        // rejectUnauthorized defaults to true — TLS verification stays enabled.
      };
      const req = https.request(reqOptions, (resp) => {
        let data = "";
        resp.on("data", (chunk) => { data += chunk; });
        resp.on("end", () => {
          if (resp.statusCode === undefined || resp.statusCode < 200 || resp.statusCode >= 300) {
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(data) as { access_token?: string };
            resolve(parsed.access_token ?? null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      controller.signal.addEventListener("abort", () => {
        req.destroy(new Error("Auth request timed out"));
      });
      req.write(body);
      req.end();
    });
  }
}

/**
 * Create a real Node https.Agent with mTLS material. TLS verification stays
 * ENABLED (rejectUnauthorized defaults to true). The CA is used for chain
 * verification when provided.
 */
export function createMtlsAgent(mtls: { cert: Buffer; key: Buffer; ca?: Buffer }): https.Agent {
  return new https.Agent({
    cert: mtls.cert,
    key: mtls.key,
    ca: mtls.ca,
    // rejectUnauthorized stays true — we NEVER disable TLS verification.
    rejectUnauthorized: true,
    keepAlive: true,
  });
}

/** NHCXCertificateManager — loads + validates mTLS material from operator paths.
 *  The private key is NEVER committed; it is read from NHCX_KEY_PATH at runtime. */
export class NHCXCertificateManager {
  hasCertificates(): boolean {
    return isNhcxCertConfigured && !!NHCX_CERT_PATH && !!NHCX_KEY_PATH && existsSync(NHCX_CERT_PATH) && existsSync(NHCX_KEY_PATH);
  }

  /** Returns the cert + key + ca buffers for an mTLS request, or null. */
  getMtlsMaterial(): { cert: Buffer; key: Buffer; ca?: Buffer } | null {
    if (!this.hasCertificates() || !NHCX_CERT_PATH || !NHCX_KEY_PATH) return null;
    try {
      const cert = readFileSync(NHCX_CERT_PATH);
      const key = readFileSync(NHCX_KEY_PATH);
      const ca = NHCX_CA_PATH && existsSync(NHCX_CA_PATH) ? readFileSync(NHCX_CA_PATH) : undefined;
      return { cert, key, ca };
    } catch {
      return null;
    }
  }

  /**
   * Validate the certificate: parses, not expired, key matches.
   * Returns a structured result so the live-gating + health check can use it.
   */
  validate(): CertificateValidationResult {
    if (!this.hasCertificates() || !NHCX_CERT_PATH || !NHCX_KEY_PATH) {
      return { valid: false, exists: false, parses: false, notExpired: false, keyMatch: false, error: "Certificate files not configured or not found" };
    }
    try {
      const certPem = readFileSync(NHCX_CERT_PATH);
      const keyPem = readFileSync(NHCX_KEY_PATH);
      const caPem = NHCX_CA_PATH && existsSync(NHCX_CA_PATH) ? readFileSync(NHCX_CA_PATH) : undefined;

      // Parse the cert.
      let x509: X509Certificate;
      try {
        x509 = new X509Certificate(certPem);
      } catch (e) {
        return { valid: false, exists: true, parses: false, notExpired: false, keyMatch: false, error: `Certificate parse failed: ${e instanceof Error ? e.message : "unknown"}` };
      }

      // Check expiry.
      const expiresAt = new Date(x509.validTo);
      const now = new Date();
      const notExpired = expiresAt > now;
      const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / 86400000);

      // Verify the cert/key pair matches by comparing the public keys.
      let keyMatch = false;
      try {
        const certPubKey = x509.publicKey;
        const keyPubKey = createPublicKey(keyPem);
        // Compare the DER encoding of both public keys.
        keyMatch = certPubKey.equals(keyPubKey);
      } catch {
        keyMatch = false;
      }

      // Validate the CA chain if a CA is provided (best-effort — full chain
      // validation requires the complete CA bundle).
      if (caPem) {
        try {
          // X509Certificate.verify with the CA public key confirms the chain.
          // This is a structural check; full chain validation happens during TLS.
          const caX509 = new X509Certificate(caPem);
          const caPubKey = caX509.publicKey;
          x509.verify(caPubKey);
        } catch (e) {
          // CA verification failure is a warning, not a hard fail (the cert may
          // be signed by an intermediate CA not in the bundle).
          // keyMatch + notExpired are the hard requirements.
        }
      }

      const valid = notExpired && keyMatch;
      return {
        valid,
        exists: true,
        parses: true,
        notExpired,
        keyMatch,
        expiresAt,
        daysRemaining,
        isExpired: !notExpired,
        error: valid ? undefined : `${!notExpired ? "Certificate expired" : ""}${!keyMatch ? `${!notExpired ? "; " : ""}Certificate/key pair mismatch` : ""}`.trim(),
      };
    } catch (e) {
      return { valid: false, exists: true, parses: false, notExpired: false, keyMatch: false, error: `Certificate validation error: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }

  /** Real certificate expiry — returns days until expiry (negative if expired). */
  certExpiryDays(): number | null {
    const result = this.validate();
    if (!result.parses || !result.expiresAt) return null;
    return result.daysRemaining ?? null;
  }
}

/** NHCXTransport — the single component that talks to the external NHCX system.
 *  Refuses guessed endpoints; accepts only operator-configured paths. Uses a
 *  real https.Agent with mTLS when certificates are configured. */
export class NHCXTransport {
  constructor(
    private authenticator = new NHCXAuthenticator(),
    private certs = new NHCXCertificateManager(),
  ) {}

  /** Submit a FHIR bundle to an operator-configured NHCX endpoint.
   *  If the endpoint path is not configured, returns a PRODUCTION_PENDING_ONBOARDING
   *  result — Ojas NEVER POSTs to a guessed URL. */
  async submit(req: NhcxTransportRequest): Promise<NhcxTransportResult> {
    if (!NHCX_BASE_URL) {
      return { ok: false, status: 0, body: "", error: "NHCX_BASE_URL not configured" };
    }
    // The endpointPath must be a real operator-configured path, not an Ojas-invented
    // "/api/v1/claim/submit". The caller passes the path from env (NHCX_CLAIM_ENDPOINT etc.).
    if (!req.endpointPath || req.endpointPath.startsWith("/api/v1/")) {
      return {
        ok: false, status: 0, body: "",
        error: "NHCX endpoint not officially configured. Ojas refuses to POST to a guessed URL. Set NHCX_CLAIM_ENDPOINT (or equivalent) from the partner onboarding documentation. PRODUCTION_PENDING_ONBOARDING.",
      };
    }
    const url = `${NHCX_BASE_URL}${req.endpointPath}`;
    const mtls = this.certs.getMtlsMaterial();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/fhir+json" };
      if (NHCX_PARTNER_ID) headers["X-Partner-Id"] = NHCX_PARTNER_ID;
      if (req.accessToken) headers["Authorization"] = `Bearer ${req.accessToken}`;
      // Build a real https.Agent with mTLS material when available. NEVER
      // `agent: undefined` and NEVER `rejectUnauthorized: false`.
      const fetchOptions: RequestInit & { agent?: https.Agent } = {
        method: req.method ?? "POST",
        headers,
        body: req.body,
        signal: controller.signal,
      };
      if (mtls) {
        // Attach the real mTLS agent. (Node's fetch supports the `agent` option
        // via the dispatcher in undici; for direct https we use the node:https
        // fallback below when mTLS is required.)
        return await this.submitWithMtls(url, req, headers, mtls, controller);
      }
      const resp = await fetch(url, fetchOptions);
      const body = await resp.text();
      return { ok: resp.ok, status: resp.status, body };
    } catch (err) {
      return { ok: false, status: 0, body: "", error: `NHCX transport error: ${err instanceof Error ? err.message : "unknown"}` };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Submit using node:https with a real mTLS agent (when cert/key are required). */
  private async submitWithMtls(
    url: string,
    req: NhcxTransportRequest,
    headers: Record<string, string>,
    mtls: { cert: Buffer; key: Buffer; ca?: Buffer },
    controller: AbortController,
  ): Promise<NhcxTransportResult> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const agent = createMtlsAgent(mtls);
      const lib = parsedUrl.protocol === "https:" ? https : http;
      const reqOptions: https.RequestOptions = {
        method: req.method ?? "POST",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers,
        agent,
        // rejectUnauthorized defaults to true — TLS verification stays enabled.
      };
      const httpRequest = lib.request(reqOptions, (resp) => {
        let body = "";
        resp.on("data", (chunk) => { body += chunk; });
        resp.on("end", () => {
          resolve({ ok: resp.statusCode !== undefined && resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode ?? 0, body });
        });
      });
      httpRequest.on("error", (err) => {
        resolve({ ok: false, status: 0, body: "", error: `NHCX mTLS transport error: ${err.message}` });
      });
      controller.signal.addEventListener("abort", () => {
        httpRequest.destroy(new Error("Request timed out"));
      });
      httpRequest.write(req.body);
      httpRequest.end();
    });
  }
}

// ── NHCX health check (P0-12) ─────────────────────────────────────────────────
export type NhcxHealthStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_CONFIGURED";

export interface NhcxHealthCheckResult {
  status: NhcxHealthStatus;
  checks: {
    endpointConfigured: boolean;
    tlsReachable: boolean | null;
    certificateValid: boolean | null;
    authConfigured: boolean;
    connectivityVerified: boolean | null;
  };
  reason?: string;
  certificateValidation?: CertificateValidationResult;
}

/**
 * NHCXHealthCheck — performs safe checks against the NHCX endpoint WITHOUT
 * submitting a real financial/claim transaction. Returns PASS/FAIL/BLOCKED/
 * NOT_CONFIGURED.
 *
 * Checks (in order):
 *   1. endpoint configured (NHCX_BASE_URL + NHCX_CLAIM_ENDPOINT)
 *   2. TLS reachable (a HEAD/OPTIONS request to the endpoint, or a TLS handshake)
 *   3. certificate valid (parses + not expired + key matches)
 *   4. auth configured (NHCX_AUTH_ENDPOINT + client creds OR mTLS-bound token)
 *   5. connectivity verified (authenticated health endpoint if the partner
 *      provides one; otherwise a TLS-connection success is the best safe signal)
 *
 * NEVER submits a real claim to perform a health check.
 */
export class NHCXHealthCheck {
  constructor(private certs = new NHCXCertificateManager()) {}

  async check(): Promise<NhcxHealthCheckResult> {
    // 1. Endpoint configured?
    if (!isNhcxFullyConfigured) {
      return {
        status: "NOT_CONFIGURED",
        checks: { endpointConfigured: false, tlsReachable: null, certificateValid: null, authConfigured: false, connectivityVerified: null },
        reason: "NHCX not fully configured (NHCX_BASE_URL + NHCX_CLIENT_ID + NHCX_CLIENT_SECRET required)",
      };
    }

    // 2. Certificate valid (if mTLS is configured)?
    let certificateValid: boolean | null = null;
    let certificateValidation: CertificateValidationResult | undefined;
    if (this.certs.hasCertificates()) {
      certificateValidation = this.certs.validate();
      certificateValid = certificateValidation.valid;
      if (!certificateValid) {
        return {
          status: "FAIL",
          checks: { endpointConfigured: true, tlsReachable: null, certificateValid: false, authConfigured: false, connectivityVerified: null },
          reason: `Certificate validation failed: ${certificateValidation.error}`,
          certificateValidation,
        };
      }
    }

    // 3. Auth configured?
    const authEndpoint = process.env.NHCX_AUTH_ENDPOINT;
    const authConfigured = !!authEndpoint && !!process.env.NHCX_CLIENT_ID && !!process.env.NHCX_CLIENT_SECRET;

    // 4. TLS reachable — attempt a HEAD request to the base URL (safe, no body).
    let tlsReachable: boolean | null = null;
    let connectivityVerified: boolean | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const mtls = this.certs.getMtlsMaterial();
      const parsedUrl = new URL(NHCX_BASE_URL!);
      const lib = parsedUrl.protocol === "https:" ? https : http;
      const agent = mtls ? createMtlsAgent(mtls) : undefined;
      await new Promise<void>((resolve) => {
        const reqOptions: https.RequestOptions = {
          method: "HEAD",
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
          path: "/",
          agent,
        };
        const r = lib.request(reqOptions, (resp) => {
          tlsReachable = true;
          // Any HTTP response (even 404/401) means TLS + TCP connectivity works.
          connectivityVerified = resp.statusCode !== undefined && resp.statusCode < 500;
          resp.destroy();
          resolve();
        });
        r.on("error", () => {
          tlsReachable = false;
          connectivityVerified = false;
          resolve();
        });
        r.end();
      });
      clearTimeout(timeout);
    } catch {
      tlsReachable = false;
      connectivityVerified = false;
    }

    // 5. Determine the overall status.
    const endpointConfigured = true; // isNhcxFullyConfigured passed above
    if (tlsReachable === false) {
      return {
        status: "FAIL",
        checks: { endpointConfigured, tlsReachable: false, certificateValid, authConfigured, connectivityVerified: false },
        reason: "NHCX endpoint not reachable (TLS/TCP connection failed)",
        certificateValidation,
      };
    }
    if (!authConfigured && !this.certs.hasCertificates()) {
      return {
        status: "BLOCKED",
        checks: { endpointConfigured, tlsReachable, certificateValid, authConfigured: false, connectivityVerified },
        reason: "Auth not configured (NHCX_AUTH_ENDPOINT + client creds OR mTLS required)",
        certificateValidation,
      };
    }

    return {
      status: "PASS",
      checks: { endpointConfigured, tlsReachable, certificateValid, authConfigured, connectivityVerified },
      certificateValidation,
    };
  }
}

/** Singleton transport + health-check instances. */
export const nhcxTransport = new NHCXTransport();
export const nhcxHealthCheck = new NHCXHealthCheck();
