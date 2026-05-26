import { describe, expect, it } from "vitest";
import {
  AUDIO_EXTENSION_MIME,
  IMAGE_EXTENSION_MIME,
  MAX_MEDIA_FILE_BYTES,
  validateMediaFile,
} from "../src/lib/models/media-validation";

describe("validateMediaFile", () => {
  it("accepts every supported image extension", () => {
    for (const ext of Object.keys(IMAGE_EXTENSION_MIME)) {
      const result = validateMediaFile({ ext, size: 1024 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.type).toBe("image");
        expect(result.extension).toBe(ext);
        expect(result.mime).toBe(IMAGE_EXTENSION_MIME[ext]);
      }
    }
  });

  it("accepts every supported audio extension", () => {
    for (const ext of Object.keys(AUDIO_EXTENSION_MIME)) {
      const result = validateMediaFile({ ext, size: 1024 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.type).toBe("audio");
        expect(result.extension).toBe(ext);
        expect(result.mime).toBe(AUDIO_EXTENSION_MIME[ext]);
      }
    }
  });

  it("normalizes a full filename with mixed case", () => {
    const result = validateMediaFile({ ext: "Vacation.JPG", size: 2048 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.type).toBe("image");
      expect(result.extension).toBe("jpg");
    }
  });

  it("falls back to the MIME type when the extension is missing", () => {
    const result = validateMediaFile({ mime: "audio/mpeg", size: 2048 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.type).toBe("audio");
    }
  });

  it("rejects an unsupported extension", () => {
    const result = validateMediaFile({ ext: "exe", size: 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-type");
    }
  });

  it("rejects a video file as unsupported", () => {
    const result = validateMediaFile({
      ext: "mp4",
      mime: "video/mp4",
      size: 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-type");
    }
  });

  it("rejects a supported type that exceeds the size cap", () => {
    const result = validateMediaFile({
      ext: "png",
      size: MAX_MEDIA_FILE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("file-too-large");
    }
  });

  it("reports unsupported-type before size when both fail", () => {
    const result = validateMediaFile({
      ext: "exe",
      size: MAX_MEDIA_FILE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-type");
    }
  });

  it("accepts a file exactly at the size cap", () => {
    const result = validateMediaFile({
      ext: "wav",
      size: MAX_MEDIA_FILE_BYTES,
    });
    expect(result.ok).toBe(true);
  });
});
