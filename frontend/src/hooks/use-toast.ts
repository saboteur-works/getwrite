/**
 * @module useToast
 *
 * React hook wrapper around the toast service for component usage.
 * Provides semantic methods for showing toast notifications.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 * const id = toast.loading("Saving...");
 * await saveData();
 * toast.dismiss(id);
 * ```
 */

"use client";

import { toastService } from "../lib/toast-service";

/**
 * React hook that provides access to toast notification methods.
 *
 * @returns Toast service methods for showing notifications
 */
export function useToast() {
  return toastService;
}

export default useToast;
