// Last Updated: 2026-07-22

import { createAuthClient } from "better-auth/react";

/**
 * @module auth-client
 *
 * The client-side counterpart to `auth-server.ts` (Slice 6,
 * `specs/features/auth-provider.md`). Wraps better-auth's React client
 * (`createAuthClient` from `better-auth/react`) — the one better-auth
 * export this module is allowed to import, since everything else
 * (`better-auth` core, `auth-server.ts`, `auth-config.ts`, `email.ts`, `pg`)
 * is server-only and must never reach a client bundle (FR5).
 *
 * **No `"use client"` directive on this file itself.** `better-auth/react`'s
 * `createAuthClient` is safe to call from any module graph — it does not
 * touch the DOM at call time, only `useSession()` (a hook) requires a
 * client component. This module is imported from client components
 * (`AuthScreen.tsx`, `ShellSettingsMenu.tsx`, the verify/reset pages), which
 * themselves carry `"use client"`.
 *
 * **`baseURL` is intentionally omitted.** better-auth's client config
 * (`node_modules/better-auth/dist/client/config.mjs`,
 * `getClientConfig`) falls back to `"/api/auth"` when no `baseURL` is
 * given, which is exactly this app's better-auth mount point
 * (`app/api/auth/[...all]/route.ts`) and is same-origin relative — correct
 * for every deployment (hosted, self-host, local dev) without
 * environment-specific configuration on the client. Explicitly setting it
 * would just be a longer way of expressing the same default.
 *
 * **Action method names/argument shapes below are verified against the
 * installed `better-auth@1.6.24` runtime**, not assumed from convention:
 * - `signIn.email({ email, password })` — POST `/sign-in/email`
 *   (`api/routes/sign-in.mjs`'s `signInEmailBodySchema`).
 * - `signUp.email({ name, email, password })` — POST `/sign-up/email`
 *   (`api/routes/sign-up.mjs`'s `signUpEmailBodySchema`; `name` is
 *   required, not optional).
 * - `signOut()` — POST `/sign-out` (`api/routes/sign-out.mjs`), no body.
 * - `revokeSessions()` — POST `/revoke-sessions`
 *   (`api/routes/session.mjs`), no body; revokes every session for the
 *   current user (the "log out everywhere" action, FR17).
 * - `requestPasswordReset({ email, redirectTo? })` — POST
 *   `/request-password-reset` (`api/routes/password.mjs`). **Not**
 *   `forgetPassword` — that name only exists on the separate `email-otp`
 *   plugin (`plugins/email-otp/routes.mjs`), which this slice does not use;
 *   the core email+password reset-request endpoint's path segment
 *   (`request-password-reset`) camelCases to `requestPasswordReset` via
 *   better-auth's client proxy (`client/path-to-object.d.mts`'s
 *   `CamelCase<S>`).
 * - `resetPassword({ newPassword, token })` — POST `/reset-password`
 *   (`api/routes/password.mjs`'s `resetPassword` endpoint body schema).
 * - `verifyEmail({ query: { token } })` — GET `/verify-email`
 *   (`api/routes/email-verification.mjs`): a `GET` endpoint's params are
 *   sent as `query`, per the client proxy's `InferCtxQuery` — confirmed by
 *   the endpoint's `query: z.object({ token, callbackURL? })` schema.
 *
 * Every action resolves to `{ data, error }` (no `throw: true` is
 * configured anywhere in this app), where `error` — when present — carries
 * `status` (the better-auth status literal's numeric HTTP code, e.g. `403`
 * for `FORBIDDEN`) and `code` (the specific `BASE_ERROR_CODES` key, e.g.
 * `"EMAIL_NOT_VERIFIED"` or `"INVALID_EMAIL_OR_PASSWORD"` — see
 * `@better-auth/core`'s `defineErrorCodes`, which sets `code` to the error
 * map's own key). `AuthScreen.tsx` keys its unverified-vs-generic-failure
 * distinction (FR11) off `error.code === "EMAIL_NOT_VERIFIED"`.
 */
// Not exported directly — every consumer in this codebase (`AuthScreen.tsx`,
// `ResetPasswordForm.tsx`, `use-auth-session.ts`, `AppShell.tsx`) imports one
// of the named actions below instead. `verifyEmail` is deliberately not
// re-exported here: `/verify-email` consumes the token server-side via
// `getAuthServer().api.verifyEmail(...)` (`verify-email-core.ts`, per
// Finding 3), so no client caller needs this client-side action — keeping it
// out avoids an unused export.
const authClient = createAuthClient();

/** Session hook — `{ data, isPending, isRefetching, error, refetch }`. */
export const useSession = authClient.useSession;

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
export const revokeSessions = authClient.revokeSessions;
export const requestPasswordReset = authClient.requestPasswordReset;
export const resetPassword = authClient.resetPassword;
