"use client";

import AuthScreen from "../../components/Auth/AuthScreen";
import { useAuthSession } from "../../src/lib/auth/use-auth-session";

/**
 * @module LoginPage
 *
 * `/login` — a sibling of the `app/(app)/` route group, not nested under
 * it, so it is never subject to `(app)/layout.tsx`'s redirect gate (which
 * would otherwise loop an unauthenticated visitor straight back to
 * `/login`). This is the target of every redirect in this slice: the
 * page-route gate (`session-guard.ts`'s `shouldRedirectToLogin`), and — via
 * `AuthScreen`'s default `onAuthenticated` — the post-login destination is
 * `/` (`app/(app)/page.tsx`, the app shell).
 *
 * **Desktop/local fallback (FR22).** Nothing in the desktop/local build
 * ever links here — there is no login affordance to click — but this page
 * must not crash or attempt a network call to a nonexistent auth backend if
 * somehow visited directly (e.g. a stale bookmark, or a user typing the URL
 * by hand). `useAuthSession()` resolves `hostedAuthActive: false` in that
 * case (the fail-safe default until the `/api/auth-status` read settles,
 * and the real answer once it does), and this component renders a small
 * "not applicable" message instead of `AuthScreen` — never a login form
 * that would `signIn.email(...)` against a mount point
 * (`/api/auth/[...all]`) that 404s in this deployment mode.
 */
export default function LoginPage(): JSX.Element {
  const { hostedAuthActive: isHostedAuthActive, isLoading } = useAuthSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gw-chrome1">
        <p className="text-gw-body text-gw-secondary">Loading…</p>
      </div>
    );
  }

  if (!isHostedAuthActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gw-chrome1 px-4">
        <p className="max-w-sm text-center text-gw-body text-gw-secondary">
          Accounts aren&apos;t used in this build of GetWrite.
        </p>
      </div>
    );
  }

  return <AuthScreen />;
}
