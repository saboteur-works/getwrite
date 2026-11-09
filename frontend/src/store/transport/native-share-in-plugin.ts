/**
 * @module store/transport/native-share-in-plugin
 *
 * Typed wrapper for the custom `ShareIn` Capacitor plugin (Feature 107, FR-3,
 * FR-14, FR-16). It adds a `shareReceived` listener, validates every event at
 * the boundary, hands a valid `{ shareId, items }` to the caller and then
 * calls `acknowledge({ shareId })` once the caller has taken the share, never
 * before. The plugin copies nothing; image items are references only.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): a malformed event,
 * a throwing callback and a failed acknowledge are each reported through
 * `onFailure` with a message that never carries shared content. A malformed
 * event or a failed callback is NOT acknowledged, so the plugin keeps it; it is
 * never passed on as an empty share.
 *
 * Whether the real bridge replays a retained event to a listener added late is
 * not asserted here; it is observed on a device (Feature 107, Task 14).
 *
 * No `node:*` and no React: this is bundled into the native build and swapped
 * for `native-share-in-plugin.web-stub` in the web/desktop build.
 */
import { registerPlugin } from "@capacitor/core";
import type {
  ShareInPluginContract,
  ShareItem,
  ShareReceivedEvent,
} from "../../lib/api/share-capture-types";

/** Callbacks a host supplies when it starts listening. */
export interface ShareListenerOptions {
  /** Takes a validated share; the share is acknowledged after this settles. */
  onShare: (event: ShareReceivedEvent) => void | Promise<void>;
  /** Receives a message for every malformed event or failure; no share text. */
  onFailure: (message: string) => void;
}

/** A running listener. */
export interface ShareListenerSession {
  /** Removes the listener. */
  stop: () => Promise<void>;
}

/** The outcome of validating a raw plugin event. */
export type ParsedShareEvent =
  | { ok: true; event: ShareReceivedEvent }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(raw: unknown): ShareItem | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "text") {
    return typeof raw.text === "string"
      ? { kind: "text", text: raw.text }
      : null;
  }
  if (raw.kind === "image") {
    const { uri, name, mimeType, size } = raw;
    if (
      typeof uri !== "string" ||
      uri.length === 0 ||
      typeof name !== "string" ||
      typeof mimeType !== "string"
    ) {
      return null;
    }
    if (size === undefined) return { kind: "image", uri, name, mimeType };
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
      return null;
    }
    return { kind: "image", uri, name, mimeType, size };
  }
  return null;
}

/**
 * Validates a raw `shareReceived` payload. Unknown item kinds, an image
 * without a uri, non-string text, a missing share id and an empty item list
 * are all rejected.
 *
 * @param raw - The unvalidated event from the bridge.
 * @returns The typed event, or the reason it was rejected (no content echoed).
 */
export function parseShareReceivedEvent(raw: unknown): ParsedShareEvent {
  if (!isRecord(raw)) return { ok: false, reason: "event is not an object" };
  if (typeof raw.shareId !== "string" || raw.shareId.length === 0) {
    return { ok: false, reason: "missing shareId" };
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return { ok: false, reason: "items is not a non-empty array" };
  }
  const items: ShareItem[] = [];
  for (let i = 0; i < raw.items.length; i += 1) {
    const item = parseItem(raw.items[i]);
    if (item === null) return { ok: false, reason: `item ${i} is invalid` };
    items.push(item);
  }
  return { ok: true, event: { shareId: raw.shareId, items } };
}

async function handleEvent(
  plugin: ShareInPluginContract,
  raw: unknown,
  options: ShareListenerOptions,
): Promise<void> {
  const parsed = parseShareReceivedEvent(raw);
  if (!parsed.ok) {
    options.onFailure(`A shared item could not be read: ${parsed.reason}.`);
    return;
  }
  try {
    await options.onShare(parsed.event);
  } catch {
    options.onFailure("A shared item could not be taken; it was not cleared.");
    return;
  }
  try {
    await plugin.acknowledge({ shareId: parsed.event.shareId });
  } catch {
    options.onFailure("A share was taken but could not be marked as consumed.");
  }
}

/**
 * Starts listening on a given plugin. Exposed so tests can pass a fake.
 *
 * @param plugin - The `ShareIn` plugin or a fake of its contract.
 * @param options - The share and failure callbacks.
 * @returns A session whose `stop` removes the listener.
 */
export async function startShareListenerWith(
  plugin: ShareInPluginContract,
  options: ShareListenerOptions,
): Promise<ShareListenerSession> {
  const handle = await plugin.addListener("shareReceived", (raw: unknown) => {
    void handleEvent(plugin, raw, options);
  });
  return { stop: () => handle.remove() };
}

const ShareIn = registerPlugin<ShareInPluginContract>("ShareIn");

/**
 * Starts listening on the registered `ShareIn` plugin.
 *
 * @param options - The share and failure callbacks.
 * @returns A session whose `stop` removes the listener.
 */
export function startNativeShareListener(
  options: ShareListenerOptions,
): Promise<ShareListenerSession> {
  return startShareListenerWith(ShareIn, options);
}
