/**
 * Entity Mention Noise Flagging, Task 8 — web/hosted cross-project global
 * noise-word list persistence (`global-noise-words.ts`).
 *
 * Covers: read-empty-default (no file yet), add (write then read reflects
 * it), remove (write a shorter list then read reflects the removal), and
 * validation of a malformed write.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, readFile, mkdir } from "../../src/lib/models/io";
import {
  GLOBAL_NOISE_WORDS_FILENAME,
  InvalidGlobalNoiseWordsError,
  GlobalNoiseWordsFormatError,
  readGlobalNoiseWords,
  writeGlobalNoiseWords,
} from "../../src/lib/models/global-noise-words";

const TENANT = "/ws-global-noise-words";

describe("global-noise-words (Entity Mention Noise Flagging, Task 8)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(TENANT, { recursive: true });
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("reads [] when no file has ever been written", async () => {
    await expect(readGlobalNoiseWords()).resolves.toEqual([]);
  });

  it("adding a word persists it and a subsequent read reflects it", async () => {
    await expect(writeGlobalNoiseWords(["case", "hope"])).resolves.toEqual([
      "case",
      "hope",
    ]);
    await expect(readGlobalNoiseWords()).resolves.toEqual(["case", "hope"]);

    await writeGlobalNoiseWords(["case", "hope", "tiny"]);
    await expect(readGlobalNoiseWords()).resolves.toEqual([
      "case",
      "hope",
      "tiny",
    ]);
  });

  it("removing a word persists the removal", async () => {
    await writeGlobalNoiseWords(["case", "hope", "tiny"]);
    await writeGlobalNoiseWords(["case", "tiny"]);
    await expect(readGlobalNoiseWords()).resolves.toEqual(["case", "tiny"]);
  });

  it("trims entries and rejects a non-array or non-string/empty entry", async () => {
    await expect(writeGlobalNoiseWords([" case ", "hope"])).resolves.toEqual([
      "case",
      "hope",
    ]);
    await expect(writeGlobalNoiseWords("case")).rejects.toBeInstanceOf(
      InvalidGlobalNoiseWordsError,
    );
    await expect(writeGlobalNoiseWords(["", "hope"])).rejects.toBeInstanceOf(
      InvalidGlobalNoiseWordsError,
    );
    await expect(writeGlobalNoiseWords(["  ", "hope"])).rejects.toBeInstanceOf(
      InvalidGlobalNoiseWordsError,
    );
  });

  it("writes the dot-prefixed filename directly at the tenant root", async () => {
    await writeGlobalNoiseWords(["case"]);
    const raw = await readFile(
      `${TENANT}/${GLOBAL_NOISE_WORDS_FILENAME}`,
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual(["case"]);
  });

  it("surfaces corrupt JSON as GlobalNoiseWordsFormatError rather than treating it as empty", async () => {
    await mkdir(TENANT, { recursive: true });
    const { writeFile } = await import("../../src/lib/models/io");
    await writeFile(
      `${TENANT}/${GLOBAL_NOISE_WORDS_FILENAME}`,
      "{not json",
      "utf8",
    );
    await expect(readGlobalNoiseWords()).rejects.toBeInstanceOf(
      GlobalNoiseWordsFormatError,
    );
  });
});
