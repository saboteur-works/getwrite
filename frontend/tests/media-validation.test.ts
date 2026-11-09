import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_EXTENSION_MIME,
  IMAGE_EXTENSION_MIME,
  ATTACHMENT_MESSAGES,
  ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES,
  MAX_MEDIA_FILE_BYTES,
  maxMediaFileBytes,
  validateAttachmentFile,
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

  it("uses the allowlisted extension for the MIME type when the name's extension is not allowlisted", () => {
    // The extension becomes part of the stored file name (`original.<ext>`);
    // everything after the last dot of `x./y` is `/y`.
    for (const ext of ["x./y", "photo.png/../z", "pic.weird"]) {
      const result = validateMediaFile({ ext, mime: "image/png", size: 1024 });
      expect(result.ok, ext).toBe(true);
      if (result.ok) expect(result.extension, ext).toBe("png");
    }
  });

  it("uses the allowlisted extension for the MIME type when the name has none", () => {
    const result = validateMediaFile({ mime: "audio/mpeg", size: 2048 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extension).toBe("mp3");
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

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const MP3_BYTES = Uint8Array.from([...ascii("ID3"), 4, 0, 0, 0, 0, 0, 0, 0]);
const MP4_BYTES = Uint8Array.from([
  0,
  0,
  0,
  0x18,
  ...ascii("ftypisom"),
  0,
  0,
  2,
  0,
]);

describe("validateAttachmentFile", () => {
  it("accepts an image whose bytes match", () => {
    const result = validateAttachmentFile({
      ext: "photo.png",
      size: PNG_BYTES.length,
      bytes: PNG_BYTES,
    });
    expect(result).toEqual({
      ok: true,
      type: "image",
      extension: "png",
      mime: "image/png",
    });
  });

  it("accepts an audio file whose bytes match", () => {
    const result = validateAttachmentFile({
      ext: "song.mp3",
      size: MP3_BYTES.length,
      bytes: MP3_BYTES,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.type).toBe("audio");
  });

  it("accepts an svg and a webp by their content", () => {
    const svg = Uint8Array.from(
      ascii('<?xml version="1.0"?>\n<svg xmlns="x"/>'),
    );
    expect(
      validateAttachmentFile({ ext: "svg", size: svg.length, bytes: svg }).ok,
    ).toBe(true);
    const webp = Uint8Array.from([
      ...ascii("RIFF"),
      0,
      0,
      0,
      0,
      ...ascii("WEBP"),
    ]);
    expect(
      validateAttachmentFile({ ext: "webp", size: webp.length, bytes: webp })
        .ok,
    ).toBe(true);
  });

  it("refuses a video file naming the reason", () => {
    for (const ext of ["mp4", "mov", "webm"]) {
      const result = validateAttachmentFile({
        ext,
        size: MP4_BYTES.length,
        bytes: MP4_BYTES,
      });
      expect(result).toEqual({
        ok: false,
        reason: "video-not-supported",
        message: ATTACHMENT_MESSAGES.videoNotSupported,
      });
    }
    const byMime = validateAttachmentFile({
      mime: "video/mp4",
      ext: "",
      size: 10,
      bytes: MP4_BYTES,
    });
    expect(byMime.ok).toBe(false);
    if (!byMime.ok) expect(byMime.reason).toBe("video-not-supported");
  });

  it("refuses an unknown type with the media validation message", () => {
    const result = validateAttachmentFile({
      ext: "exe",
      size: 4,
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-type");
      expect(result.message).toBe(
        (validateMediaFile({ ext: "exe", size: 4 }) as { message: string })
          .message,
      );
    }
  });

  it("refuses a file whose name claims a kind its bytes do not", () => {
    const cases: Array<[string, Uint8Array]> = [
      ["fake.png", MP3_BYTES],
      ["fake.mp3", PNG_BYTES],
      ["fake.jpg", MP4_BYTES],
      ["fake.svg", PNG_BYTES],
      ["fake.wav", Uint8Array.from([])],
    ];
    for (const [ext, bytes] of cases) {
      const result = validateAttachmentFile({ ext, size: bytes.length, bytes });
      expect(result).toEqual({
        ok: false,
        reason: "content-mismatch",
        message: ATTACHMENT_MESSAGES.contentMismatch,
      });
    }
  });

  it("refuses a file over the size cap before reading content", () => {
    const result = validateAttachmentFile({
      ext: "png",
      size: MAX_MEDIA_FILE_BYTES + 1,
      bytes: PNG_BYTES,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("file-too-large");
  });

  it("leaves validateMediaFile unchanged: no content check", () => {
    const result = validateMediaFile({ ext: "png", size: 10 });
    expect(result.ok).toBe(true);
    expect(validateMediaFile({ ext: "mp4", size: 10 }).ok).toBe(false);
  });
});

describe("maxMediaFileBytes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the exported constant at 104,857,600", () => {
    expect(MAX_MEDIA_FILE_BYTES).toBe(104_857_600);
    expect(ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES).toBe(104_857_600);
  });

  it("returns 104,857,600 outside the native runtime", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    expect(maxMediaFileBytes()).toBe(104_857_600);
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
    expect(maxMediaFileBytes()).toBe(104_857_600);
  });

  it("non-native validators accept 104,857,600 and refuse 104,857,601 with today's result", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    expect(validateMediaFile({ ext: "wav", size: 104_857_600 }).ok).toBe(true);
    expect(validateMediaFile({ ext: "wav", size: 104_857_601 })).toEqual({
      ok: false,
      reason: "file-too-large",
      message: "File exceeds the 100 MB limit.",
    });
    expect(
      validateAttachmentFile({
        ext: "png",
        size: 104_857_601,
        bytes: PNG_BYTES,
      }),
    ).toEqual({
      ok: false,
      reason: "file-too-large",
      message: "File exceeds the 100 MB limit.",
    });
  });

  it("returns the Android cap on the native runtime and validators use it", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const cap = ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES;
    expect(maxMediaFileBytes()).toBe(cap);
    expect(validateMediaFile({ ext: "wav", size: cap }).ok).toBe(true);
    expect(validateMediaFile({ ext: "wav", size: cap + 1 })).toEqual({
      ok: false,
      reason: "file-too-large",
      message: `File exceeds the ${cap / (1024 * 1024)} MB limit.`,
    });
    expect(
      validateAttachmentFile({ ext: "png", size: cap, bytes: PNG_BYTES }).ok,
    ).toBe(true);
    const refused = validateAttachmentFile({
      ext: "png",
      size: cap + 1,
      bytes: PNG_BYTES,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("file-too-large");
  });

  it("non-native: success result at 104,857,600 is the full pre-change shape, for both validators", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    const expected = {
      ok: true,
      type: "audio",
      extension: "wav",
      mime: "audio/wav",
    };
    expect(validateMediaFile({ ext: "wav", size: 104_857_600 })).toEqual(
      expected,
    );
    expect(
      validateAttachmentFile({
        ext: "png",
        size: 104_857_600,
        bytes: PNG_BYTES,
      }),
    ).toEqual({ ok: true, type: "image", extension: "png", mime: "image/png" });
    // Just under the cap is also accepted: no smaller cap applies off Android.
    expect(validateMediaFile({ ext: "wav", size: 104_857_600 - 1 }).ok).toBe(
      true,
    );
  });
});
