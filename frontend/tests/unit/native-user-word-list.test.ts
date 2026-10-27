// Feature 96, Task 6 (FR-1, FR-2, FR-13, FR-19): the Android user word list
// store and backend. `capacitor-filesystem-real.ts` is mocked to one shared
// in-memory fake, as in native-global-noise-words.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fakeFs: undefined as unknown }));

vi.mock("../../src/lib/models/capacitor-filesystem-real", async () => {
  const { createFakeCapacitorFilesystem } =
    await import("../../src/lib/models/capacitor-filesystem");
  const fs = createFakeCapacitorFilesystem();
  mocks.fakeFs = fs;
  return { createRealCapacitorFilesystem: () => fs };
});

type FakeFs = {
  deleteFile: (o: { path: string }) => Promise<void>;
  readFile: (o: { path: string }) => Promise<{ data: string }>;
  writeFile: (o: { path: string; data: string }) => Promise<unknown>;
};

const USER_PATH = "/user-word-list.json";

async function resetAll(): Promise<void> {
  vi.resetModules();
  const m = await import("../../src/lib/models/native-user-word-list");
  m.__resetNativeUserWordListForTests();
  // The mocked fake outlives vi.resetModules, so clear the files by hand.
  for (const path of [USER_PATH, "/global-noise-words.json"]) {
    await (mocks.fakeFs as FakeFs | undefined)
      ?.deleteFile({ path })
      .catch(() => undefined);
  }
}

async function rawFile(path: string): Promise<string> {
  const { data } = await (mocks.fakeFs as FakeFs).readFile({ path });
  return Buffer.from(data, "base64").toString("utf8");
}

describe("native-user-word-list", () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it("reads [] on first run when no file exists", async () => {
    const { getNativeUserWords } =
      await import("../../src/lib/models/native-user-word-list");
    expect(await getNativeUserWords()).toEqual([]);
  });

  it("round-trips add and remove, returning the persisted list", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    expect(await m.addNativeUserWord("Zorblax")).toEqual(["Zorblax"]);
    expect(await m.addNativeUserWord("quux")).toEqual(["Zorblax", "quux"]);
    expect(await m.getNativeUserWords()).toEqual(["Zorblax", "quux"]);
    expect(await m.removeNativeUserWord("zorblax")).toEqual(["quux"]);
    expect(await m.getNativeUserWords()).toEqual(["quux"]);
  });

  it("add and remove are idempotent", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    await m.addNativeUserWord("quux");
    expect(await m.addNativeUserWord("QUUX")).toEqual(["quux"]);
    expect(await m.removeNativeUserWord("absent")).toEqual(["quux"]);
    expect(JSON.parse(await rawFile(USER_PATH))).toEqual(["quux"]);
  });

  it("uses a file separate from /global-noise-words.json", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    expect(m.USER_WORD_LIST_PATH).toBe(USER_PATH);
    expect(m.USER_WORD_LIST_PATH).not.toBe("/global-noise-words.json");
    await m.addNativeUserWord("quux");
    await expect(rawFile("/global-noise-words.json")).rejects.toThrow();
  });

  it("uses the Task 1 core: an invalid word is refused and nothing is written", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    const { UserWordListError } =
      await import("../../src/lib/models/user-word-list-core");
    await expect(m.addNativeUserWord("two words")).rejects.toBeInstanceOf(
      UserWordListError,
    );
    await expect(rawFile(USER_PATH)).rejects.toThrow();
  });

  it("does not lose a word when two adds run concurrently", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    await Promise.all([
      m.addNativeUserWord("alpha"),
      m.addNativeUserWord("beta"),
    ]);
    expect((await m.getNativeUserWords()).sort()).toEqual(["alpha", "beta"]);
  });

  it("throws, not an empty list, on a corrupt file", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    await (mocks.fakeFs as FakeFs).writeFile({
      path: USER_PATH,
      data: Buffer.from("not json", "utf8").toString("base64"),
    });
    await expect(m.getNativeUserWords()).rejects.toThrow();
    await expect(m.addNativeUserWord("quux")).rejects.toThrow();
  });

  it("throws on valid JSON that is not an array of strings", async () => {
    const m = await import("../../src/lib/models/native-user-word-list");
    await (mocks.fakeFs as FakeFs).writeFile({
      path: USER_PATH,
      data: Buffer.from('{"a":1}', "utf8").toString("base64"),
    });
    await expect(m.getNativeUserWords()).rejects.toThrow();
    await (mocks.fakeFs as FakeFs).writeFile({
      path: USER_PATH,
      data: Buffer.from('["a",2]', "utf8").toString("base64"),
    });
    await expect(m.getNativeUserWords()).rejects.toThrow();
  });
});

describe("native-user-word-list-backend", () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it("delegates get, add and remove to the store", async () => {
    const { createNativeUserWordListTransport } =
      await import("../../src/store/transport/native-user-word-list-backend");
    const t = createNativeUserWordListTransport();
    expect(await t.getUserWords()).toEqual([]);
    expect(await t.addUserWord("quux")).toEqual(["quux"]);
    expect(await t.removeUserWord("quux")).toEqual([]);
  });

  it("the web stub throws a clear native-only error", async () => {
    const { createNativeUserWordListTransport } =
      await import("../../src/store/transport/native-user-word-list-backend.web-stub");
    expect(() => createNativeUserWordListTransport()).toThrow(/native/i);
  });
});
