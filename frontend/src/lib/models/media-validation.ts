/**
 * Validation for image/audio uploads: classifies a file as an image or audio
 * resource by extension/MIME, and enforces the per-file size cap.
 */
import type { ResourceType } from "./types";

/** Maximum accepted media file size in bytes (100 MB). */
export const MAX_MEDIA_FILE_BYTES = 100 * 1024 * 1024;

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

  if (file.size > MAX_MEDIA_FILE_BYTES) {
    return {
      ok: false,
      reason: "file-too-large",
      message: `File exceeds the ${
        MAX_MEDIA_FILE_BYTES / (1024 * 1024)
      } MB limit.`,
    };
  }

  return {
    ok: true,
    type: resolved.type,
    extension: extension || resolved.mime.split("/")[1],
    mime: resolved.mime,
  };
}
