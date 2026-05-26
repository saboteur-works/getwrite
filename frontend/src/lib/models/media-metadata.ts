/**
 * Extracts type-specific metadata from uploaded media at ingest time:
 * width/height/EXIF for images, duration/format for audio.
 *
 * All extractors are pure-JS (image-size, exifr, music-metadata) and run in the
 * Node server runtime. Each is defensive: malformed or unreadable input yields
 * an empty result rather than throwing, so an upload never fails on metadata.
 */
import { imageSize } from "image-size";
import exifr from "exifr";
import { parseBuffer } from "music-metadata";

import type { MetadataValue } from "./types";

/** Image metadata derived from the file bytes. */
export interface ExtractedImageMetadata {
  width?: number;
  height?: number;
  exif?: Record<string, MetadataValue>;
}

/** Audio metadata derived from the file bytes. */
export interface ExtractedAudioMetadata {
  durationSeconds?: number;
  format?: string;
}

/**
 * Coerces an arbitrary EXIF value into a sidecar-safe `MetadataValue`, or
 * `undefined` when it cannot be represented (Buffers, nested objects, NaN).
 */
function toMetadataValue(value: unknown): MetadataValue | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : value.toISOString();
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "number" && Number.isFinite(v))) {
      return value as number[];
    }
    if (value.every((v) => typeof v === "string")) {
      return value as string[];
    }
    if (value.every((v) => typeof v === "boolean")) {
      return value as boolean[];
    }
    return undefined;
  }
  return undefined;
}

/** Reduces a raw EXIF object to sidecar-safe scalar/array fields. */
function sanitizeExif(
  raw: Record<string, unknown>,
): Record<string, MetadataValue> | undefined {
  const out: Record<string, MetadataValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const coerced = toMetadataValue(value);
    if (coerced !== undefined) out[key] = coerced;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Extracts width, height, and (when present) EXIF from an image buffer.
 * Returns an empty object if the bytes cannot be parsed (e.g. corrupt input).
 */
export async function extractImageMetadata(
  bytes: Uint8Array,
): Promise<ExtractedImageMetadata> {
  const result: ExtractedImageMetadata = {};

  try {
    const dimensions = imageSize(bytes);
    if (typeof dimensions.width === "number") result.width = dimensions.width;
    if (typeof dimensions.height === "number") {
      result.height = dimensions.height;
    }
  } catch {
    // Unsupported or corrupt image — leave dimensions unset.
  }

  try {
    const raw = (await exifr.parse(bytes)) as
      | Record<string, unknown>
      | undefined
      | null;
    if (raw) {
      const exif = sanitizeExif(raw);
      if (exif) result.exif = exif;
    }
  } catch {
    // No EXIF segment (e.g. PNG/SVG) or parse failure — leave EXIF unset.
  }

  return result;
}

/**
 * Extracts duration and format from an audio buffer. `format` is taken from the
 * validated extension; duration is read from the decoded container. Returns
 * format only if duration cannot be parsed.
 */
export async function extractAudioMetadata(
  bytes: Uint8Array,
  extension: string,
): Promise<ExtractedAudioMetadata> {
  const result: ExtractedAudioMetadata = { format: extension };

  try {
    const metadata = await parseBuffer(bytes, { size: bytes.byteLength });
    const duration = metadata.format.duration;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      result.durationSeconds = duration;
    }
  } catch {
    // Unreadable audio container — keep the extension-derived format only.
  }

  return result;
}
