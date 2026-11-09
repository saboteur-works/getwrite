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

/** Maps a rejected read to the message state shown in its place. */
export function resourceErrorState(error: unknown): ResourceObjectUrlState {
  if (isLockedAccessError(error)) {
    return { status: "locked", message: RESOURCE_LOCKED_MESSAGE };
  }
  if (isTooLargeRefusal(error)) {
    return { status: "refused", message: error.message };
  }
  return RESOURCE_FAILED_STATE;
}
