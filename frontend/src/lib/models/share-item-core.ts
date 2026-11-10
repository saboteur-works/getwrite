/**
 * @module share-item-core
 *
 * Pure helpers for the Android share target (Feature 107, FR-6, FR-7,
 * FR-17): classify shared text, decide the size outcome for an image,
 * sanitise a shared file name and filter by MIME type. No I/O, no React and
 * no `node:*`, so the native build can bundle it.
 */
import type {
  ShareItem,
  ShareSizeDecision,
  ShareTextClassification,
  ShareTextItem,
} from "../api/share-capture-types";
import {
  ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES,
  mediaTooLargeToShowMessage,
} from "./media-validation";

/** The largest shared image accepted, in bytes (30 MiB), inclusive. */
export const SHARE_IMAGE_MAX_BYTES: number =
  ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES;

/** The MIME types a share is offered for (the manifest filters of FR-2). */
export const ACCEPTED_SHARE_MIME_TYPES: readonly string[] = [
  "image/*",
  "text/plain",
];

/** Name used when a shared file has no usable name. */
export const SHARE_DEFAULT_FILE_NAME = "shared-image";

/** Longest sanitised file name, in characters. */
export const SHARE_FILE_NAME_MAX_LENGTH = 100;

const SINGLE_HTTP_URL = /^https?:\/\/\S+$/i;

/**
 * Classifies a shared text item. Link-only means the trimmed text is exactly
 * one `http` or `https` URL (OQ-10 option a); the URL is then both body and
 * `capturedLink`. Anything else is plain text with no link. Any subject the
 * sender supplied is ignored.
 *
 * @param item - The shared text item.
 * @returns The classification; `body` is the text as given when not link-only.
 */
export function classifyShareText(
  item: ShareTextItem,
): ShareTextClassification {
  const trimmed = item.text.trim();
  if (SINGLE_HTTP_URL.test(trimmed) && isParsableHttpUrl(trimmed)) {
    return { linkOnly: true, body: trimmed, capturedLink: trimmed };
  }
  return { linkOnly: false, body: item.text };
}

function isParsableHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * The refusal text for an image over the cap. With a size it is the FR-148
 * text naming the size; with no size known it is the write-refusal text of
 * `validateMediaFile` for the Android cap.
 *
 * @param size - The size in bytes, when known.
 */
export function shareImageRefusalMessage(size?: number): string {
  if (size !== undefined) return mediaTooLargeToShowMessage(size);
  return `File exceeds the ${SHARE_IMAGE_MAX_BYTES / (1024 * 1024)} MB limit.`;
}

/**
 * Decides what to do with a shared image from its reported size. An unknown
 * or unusable size (absent, not finite, negative) needs a counted read; it is
 * never accepted unchecked.
 *
 * @param size - The size the plugin reported, if any.
 */
export function decideShareImageSize(size?: number): ShareSizeDecision {
  if (size === undefined || !Number.isFinite(size) || size < 0) {
    return { outcome: "needs-counted-read" };
  }
  if (size > SHARE_IMAGE_MAX_BYTES) {
    return { outcome: "refuse", size, message: shareImageRefusalMessage(size) };
  }
  return { outcome: "accept" };
}

/**
 * Reduces a shared file name to a bare, bounded name: keeps the last path
 * segment, drops NUL and other control characters and leading dots, trims,
 * and cuts to {@link SHARE_FILE_NAME_MAX_LENGTH} keeping a short extension.
 * An empty, null or fully stripped name becomes {@link SHARE_DEFAULT_FILE_NAME}.
 *
 * @param name - The name the provider gave, if any.
 */
export function sanitizeShareFileName(name: string | null | undefined): string {
  if (!name) return SHARE_DEFAULT_FILE_NAME;
  const withoutControls = name.replace(/[\u0000-\u001f\u007f]/g, "");
  const segments = withoutControls.split(/[/\\]/);
  const lastSegment = segments[segments.length - 1] ?? "";
  const cleaned = lastSegment.trim().replace(/^\.+/, "").trim();
  if (cleaned.length === 0) return SHARE_DEFAULT_FILE_NAME;
  return boundLength(cleaned);
}

function boundLength(name: string): string {
  if (name.length <= SHARE_FILE_NAME_MAX_LENGTH) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  if (extension.length === 0 || extension.length > 10) {
    return name.slice(0, SHARE_FILE_NAME_MAX_LENGTH);
  }
  return (
    name.slice(0, SHARE_FILE_NAME_MAX_LENGTH - extension.length) + extension
  );
}

/**
 * True for `image/*` and `text/plain` (parameters and case ignored); false
 * for anything else, including a wildcard type, a bare `image` and a missing type.
 *
 * @param mimeType - The reported MIME type.
 */
export function isAcceptedShareMimeType(
  mimeType: string | null | undefined,
): boolean {
  if (!mimeType) return false;
  const base = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
  if (base === "text/plain") return true;
  return /^image\/[^/*\s]+$/.test(base);
}

/**
 * Keeps text items and image items whose MIME type is accepted; drops the
 * rest. Order is preserved.
 *
 * @param items - The delivered items.
 */
export function filterAcceptedShareItems(
  items: readonly ShareItem[],
): ShareItem[] {
  return items.filter(
    (item) => item.kind === "text" || isAcceptedShareMimeType(item.mimeType),
  );
}
