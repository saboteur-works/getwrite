"use client";

import { useSharingLimits } from "../../components/Sharing/SharingLimitsContext";

/**
 * Whether the writer's personal dictionary (the user word list) may be
 * offered and loaded on this device (Feature 96, FR-7, FR-11).
 *
 * - `available`: Android (native runtime, no `/api`), or sharing-limits role
 *   `exempt` (desktop window, sharing off, hosted web).
 * - `unavailable`: role `paired`; the list is hidden and never loaded.
 * - `unknown`: role not yet read, or the read failed. Fails closed: callers
 *   must neither offer the menu entry nor load the list, and must not treat
 *   it as `paired` either (a later read may turn it `available`).
 *
 * The native check is the raw `process.env` comparison used by
 * `createTransport` so Next.js inlines it at build time.
 */
export type UserListAvailability = "available" | "unavailable" | "unknown";

export function useUserListAvailable(): UserListAvailability {
  const { state } = useSharingLimits();
  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") {
    return "available";
  }
  if (state.state === "exempt") return "available";
  if (state.state === "paired") return "unavailable";
  return "unknown";
}
