// Last Updated: 2026-07-22

import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import type { User } from "better-auth";

/**
 * @module email
 *
 * The `nodemailer` SMTP transport for GetWrite's hosted authentication path
 * (FR14, `specs/features/auth-provider.md`), wired into better-auth's
 * `emailAndPassword.sendResetPassword` (FR13) and
 * `emailVerification.sendVerificationEmail` (FR11) callbacks in
 * `auth-server.ts`.
 *
 * **One code path for hosted and self-host.** Any SMTP-compatible provider
 * works by configuring `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/
 * `SMTP_FROM` via environment variables — no provider-specific API
 * integration (Resend, SES, etc.) in this slice. Swapping to a provider API
 * later is a config-only change behind the same two exported callbacks.
 *
 * **Callback shapes, confirmed against the installed `better-auth@1.6.24`
 * runtime** (`node_modules/better-auth/dist/api/routes/{email-verification,
 * password}.mjs`, since the generic options type doesn't pin the callback
 * signature literally): both `sendVerificationEmail` and `sendResetPassword`
 * are called as `(data: { user, url, token }, request: Request) =>
 * Promise<void>` — a `{ user, url, token }` payload plus the original
 * `Request`. This module's exported functions match that shape exactly so
 * they can be passed directly as the callbacks.
 *
 * **Transport is memoized** the same lazy way `auth-server.ts` memoizes the
 * `betterAuth(...)` instance: built once (on first email actually sent) and
 * reused for the process lifetime, with a `__resetEmailTransportForTests()`
 * hook so tests can force a fresh build after toggling `SMTP_*` env.
 *
 * **`SMTP_PORT: 465` implies `secure: true`.** This mirrors the standard
 * SMTP convention nodemailer itself documents (465 is the implicit-TLS
 * port; 587/25 use STARTTLS, i.e. `secure: false` with TLS negotiated after
 * connecting) — no separate `SMTP_SECURE` env var is introduced, since 465
 * vs. everything-else is unambiguous for the SMTP providers this repo
 * targets. If a self-hoster's provider needs an unusual combination, that is
 * a documented follow-up, not something this slice's minimal transport
 * needs to anticipate.
 */

/** Raised when a required `SMTP_*` environment variable is missing. */
export class SmtpNotConfiguredError extends Error {
  constructor(missing: string) {
    super(
      `Cannot send email: ${missing} is not set. SMTP_HOST, SMTP_PORT, ` +
        "SMTP_USER, SMTP_PASS, and SMTP_FROM are all required for GetWrite's " +
        "hosted authentication email flows (FR14, FR23). See the README's " +
        "self-host environment table.",
    );
    this.name = "SmtpNotConfiguredError";
  }
}

/** The `{ user, url, token }` payload better-auth passes to both callbacks. */
interface EmailCallbackData {
  user: User;
  url: string;
  token: string;
}

/**
 * Process-wide `nodemailer` transport, built lazily on first send.
 * Memoized because building it is unnecessary work to repeat per email.
 */
let cachedTransport: Transporter | null = null;

/**
 * Test-only hook to clear the memoized transport, so a test that toggles
 * `SMTP_*` env observes a fresh build on its next send.
 */
export function __resetEmailTransportForTests(): void {
  cachedTransport = null;
}

/** Reads a required `SMTP_*` env var, throwing {@link SmtpNotConfiguredError} if unset/empty. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new SmtpNotConfiguredError(name);
  }
  return value;
}

/**
 * Builds the `nodemailer` transport from `SMTP_*` environment variables.
 *
 * @throws {SmtpNotConfiguredError} When any required `SMTP_*` var is
 *   missing/empty. No transport is constructed in that case.
 */
function buildTransport(): Transporter {
  const host = requireEnv("SMTP_HOST");
  const portRaw = requireEnv("SMTP_PORT");
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");
  // SMTP_FROM is required too, but it's read at send time (resolveFromAddress),
  // not here — validated eagerly all the same via requireEnv there.

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    throw new SmtpNotConfiguredError("SMTP_PORT (not a valid number)");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Returns the process-wide `nodemailer` transport, building it lazily on
 * first call and memoizing it thereafter.
 *
 * @throws {SmtpNotConfiguredError} When required `SMTP_*` config is missing.
 */
function getEmailTransport(): Transporter {
  if (!cachedTransport) {
    cachedTransport = buildTransport();
  }
  return cachedTransport;
}

/** Resolves the configured `SMTP_FROM` address, or throws if unset. */
function resolveFromAddress(): string {
  return requireEnv("SMTP_FROM");
}

/**
 * better-auth `emailVerification.sendVerificationEmail` callback (FR11/FR14).
 * Sends a plain-text email containing the verification link.
 */
export async function sendVerificationEmail(
  data: EmailCallbackData,
): Promise<void> {
  const transport = getEmailTransport();
  await transport.sendMail({
    from: resolveFromAddress(),
    to: data.user.email,
    subject: "Verify your GetWrite email",
    text: `Click this link to verify your email: ${data.url}`,
  });
}

/**
 * better-auth `emailAndPassword.sendResetPassword` callback (FR13/FR14).
 * Sends a plain-text email containing the password-reset link.
 */
export async function sendResetPassword(
  data: EmailCallbackData,
): Promise<void> {
  const transport = getEmailTransport();
  await transport.sendMail({
    from: resolveFromAddress(),
    to: data.user.email,
    subject: "Reset your GetWrite password",
    text: `Click this link to reset your password: ${data.url}`,
  });
}
