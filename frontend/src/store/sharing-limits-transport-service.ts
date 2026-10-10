/**
 * @module sharing-limits-transport-service
 *
 * Client read of `GET /api/sharing/limits` (Feature 77, FR-19, FR-20).
 * Follows `auth-status-transport-service.ts` (createTransport, native
 * inlined with no dynamic import) with one deliberate difference: that
 * service degrades to a safe default, this one must not. A network error,
 * non-OK response or body failing validation REJECTS, so the caller can map
 * it to "unknown" and never mistake a failed read for `exempt`
 * (`docs/standards/failure-visibility.md`). Never cached.
 *
 * Native (Capacitor) has no `app/api` and no sharing, so it returns `exempt`
 * with no HTTP call. No `node:*` import, so no web-stub is needed.
 */
import { SharingLimitsResponseSchema } from "../lib/api/schemas";
import { reportTransportValidationFailure } from "../lib/api/transport-validation";
import { createTransport } from "./transport/create-transport";

/** The five limit switches; true means restricted for a paired device. */
interface SharingLimits {
  projectDeletion: boolean;
  unlocking: boolean;
  locking: boolean;
  encryptionChanges: boolean;
  permanentDeletion: boolean;
}

export type SharingLimitsAnswer =
  | { state: "exempt" }
  | { state: "paired"; limits: SharingLimits };

const EXEMPT: SharingLimitsAnswer = { state: "exempt" };

async function httpSharingLimits(): Promise<SharingLimitsAnswer> {
  const response = await fetch("/api/sharing/limits", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to read sharing limits (HTTP ${response.status}).`);
  }
  const parsed = SharingLimitsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(
      "sharing-limits.fetchSharingLimits",
      parsed.error.issues,
    );
    throw new Error("The sharing limits response was malformed.");
  }
  return parsed.data.role === "exempt"
    ? EXEMPT
    : { state: "paired", limits: parsed.data.limits };
}

async function nativeSharingLimits(): Promise<SharingLimitsAnswer> {
  return EXEMPT;
}

const resolveSharingLimitsTransport: () => Promise<
  () => Promise<SharingLimitsAnswer>
> = createTransport(httpSharingLimits, async () => nativeSharingLimits);

/** Reads the caller's limits. Rejects on any failure; never returns a failure as exempt. */
export async function fetchSharingLimits(): Promise<SharingLimitsAnswer> {
  const transport = await resolveSharingLimitsTransport();
  return transport();
}
