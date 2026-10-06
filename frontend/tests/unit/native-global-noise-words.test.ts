// Entity Mention Noise Flagging, Task 10 (FR-5c): proves the native global
// noise-word list store reads/writes a device-level, project-id-free path as
// plain JSON, defaults to [] on first run, round-trips, and never produces
// an encrypted envelope shape (crypto/envelope.ts) -- demonstrating it never
// passes through encryptingAdapter.ts/the keyring, since it never goes
// through io.ts/storage-context.ts at all.
//
// `capacitor-filesystem-real.ts` is mocked wholesale to return a single
// shared in-memory fake instance (`capacitor-filesystem.ts`'s
// `createFakeCapacitorFilesystem()`), mirroring
// `native-device-harness.test.ts`'s precedent, so writes/reads within one
// test observe each other against the same backing store a real on-device
// run would use.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return { fakeFs: undefined as unknown };
});

vi.mock("../../src/lib/models/capacitor-filesystem-real", async () => {
  const { createFakeCapacitorFilesystem } =
    await import("../../src/lib/models/capacitor-filesystem");
  const fs = createFakeCapacitorFilesystem();
  mocks.fakeFs = fs;
  return { createRealCapacitorFilesystem: () => fs };
});

async function resetAll(): Promise<void> {
  vi.resetModules();
  const { __resetNativeGlobalNoiseWordsForTests } =
    await import("../../src/lib/models/native-global-noise-words");
  __resetNativeGlobalNoiseWordsForTests();
}

describe("native-global-noise-words", () => {
  beforeEach(async () => {
    await resetAll();
  });

  afterEach(async () => {
    await resetAll();
  });

  it("defaults to [] when no file exists yet (first run)", async () => {
    const { getNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    expect(await getNativeGlobalNoiseWords()).toEqual([]);
  });

  it("round-trips a written list through a later read", async () => {
    const { getNativeGlobalNoiseWords, setNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    await setNativeGlobalNoiseWords(["case", "hope", "tiny"]);

    expect(await getNativeGlobalNoiseWords()).toEqual(["case", "hope", "tiny"]);
  });

  it("overwrites rather than merges on a second write", async () => {
    const { getNativeGlobalNoiseWords, setNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    await setNativeGlobalNoiseWords(["case"]);
    await setNativeGlobalNoiseWords(["hope"]);

    expect(await getNativeGlobalNoiseWords()).toEqual(["hope"]);
  });

  it("writes the file at a device-level path with no project id in it", async () => {
    const { setNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    await setNativeGlobalNoiseWords(["case"]);

    const fs = mocks.fakeFs as {
      readFile: (opts: { path: string }) => Promise<{ data: string }>;
    };
    // No tenantRoot ("/projects") or project id segment anywhere in the path
    // -- a sibling of native-bootstrap.ts's /projects root, not nested in it.
    const { data } = await fs.readFile({ path: "/global-noise-words.json" });
    expect(data).toBeTruthy();
  });

  it("persists a plain, directly parseable JSON array -- never an encrypted envelope shape", async () => {
    const { setNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    await setNativeGlobalNoiseWords(["case", "hope"]);

    const fs = mocks.fakeFs as {
      readFile: (opts: { path: string }) => Promise<{ data: string }>;
    };
    const { data: base64 } = await fs.readFile({
      path: "/global-noise-words.json",
    });
    // The fake's writeFile/readFile boundary carries base64 when no encoding
    // is requested; decode exactly as a real on-device consumer inspecting
    // raw bytes would, to confirm the bytes on disk are plain UTF-8 JSON --
    // not crypto/envelope.ts's self-identifying versioned container (which
    // is never plain-JSON-parseable without unsealing first).
    const raw = Buffer.from(base64, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(["case", "hope"]);
  });

  it("degrades to [] when the persisted content is not a JSON array of strings", async () => {
    const { getNativeGlobalNoiseWords } =
      await import("../../src/lib/models/native-global-noise-words");

    const fs = mocks.fakeFs as {
      writeFile: (opts: { path: string; data: string }) => Promise<unknown>;
    };
    await fs.writeFile({
      path: "/global-noise-words.json",
      data: Buffer.from("not json", "utf8").toString("base64"),
    });

    expect(await getNativeGlobalNoiseWords()).toEqual([]);
  });
});
