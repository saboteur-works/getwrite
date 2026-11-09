/**
 * @module api/inbox-capture-types
 *
 * Types-only shapes shared by the capture core, route, client and native
 * backend (Feature 106, FR-2). Imports nothing: no React, no `node:*`, so
 * every build can bundle it.
 */

/** Where the captured text came from; `shared` is logged as an import. */
export type CaptureOrigin = "typed" | "shared";

/** The writer's choice when the Inbox is in Trash. */
export type InboxTrashChoice = "restore" | "new";

/** What a capture call sends. */
export interface CaptureRequest {
  projectId: string;
  text: string;
  link?: string;
  origin: CaptureOrigin;
  /** Present only on the second call after a `needs-choice` result. */
  inboxChoice?: InboxTrashChoice;
}

/** Stable codes for notices a capture returns. */
export type CaptureNoticeCode =
  | "empty"
  | "text-too-long"
  | "link-invalid"
  | "seeding"
  | "writing-log"
  | "inbox-relocated"
  | "inbox-renamed";

/** A message the caller must show the writer; never a thrown error. */
export interface CaptureNotice {
  code: CaptureNoticeCode;
  severity: "info" | "error";
  message: string;
}

/** The item was written. */
export interface CaptureCreated {
  status: "created";
  resourceId: string;
  inboxFolderId: string;
  notices: CaptureNotice[];
}

/** The Inbox is in Trash; nothing was written. Carries only the state. */
export interface CaptureNeedsChoice {
  status: "needs-choice";
  state: "inbox-in-trash";
}

/** The capture was refused before any write. */
interface CaptureRefused {
  status: "refused";
  notices: CaptureNotice[];
}

/** The three outcomes of a capture call that does not throw. */
export type CaptureResult =
  | CaptureCreated
  | CaptureNeedsChoice
  | CaptureRefused;
