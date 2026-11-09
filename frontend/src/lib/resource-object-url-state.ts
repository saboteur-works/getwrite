/**
 * @module resource-object-url-state
 *
 * The state a media resource's bytes can be in, and the one classifier that
 * turns a read error into a message state (Feature 105, FR-4). Shared by
 * `useResourceObjectUrl` and `resource-blob-cache` so both classify
 * identically. Framework-free: no React, no `node:*`.
 */
import { isLockedAccessError } from "./models/locked-access";

/** Shown when the project is locked (same wording as the attachment preview). */
export const RESOURCE_LOCKED_MESSAGE =
  "This project is locked. Unlock it, then try again.";
/** Shown for any read failure that is not a size refusal or a lock. */
export const RESOURCE_READ_FAILED_MESSAGE = "This file cannot be shown.";

/** Shown when the read failed for lack of memory on the device. */
export const RESOURCE_OUT_OF_MEMORY_MESSAGE =
  "Not enough memory on this device to show this file.";

/** What the viewer knows about one media resource's bytes. */
export type ResourceObjectUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string; kind: "image" | "audio" }
  | { status: "refused"; message: string }
  | { status: "locked"; message: string }
  | { status: "failed"; message: string };

/** The failure state for anything that is not a refusal or a lock. */
export const RESOURCE_FAILED_STATE: ResourceObjectUrlState = {
  status: "failed",
  message: RESOURCE_READ_FAILED_MESSAGE,
};

/**
 * The core's refusal is told apart by `name`, not `instanceof`: the core
 * module pulls in `node:*` and must not be imported by client code.
 */
function isTooLargeRefusal(error: unknown): error is Error {
  return error instanceof Error && error.name === "ResourceBytesTooLargeError";
}

/**
 * An allocation failure is recognised by its message text (owner's choice):
 * the native bridge reports it as a plain failure, so "Failed to allocate" or
 * "OutOfMemory" in the text is the only signal there is.
 */
function isOutOfMemoryFailure(error: unknown): boolean {
  let text: string;
  if (typeof error === "string") {
    text = error;
  } else if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    text = String((error as { message: unknown }).message);
  } else {
    return false;
  }
  return text.includes("Failed to allocate") || text.includes("OutOfMemory");
}

/** Maps a rejected read to the message state shown in its place. */
export function resourceErrorState(error: unknown): ResourceObjectUrlState {
  if (isLockedAccessError(error)) {
    return { status: "locked", message: RESOURCE_LOCKED_MESSAGE };
  }
  if (isTooLargeRefusal(error)) {
    return { status: "refused", message: error.message };
  }
  if (isOutOfMemoryFailure(error)) {
    return { status: "failed", message: RESOURCE_OUT_OF_MEMORY_MESSAGE };
  }
  return RESOURCE_FAILED_STATE;
}
