import Link from "next/link";
import { verifyEmailToken } from "../../src/lib/auth/verify-email-core";

/**
 * @module VerifyEmailPage
 *
 * `/verify-email` — a sibling of `app/(app)/`, not nested under it, so an
 * unauthenticated visitor clicking the verification link in their email
 * (`${baseURL}/verify-email?token=...`, per better-auth's
 * `sendVerificationEmail` callback wiring) reaches this page directly
 * rather than being redirected to `/login` by `(app)/layout.tsx`'s gate.
 *
 * A thin async server component: reads `token` from `searchParams`, defers
 * the actual verification decision to `verify-email-core.ts`'s
 * {@link verifyEmailToken} (kept separately unit-tested per that module's
 * doc comment), and renders the corresponding message with a link back to
 * `/login`.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<JSX.Element> {
  const { token } = await searchParams;
  const outcome = await verifyEmailToken(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gw-chrome1 px-4">
      <div className="w-full max-w-sm border border-gw-border bg-gw-chrome2 p-6 text-center">
        {outcome.status === "success" ? (
          <>
            <h1 className="mb-3 font-sans text-gw-h2 text-gw-primary">
              Email verified
            </h1>
            <p className="mb-4 text-gw-body text-gw-secondary">
              Your account is verified — you can now log in.
            </p>
          </>
        ) : outcome.status === "not-applicable" ? (
          <p className="text-gw-body text-gw-secondary">
            Accounts aren&apos;t used in this build of GetWrite.
          </p>
        ) : (
          <>
            <h1 className="mb-3 font-sans text-gw-h2 text-gw-primary">
              Verification failed
            </h1>
            <p className="mb-4 text-gw-body text-gw-secondary">
              {outcome.status === "missing-token"
                ? "This verification link is missing its token."
                : "This verification link is invalid or has expired."}
            </p>
          </>
        )}
        {outcome.status !== "not-applicable" ? (
          <Link
            href="/login"
            className="font-mono text-[10px] uppercase tracking-label-wide text-gw-primary hover:underline"
          >
            Go to log in
          </Link>
        ) : null}
      </div>
    </div>
  );
}
