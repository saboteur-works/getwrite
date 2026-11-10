/**
 * @module api/share-capture-types
 *
 * Types-only shapes for the Android share target (Feature 107, FR-3): the
 * `ShareIn` plugin contract that the Java plugin (Task 5) and the TypeScript
 * wrapper (Task 6) implement on each side, the share items, and the per-item
 * and per-share results. Imports nothing: no React, no `node:*`, no
 * Capacitor, so every build can bundle it.
 *
 * Event and method names the Java side must match: the event
 * `shareReceived` carrying `{ shareId, items }`, and the methods
 * `addListener` and `acknowledge({ shareId })`.
 */

/** Shared text. Any sender subject is not part of the contract and is ignored. */
export interface ShareTextItem {
  kind: "text";
  text: string;
}

/**
 * A shared image, by reference only. The plugin copies nothing; the bytes are
 * read from `uri` after a project is chosen. `size` is present only when the
 * provider reported it.
 */
export interface ShareImageItem {
  kind: "image";
  /** A `content://` URI. */
  uri: string;
  name: string;
  mimeType: string;
  /** Size in bytes, when the provider reports it. */
  size?: number;
}

/** One entry of a share. */
export type ShareItem = ShareTextItem | ShareImageItem;

/** The payload of the plugin's `shareReceived` event. */
export interface ShareReceivedEvent {
  /** Identifies the share so it can be acknowledged once taken (FR-14). */
  shareId: string;
  /** Items in the order delivered. */
  items: ShareItem[];
}

/** The name of the event the plugin emits. */
export type ShareReceivedEventName = "shareReceived";

/** A handle that removes a listener. */
interface ShareListenerHandle {
  remove: () => Promise<void>;
}

/** The plugin methods, as registered under the plugin name `ShareIn`. */
export interface ShareInPluginContract {
  /** Adds a listener; a share held before a listener exists is replayed to it. */
  addListener: (
    eventName: ShareReceivedEventName,
    listener: (event: ShareReceivedEvent) => void,
  ) => Promise<ShareListenerHandle>;
  /** Marks the share's intent consumed once the web layer has taken it. */
  acknowledge: (options: { shareId: string }) => Promise<void>;
}

/** An item that became a resource. */
interface ShareItemCaptured {
  status: "captured";
  index: number;
  kind: ShareItem["kind"];
  resourceId: string;
  /** The project's Inbox folder id after the capture (it may have just been created). */
  inboxFolderId: string;
}

/** An item refused by a rule (for example the size cap); nothing was written. */
interface ShareItemRefused {
  status: "refused";
  index: number;
  kind: ShareItem["kind"];
  message: string;
}

/** An item that failed (for example a read error); never the same as a refusal. */
interface ShareItemFailed {
  status: "failed";
  index: number;
  kind: ShareItem["kind"];
  message: string;
}

/** The outcome for one item. */
export type ShareItemResult =
  | ShareItemCaptured
  | ShareItemRefused
  | ShareItemFailed;

/** The outcome for a whole share: one entry per item, in order. */
export interface ShareResult {
  shareId: string;
  items: ShareItemResult[];
  /** How many items became resources. */
  capturedCount: number;
}

/** The size decision for a shared image. */
export type ShareSizeDecision =
  | { outcome: "accept" }
  | { outcome: "refuse"; size: number; message: string }
  | { outcome: "needs-counted-read" };

/** The result of classifying a shared text item. */
export type ShareTextClassification =
  | { linkOnly: true; body: string; capturedLink: string }
  | { linkOnly: false; body: string };
