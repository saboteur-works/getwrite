"use client";

/**
 * @module UserWordListRuntime
 *
 * Mounts the user word list lifecycle once at the app root (Feature 96,
 * FR-18, FR-23). Renders nothing. Must sit inside the store provider and
 * `SharingLimitsProvider`.
 */

import { useUserListLifecycle } from "../../src/hooks/useUserListLoading";

export default function UserWordListRuntime(): null {
  useUserListLifecycle();
  return null;
}
