import ResetPasswordForm from "../../../components/Auth/ResetPasswordForm";
import { isHostedAuthActive } from "../../../src/lib/auth/auth-config";

/**
 * @module ResetPasswordPage
 *
 * `/reset-password/[token]` — a sibling of `app/(app)/`, not nested under
 * it, matching the URL better-auth's `sendResetPassword` callback emails
 * (`${baseURL}/reset-password/${token}?callbackURL=...`, per
 * `password.mjs`'s `requestPasswordReset` handler).
 *
 * A thin server component: reads the `token` route param and hosted-auth
 * gate, then renders {@link ResetPasswordForm} (a client component — the
 * actual `resetPassword({ newPassword, token })` submission needs client
 * interaction, unlike `/verify-email`'s load-time token consumption; see
 * `ResetPasswordForm`'s module doc). When hosted auth is inactive, renders
 * the same "not applicable" fallback as `/login` and `/verify-email` rather
 * than a form that would call a nonexistent auth backend.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<JSX.Element> {
  const { token } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gw-chrome1 px-4">
      <div className="w-full max-w-sm border border-gw-border bg-gw-chrome2 p-6">
        {isHostedAuthActive() ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-center text-gw-body text-gw-secondary">
            Accounts aren&apos;t used in this build of GetWrite.
          </p>
        )}
      </div>
    </div>
  );
}
