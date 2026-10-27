/**
 * Feature 96, Task 2: server store for the user word list
 * (`user-word-list.ts`). Memory adapter only; no real folders.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  getStorageAdapter,
  mkdir,
  readFile,
  setStorageAdapter,
  writeFile,
} from "../../src/lib/models/io";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { GLOBAL_NOISE_WORDS_FILENAME } from "../../src/lib/models/global-noise-words";
import { UserWordListError } from "../../src/lib/models/user-word-list-core";
import {
  USER_WORD_LIST_FILENAME,
  UserWordListFormatError,
  addUserWord,
  readUserWords,
  removeUserWord,
} from "../../src/lib/models/user-word-list";

const TENANT_A = "/ws-user-words-a";
const TENANT_B = "/ws-user-words-b";

function inTenant<T>(tenantRoot: string, fn: () => Promise<T>): Promise<T> {
  return runInStorageContext({ tenantRoot, adapter: getStorageAdapter() }, fn);
}

describe("user-word-list store (Feature 96, Task 2)", () => {
  beforeEach(async () => {
    setStorageAdapter(createMemoryAdapter());
    await mkdir(TENANT_A, { recursive: true });
    await mkdir(TENANT_B, { recursive: true });
  });

  it("reads [] when the file is missing", async () => {
    await expect(inTenant(TENANT_A, () => readUserWords())).resolves.toEqual(
      [],
    );
  });

  it("throws a distinct error for corrupt JSON and for a non-string array", async () => {
    const file = `${TENANT_A}/${USER_WORD_LIST_FILENAME}`;
    await writeFile(file, "{not json", "utf8");
    await expect(
      inTenant(TENANT_A, () => readUserWords()),
    ).rejects.toBeInstanceOf(UserWordListFormatError);
    await writeFile(file, JSON.stringify([1, 2]), "utf8");
    await expect(
      inTenant(TENANT_A, () => readUserWords()),
    ).rejects.toBeInstanceOf(UserWordListFormatError);
    await writeFile(file, JSON.stringify({ a: 1 }), "utf8");
    await expect(
      inTenant(TENANT_A, () => addUserWord("x")),
    ).rejects.toBeInstanceOf(UserWordListFormatError);
    expect(await readFile(file, "utf8")).toBe(JSON.stringify({ a: 1 }));
  });

  it("add and remove return the persisted list", async () => {
    await expect(
      inTenant(TENANT_A, () => addUserWord("Zorblax")),
    ).resolves.toEqual(["Zorblax"]);
    await expect(
      inTenant(TENANT_A, () => addUserWord("quux")),
    ).resolves.toEqual(["Zorblax", "quux"]);
    await expect(inTenant(TENANT_A, () => readUserWords())).resolves.toEqual([
      "Zorblax",
      "quux",
    ]);
    await expect(
      inTenant(TENANT_A, () => removeUserWord("zorblax")),
    ).resolves.toEqual(["quux"]);
    await expect(inTenant(TENANT_A, () => readUserWords())).resolves.toEqual([
      "quux",
    ]);
  });

  it("two concurrent adds of different words both survive", async () => {
    await Promise.all([
      inTenant(TENANT_A, () => addUserWord("alpha")),
      inTenant(TENANT_A, () => addUserWord("beta")),
      inTenant(TENANT_A, () => addUserWord("gamma")),
    ]);
    const list = await inTenant(TENANT_A, () => readUserWords());
    expect([...list].sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("two tenant roots do not see each other's file", async () => {
    await inTenant(TENANT_A, () => addUserWord("onlya"));
    await expect(inTenant(TENANT_B, () => readUserWords())).resolves.toEqual(
      [],
    );
    await inTenant(TENANT_B, () => addUserWord("onlyb"));
    await expect(inTenant(TENANT_A, () => readUserWords())).resolves.toEqual([
      "onlya",
    ]);
  });

  it("uses a dot-prefixed file name distinct from the global noise-word file", () => {
    expect(USER_WORD_LIST_FILENAME).not.toBe(GLOBAL_NOISE_WORDS_FILENAME);
    expect(USER_WORD_LIST_FILENAME.startsWith(".")).toBe(true);
  });

  it("an invalid or over-bound word leaves the file byte-identical", async () => {
    await inTenant(TENANT_A, () => addUserWord("kept"));
    const file = `${TENANT_A}/${USER_WORD_LIST_FILENAME}`;
    const before = await readFile(file, "utf8");
    for (const bad of [
      "two words",
      "",
      "a".repeat(101),
      5 as unknown as string,
    ]) {
      await expect(
        inTenant(TENANT_A, () => addUserWord(bad)),
      ).rejects.toBeInstanceOf(UserWordListError);
      await expect(
        inTenant(TENANT_A, () => removeUserWord(bad)),
      ).rejects.toBeInstanceOf(UserWordListError);
    }
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("a repeat add or an absent remove does not rewrite the file", async () => {
    await inTenant(TENANT_A, () => addUserWord("kept"));
    const file = `${TENANT_A}/${USER_WORD_LIST_FILENAME}`;
    const before = await readFile(file, "utf8");
    await expect(
      inTenant(TENANT_A, () => addUserWord("KEPT")),
    ).resolves.toEqual(["kept"]);
    await expect(
      inTenant(TENANT_A, () => removeUserWord("absent")),
    ).resolves.toEqual(["kept"]);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("takes no path or root parameter from the caller", () => {
    expect(readUserWords.length).toBe(0);
    expect(addUserWord.length).toBe(1);
    expect(removeUserWord.length).toBe(1);
  });
});
