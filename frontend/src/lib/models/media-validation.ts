/**
 * Validation for image/audio uploads: classifies a file as an image or audio
 * resource by extension/MIME, and enforces the per-file size cap.
 */
import { resolveRuntime } from "../../store/transport/runtime";
import type { ResourceType } from "./types";

/** Maximum accepted media file size in bytes (100 MB). */
export const MAX_MEDIA_FILE_BYTES = 100 * 1024 * 1024;

/** The Android per-file cap: 104,857,600 bytes, the size the chunked write passed on the device. */
export const ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES = 104_857_600;

/** The per-file cap for the running runtime: the Android cap on native, else `MAX_MEDIA_FILE_BYTES`. */
export function maxMediaFileBytes(): number {
  return resolveRuntime() === "native"
    ? ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES
    : MAX_MEDIA_FILE_BYTES;
}

/** Accepted image extensions mapped to their canonical MIME type. */
export const IMAGE_EXTENSION_MIME: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
};

/** Accepted audio extensions mapped to their canonical MIME type. */
export const AUDIO_EXTENSION_MIME: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
};

/** Media resource types this module can validate. */
export type MediaResourceType = Extract<ResourceType, "image" | "audio">;

/** Input describing the file under validation. */
export interface MediaFileDescriptor {
  /** Reported MIME type, if available (e.g. from the upload). */
  mime?: string;
  /** Filename or extension; a leading dot and case are ignored. */
  ext?: string;
  /** File size in bytes. */
  size: number;
}

/** Successful classification of an accepted media file. */
export interface MediaValidationOk {
  ok: true;
  /** Resolved resource type for the file. */
  type: MediaResourceType;
  /** Normalized, lowercase extension without a leading dot. */
  extension: string;
  /** Canonical MIME type for the resolved extension. */
  mime: string;
}

/** Rejection reason categories for an unaccepted file. */
export type MediaRejectionReason = "unsupported-type" | "file-too-large";

/** Rejection result with a machine code and a human-readable message. */
export interface MediaValidationError {
  ok: false;
  reason: MediaRejectionReason;
  message: string;
}

export type MediaValidationResult = MediaValidationOk | MediaValidationError;

/**
 * Normalizes a filename or extension to a bare lowercase extension.
 * Accepts `"photo.PNG"`, `".png"`, or `"png"` and returns `"png"`.
 */
function normalizeExtension(ext: string | undefined): string {
  if (!ext) return "";
  const lastDot = ext.lastIndexOf(".");
  const raw = lastDot >= 0 ? ext.slice(lastDot + 1) : ext;
  return raw.trim().toLowerCase();
}

/** Resolves a media type from an extension, falling back to the MIME type. */
function resolveType(
  extension: string,
  mime: string | undefined,
): { type: MediaResourceType; mime: string } | null {
  if (extension in IMAGE_EXTENSION_MIME) {
    return { type: "image", mime: IMAGE_EXTENSION_MIME[extension] };
  }
  if (extension in AUDIO_EXTENSION_MIME) {
    return { type: "audio", mime: AUDIO_EXTENSION_MIME[extension] };
  }

  const normalizedMime = mime?.trim().toLowerCase();
  if (normalizedMime) {
    const imageMatch = Object.entries(IMAGE_EXTENSION_MIME).find(
      ([, value]) => value === normalizedMime,
    );
    if (imageMatch) return { type: "image", mime: imageMatch[1] };
    const audioMatch = Object.entries(AUDIO_EXTENSION_MIME).find(
      ([, value]) => value === normalizedMime,
    );
    if (audioMatch) return { type: "audio", mime: audioMatch[1] };
  }

  return null;
}

/**
 * The extension for the stored file name (`original.<ext>`): the name's own
 * extension when it is on an allowlist, otherwise the allowlisted extension
 * for the resolved MIME type. A name's text after its last dot can hold a
 * `/` (`x./y`), so it is never used unless allowlisted.
 */
function storedExtension(extension: string, mime: string): string {
  if (extension in IMAGE_EXTENSION_MIME || extension in AUDIO_EXTENSION_MIME) {
    return extension;
  }
  const match = [
    ...Object.entries(IMAGE_EXTENSION_MIME),
    ...Object.entries(AUDIO_EXTENSION_MIME),
  ].find(([, value]) => value === mime);
  // `resolveType` only returns a MIME type from these maps, so a match
  // exists; the fallback never reuses the unchecked text.
  return match ? match[0] : "bin";
}

/**
 * Classifies a media file as an image or audio resource, or rejects it.
 *
 * Type resolution runs before the size check so an unsupported file reports
 * `unsupported-type` even when it also exceeds the size cap.
 */
export function validateMediaFile(
  file: MediaFileDescriptor,
): MediaValidationResult {
  const extension = normalizeExtension(file.ext);
  const resolved = resolveType(extension, file.mime);

  if (!resolved) {
    return {
      ok: false,
      reason: "unsupported-type",
      message: `Unsupported file type${
        extension ? ` ".${extension}"` : ""
      }. Supported images: ${Object.keys(IMAGE_EXTENSION_MIME).join(
        ", ",
      )}. Supported audio: ${Object.keys(AUDIO_EXTENSION_MIME).join(", ")}.`,
    };
  }

  const cap = maxMediaFileBytes();
  if (file.size > cap) {
    return {
      ok: false,
      reason: "file-too-large",
      message: `File exceeds the ${cap / (1024 * 1024)} MB limit.`,
    };
  }

  return {
    ok: true,
    type: resolved.type,
    extension: storedExtension(extension, resolved.mime),
    mime: resolved.mime,
  };
}

/**
 * True when `name` is a bare file name: one path segment, not `.` or `..`,
 * with no `/`, `\` or NUL. A media resource's stored `file` is joined under
 * `resources/<id>/`, so anything else could name a file outside it.
 */
export function isPlainFileName(name: string): boolean {
  return (
    name.length > 0 && name !== "." && name !== ".." && !/[/\\\0]/.test(name)
  );
}

/** Video extensions refused as attachments, with the reason named. */
const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "3gp",
  "ogv",
]);

/** Attachment rejection reasons: the media reasons plus the two below. */
export type AttachmentRejectionReason =
  | MediaRejectionReason
  | "video-not-supported"
  | "content-mismatch";

/** Messages for attachment-only refusals, exported so every transport and test shares one text. */
export const ATTACHMENT_MESSAGES = {
  videoNotSupported:
    "Video is not supported as an attachment. Attach an image or an audio file.",
  contentMismatch:
    "The file's contents do not match its file type, so it was not attached.",
} as const;

/** A file under attachment validation: the media descriptor plus its leading bytes. */
export interface AttachmentFileDescriptor extends MediaFileDescriptor {
  /** The file's bytes, or at least its first 512. Only the head is read. */
  bytes: Uint8Array;
}

interface AttachmentValidationError {
  ok: false;
  reason: AttachmentRejectionReason;
  message: string;
}

export type AttachmentValidationResult =
  | MediaValidationOk
  | AttachmentValidationError;

const HEAD_BYTES = 512;

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, i) => bytes[offset + i] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  return startsWith(
    bytes,
    [...text].map((c) => c.charCodeAt(0)),
    offset,
  );
}

/** ISO base media `ftyp` box with a major brand starting with one of `brands`. */
function hasFtyp(bytes: Uint8Array, brands?: readonly string[]): boolean {
  if (!asciiAt(bytes, 4, "ftyp")) return false;
  if (!brands) return true;
  return brands.some((brand) => asciiAt(bytes, 8, brand));
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, HEAD_BYTES));
  return /<svg[\s>/]/i.test(head);
}

function isMp3OrId3(bytes: Uint8Array): boolean {
  if (asciiAt(bytes, 0, "ID3")) return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/** Hand-written signature checks, keyed by allowlisted stored extension. */
const SIGNATURE_CHECKS: Readonly<Record<string, (b: Uint8Array) => boolean>> = {
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  gif: (b) => asciiAt(b, 0, "GIF87a") || asciiAt(b, 0, "GIF89a"),
  webp: (b) => asciiAt(b, 0, "RIFF") && asciiAt(b, 8, "WEBP"),
  svg: looksLikeSvg,
  avif: (b) => hasFtyp(b, ["avif", "avis"]),
  heic: (b) =>
    hasFtyp(b, [
      "heic",
      "heix",
      "heim",
      "heis",
      "hevc",
      "hevx",
      "mif1",
      "msf1",
    ]),
  mp3: isMp3OrId3,
  wav: (b) => asciiAt(b, 0, "RIFF") && asciiAt(b, 8, "WAVE"),
  m4a: (b) => hasFtyp(b),
  ogg: (b) => asciiAt(b, 0, "OggS"),
  flac: (b) => asciiAt(b, 0, "fLaC"),
  aac: (b) => asciiAt(b, 0, "ADIF") || hasFtyp(b) || isMp3OrId3(b),
};

function isVideoClaim(extension: string, mime: string | undefined): boolean {
  if (VIDEO_EXTENSIONS.has(extension)) return true;
  return (mime?.trim().toLowerCase() ?? "").startsWith("video/");
}

/**
 * Validates a file offered as a Source attachment. Reuses `validateMediaFile`
 * (same extension and MIME maps, size cap and allowlisted stored extension),
 * refuses video by name, and checks the file's leading bytes against the
 * signature for its resolved extension. Applied to attachments only;
 * `validateMediaFile` itself reads no content. Pure: no I/O.
 */
export function validateAttachmentFile(
  file: AttachmentFileDescriptor,
): AttachmentValidationResult {
  const extension = normalizeExtension(file.ext);
  if (isVideoClaim(extension, file.mime)) {
    return {
      ok: false,
      reason: "video-not-supported",
      message: ATTACHMENT_MESSAGES.videoNotSupported,
    };
  }

  const media = validateMediaFile(file);
  if (!media.ok) return media;

  const check = SIGNATURE_CHECKS[media.extension];
  if (!check || !check(file.bytes.subarray(0, HEAD_BYTES))) {
    return {
      ok: false,
      reason: "content-mismatch",
      message: ATTACHMENT_MESSAGES.contentMismatch,
    };
  }
  return media;
}
