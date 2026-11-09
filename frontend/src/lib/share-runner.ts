/**
 * @module share-runner
 *
 * Feature 107 (FR-5 to FR-8, FR-11): captures every item of a share into the
 * chosen project, in the order delivered, and returns one outcome naming each
 * refused or failed item. Text goes through `captureToInbox` with origin
 * `shared` (a link-only item sends the URL as text and as link; the sender's
 * subject is not part of the contract and is never sent). Images go through
 * the guard pre-check, then the reader, then the image backend.
 *
 * The runner takes the project id as an argument and holds none, so nothing
 * is read or written before the host has chosen a project. The project id is
 * the on-disk DIRECTORY id.
 *
 * FR-11 ordering: the encrypted-project guard runs (`assertImageAllowed`)
 * before the first image read of a run; a refusal raised there or by the
 * first text capture refuses the whole share with nothing written.
 *
 * No React and no Node built-in imports. The capture functions and the reader are
 * injectable for tests.
 */
import { captureToInbox } from "./api/inbox-capture";
import {
  assertImageCaptureAllowed,
  captureImageToInbox,
} from "./api/inbox-image-capture";
import {
  isEncryptedProjectCaptureRefusal,
  type EncryptedProjectRefusalReason,
} from "./api/encrypted-project-refusal";
import type {
  CaptureRequest,
  CaptureResult,
  InboxTrashChoice,
} from "./api/inbox-capture-types";
import type {
  ShareImageItem,
  ShareItem,
  ShareItemResult,
  ShareReceivedEvent,
  ShareResult,
} from "./api/share-capture-types";
import type {
  ImageCaptureRequest,
  ImageCaptureResult,
} from "./models/inbox-image-capture-core";
import { isLockedAccessError } from "./models/locked-access";
import { classifyShareText } from "./models/share-item-core";
import {
  readSharedImage,
  type SharedImageReadResult,
} from "../store/transport/shared-content-reader";

/** The calls the runner makes; replaced by fakes in tests. */
export interface ShareRunnerDeps {
  captureText: (request: CaptureRequest) => Promise<CaptureResult>;
  captureImage: (request: ImageCaptureRequest) => Promise<ImageCaptureResult>;
  readImage: (item: ShareImageItem) => Promise<SharedImageReadResult>;
  /** The guard alone; must reject before any image bytes are read. */
  assertImageAllowed: (projectId: string) => Promise<void>;
}

const DEFAULT_DEPS: ShareRunnerDeps = {
  captureText: captureToInbox,
  captureImage: captureImageToInbox,
  readImage: (item) => readSharedImage(item),
  assertImageAllowed: assertImageCaptureAllowed,
};

/** Items already dealt with; passed back in to resume after a choice. */
export interface ShareRunProgress {
  results: ShareItemResult[];
}

/** Options of one run. */
export interface ShareRunOptions {
  /** The writer's one choice for an Inbox in Trash, applied to every item. */
  inboxChoice?: InboxTrashChoice;
  /** Progress returned with a `needs-choice` outcome. */
  progress?: ShareRunProgress;
}

/** What a run ends with. */
export type ShareRunOutcome =
  | { status: "done"; result: ShareResult }
  | {
      /** The Inbox is in Trash; the item at `progress.results.length` is unwritten. */
      status: "needs-choice";
      state: "inbox-in-trash";
      progress: ShareRunProgress;
    }
  | {
      /** The whole share was refused; nothing was captured. */
      status: "refused";
      reason: EncryptedProjectRefusalReason;
      message: string;
    }
  | {
      /** An empty share: a failure, never a success. */
      status: "failed";
      message: string;
    }
  | {
      /**
       * A locked-access error (or a late refusal) stopped the run. `error` is
       * the original error, untouched, for the host to handle. `held` are the
       * items not yet captured, in order; `results` only the items captured,
       * refused or failed before the stop.
       */
      status: "stopped";
      error: unknown;
      held: ShareItem[];
      results: ShareItemResult[];
    };

const EMPTY_SHARE_MESSAGE =
  "The share held nothing to capture. Nothing was saved.";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Result of one item: a settled result, a choice request or a stop. */
type ItemStep =
  | { kind: "result"; result: ShareItemResult }
  | { kind: "needs-choice" }
  | { kind: "stop"; error: unknown };

function refusedFromNotices(
  index: number,
  kind: ShareItem["kind"],
  notices: { message: string }[],
): ShareItemResult {
  const message =
    notices.map((n) => n.message).join(" ") || "The item was refused.";
  return { status: "refused", index, kind, message };
}

async function captureTextItem(
  item: Extract<ShareItem, { kind: "text" }>,
  index: number,
  projectId: string,
  choice: InboxTrashChoice | undefined,
  deps: ShareRunnerDeps,
): Promise<ItemStep> {
  const classified = classifyShareText(item);
  const request: CaptureRequest = {
    projectId,
    text: classified.body,
    origin: "shared",
    ...(classified.linkOnly ? { link: classified.capturedLink } : {}),
    ...(choice === undefined ? {} : { inboxChoice: choice }),
  };
  const result = await deps.captureText(request);
  if (result.status === "needs-choice") return { kind: "needs-choice" };
  if (result.status === "refused") {
    return {
      kind: "result",
      result: refusedFromNotices(index, "text", result.notices),
    };
  }
  return {
    kind: "result",
    result: {
      status: "captured",
      index,
      kind: "text",
      resourceId: result.resourceId,
    },
  };
}

async function captureImageItem(
  item: ShareImageItem,
  index: number,
  projectId: string,
  choice: InboxTrashChoice | undefined,
  deps: ShareRunnerDeps,
): Promise<ItemStep> {
  const read = await deps.readImage(item);
  if (read.status === "refused") {
    return {
      kind: "result",
      result: {
        status: "refused",
        index,
        kind: "image",
        message: read.message,
      },
    };
  }
  if (read.status === "failed") {
    return {
      kind: "result",
      result: { status: "failed", index, kind: "image", message: read.message },
    };
  }
  const request: ImageCaptureRequest = {
    projectId,
    bytes: read.bytes,
    name: item.name,
    mimeType: item.mimeType,
    ...(item.size === undefined ? {} : { size: item.size }),
    ...(choice === undefined ? {} : { inboxChoice: choice }),
  };
  const result = await deps.captureImage(request);
  if (result.status === "needs-choice") return { kind: "needs-choice" };
  if (result.status === "refused") {
    return {
      kind: "result",
      result: {
        status: "refused",
        index,
        kind: "image",
        message: result.message,
      },
    };
  }
  return {
    kind: "result",
    result: {
      status: "captured",
      index,
      kind: "image",
      resourceId: result.resourceId,
    },
  };
}

/** Runs one item; every non-propagating error becomes that item's failure. */
async function runItem(
  item: ShareItem,
  index: number,
  projectId: string,
  choice: InboxTrashChoice | undefined,
  deps: ShareRunnerDeps,
): Promise<ItemStep> {
  try {
    return item.kind === "text"
      ? await captureTextItem(item, index, projectId, choice, deps)
      : await captureImageItem(item, index, projectId, choice, deps);
  } catch (err: unknown) {
    if (isLockedAccessError(err) || isEncryptedProjectCaptureRefusal(err)) {
      return { kind: "stop", error: err };
    }
    return {
      kind: "result",
      result: {
        status: "failed",
        index,
        kind: item.kind,
        message: `The item could not be captured: ${errorText(err)}`,
      },
    };
  }
}

/** Stop outcome for a typed refusal or a locked error. */
function stopOutcome(
  error: unknown,
  items: readonly ShareItem[],
  at: number,
  results: ShareItemResult[],
): ShareRunOutcome {
  if (
    isEncryptedProjectCaptureRefusal(error) &&
    !results.some((r) => r.status === "captured")
  ) {
    return { status: "refused", reason: error.reason, message: error.message };
  }
  return { status: "stopped", error, held: items.slice(at), results };
}

/**
 * Captures every item of a share into the chosen project, in order.
 *
 * @param share - The delivered share.
 * @param projectId - The chosen project's on-disk directory id.
 * @param options - The writer's Inbox choice and earlier progress, when
 *   resuming after a `needs-choice` outcome.
 * @param deps - Capture functions and reader; omit in production.
 * @returns The outcome; see {@link ShareRunOutcome}. A refused or failed item
 *   does not stop the others.
 */
export async function runShare(
  share: ShareReceivedEvent,
  projectId: string,
  options: ShareRunOptions = {},
  deps: ShareRunnerDeps = DEFAULT_DEPS,
): Promise<ShareRunOutcome> {
  const { items } = share;
  if (items.length === 0) {
    return { status: "failed", message: EMPTY_SHARE_MESSAGE };
  }
  const results: ShareItemResult[] = [...(options.progress?.results ?? [])];

  const firstImage = items.findIndex(
    (item, i) => i >= results.length && item.kind === "image",
  );
  const guardAt = firstImage;

  for (let i = results.length; i < items.length; i++) {
    const item = items[i]!;
    if (i === guardAt) {
      try {
        await deps.assertImageAllowed(projectId);
      } catch (err: unknown) {
        if (isLockedAccessError(err) || isEncryptedProjectCaptureRefusal(err)) {
          return stopOutcome(err, items, i, results);
        }
        results.push({
          status: "failed",
          index: i,
          kind: "image",
          message: `The project could not be checked: ${errorText(err)}`,
        });
        continue;
      }
    }
    const step = await runItem(item, i, projectId, options.inboxChoice, deps);
    if (step.kind === "needs-choice") {
      return {
        status: "needs-choice",
        state: "inbox-in-trash",
        progress: { results },
      };
    }
    if (step.kind === "stop") return stopOutcome(step.error, items, i, results);
    results.push(step.result);
  }
  return { status: "done", result: buildResult(share.shareId, results) };
}

function buildResult(shareId: string, items: ShareItemResult[]): ShareResult {
  return {
    shareId,
    items,
    capturedCount: items.filter((i) => i.status === "captured").length,
  };
}

/** A plain-words account of a finished share. */
export interface ShareResultSummary {
  allCaptured: boolean;
  message: string;
}

/**
 * Summarises a finished share: says so when every item was captured, and
 * otherwise how many of the total were.
 *
 * @param result - The share's result.
 */
export function summarizeShareResult(result: ShareResult): ShareResultSummary {
  const total = result.items.length;
  const isAllCaptured = total > 0 && result.capturedCount === total;
  const message = isAllCaptured
    ? total === 1
      ? "The item was captured."
      : `All ${total} items were captured.`
    : `${result.capturedCount} of ${total} items were captured.`;
  return { allCaptured: isAllCaptured, message };
}
