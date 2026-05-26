import { describe, expect, it } from "vitest";
import {
  extractAudioMetadata,
  extractImageMetadata,
} from "../src/lib/models/media-metadata";

// 1x1 transparent PNG.
const ONE_PX_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
);

/** Builds a canonical PCM WAV (8kHz, mono, 8-bit) with the given sample count. */
function buildWav(numSamples: number): Uint8Array {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return Uint8Array.from(buffer);
}

describe("extractImageMetadata", () => {
  it("returns width and height for a valid PNG", async () => {
    const result = await extractImageMetadata(ONE_PX_PNG);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it("surfaces PNG chunk metadata as sidecar-safe EXIF fields", async () => {
    const result = await extractImageMetadata(ONE_PX_PNG);
    expect(result.exif).toBeDefined();
    // exifr reads the PNG IHDR chunk; values must be scalar/array, not Buffers.
    expect(result.exif).toMatchObject({ ImageWidth: 1, ImageHeight: 1 });
    for (const value of Object.values(result.exif ?? {})) {
      expect(["string", "number", "boolean"]).toContain(typeof value);
    }
  });

  it("returns an empty result for corrupt bytes without throwing", async () => {
    const result = await extractImageMetadata(
      Uint8Array.from([0, 1, 2, 3, 4, 5]),
    );
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});

describe("extractAudioMetadata", () => {
  it("returns duration and format for a valid WAV", async () => {
    const wav = buildWav(8000); // 8000 samples / 8000 Hz = 1 second
    const result = await extractAudioMetadata(wav, "wav");
    expect(result.format).toBe("wav");
    expect(result.durationSeconds).toBeCloseTo(1, 1);
  });

  it("keeps the extension-derived format when the buffer is unreadable", async () => {
    const result = await extractAudioMetadata(
      Uint8Array.from([0, 1, 2, 3]),
      "mp3",
    );
    expect(result.format).toBe("mp3");
    expect(result.durationSeconds).toBeUndefined();
  });
});
