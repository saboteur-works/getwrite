/**
 * @module useToast
 *
 * React hook wrapper around the toast service for component usage.
 * Provides semantic methods for showing toast notifications.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useToast } from "@/hooks/use-toast";
 *
 * export function MyComponent() {
 *   const toast = useToast();
 *
 *   const handleSave = async () => {
 *     const id = toast.loading("Saving...");
 *     try {
 *       await saveData();
 *       toast.success("Saved successfully!", "Your changes are saved");
 *       toast.dismiss(id);
 *     } catch (error) {
 *       toast.error("Save failed", error.message);
 *       toast.dismiss(id);
 *     }
 *   };
 *
 *   return <button onClick={handleSave}>Save</button>;
 * }
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
