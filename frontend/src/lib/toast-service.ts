/**
 * @module toast-service
 *
 * Centralized toast notification helpers using react-hot-toast.
 *
 * Provides semantic feedback methods for common operations:
 * - Success confirmations (create, delete, copy, export)
 * - Loading states for async operations
 * - Error messages with context
 *
 * Configuration: Stack in bottom-right, auto-dismiss in ~3s.
 *
 * @example
 * ```tsx
 * import { toastService } from '@/lib/toast-service';
 *
 * toastService.success("Project created: My Book");
 * toastService.error("Failed to delete resource", "Please try again");
 * ```
 */

import toast from "react-hot-toast";

/**
 * Toast notification service with semantic methods for common app operations.
 */
export const toastService = {
    /**
     * Show a success message (auto-dismisses after 3s).
     *
     * @param message - Primary message text.
     * @param description - Optional secondary description.
     *
     * @example
     * ```tsx
     * toastService.success("Project created", "New Book");
     * ```
     */
    success: (message: string, description?: string): string => {
        const content = description ? `${message}\n${description}` : message;
        return toast.success(content, {
            duration: 3000,
            position: "bottom-right",
        });
    },

    /**
     * Show an error message (longer duration: 4s).
     *
     * @param message - Primary error message.
     * @param description - Optional detailed error description.
     *
     * @example
     * ```tsx
     * toastService.error("Failed to delete", "Resource is locked");
     * ```
     */
    error: (message: string, description?: string): string => {
        const content = description ? `${message}\n${description}` : message;
        return toast.error(content, {
            duration: 4000,
            position: "bottom-right",
        });
    },

    /**
     * Show a loading message.
     *
     * Returns a toast ID that can be updated with `dismiss()`, `success()`, or `error()`.
     *
     * @param message - Loading message text.
     *
     * @example
     * ```tsx
     * const toastId = toastService.loading("Creating project...");
     * try {
     *   await createProject(...);
     *   toastService.success("Project created!");
     *   toast.remove(toastId);
     * } catch (e) {
     *   toastService.error("Failed to create");
     *   toast.remove(toastId);
     * }
     * ```
     */
    loading: (message: string): string => {
        return toast.loading(message, {
            position: "bottom-right",
        });
    },

    /**
     * Show an informational message (3s duration).
     *
     * @param message - Information message text.
     *
     * @example
     * ```tsx
     * toastService.info("Copied to clipboard");
     * ```
     */
    info: (message: string): string => {
        return toast(message, {
            duration: 3000,
            position: "bottom-right",
            icon: "ℹ️",
        });
    },

    /**
     * Dismiss a specific toast by ID.
     *
     * @param toastId - The ID returned from a toast function.
     *
     * @example
     * ```tsx
     * const id = toastService.loading("Working...");
     * toastService.dismiss(id);
     * ```
     */
    dismiss: (toastId: string): void => {
        toast.remove(toastId);
    },

    /**
     * Dismiss all toasts currently visible.
     *
     * @example
     * ```tsx
     * toastService.dismissAll();
     * ```
     */
    dismissAll: (): void => {
        toast.remove();
    },
};

export default toastService;
