/**
 * User word list IPC handlers (Feature 96, Task 7; FR-1, FR-2, FR-13, FR-19,
 * FR-22). Plain module, no `electron` import; the directory is a temp dir.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  USER_WORD_LIST_FILENAME,
  createUserWordListHandlers,
} from "../src/user-word-list-ipc";
import {
  addWord,
  removeWord,
  UserWordListError,
} from "../../frontend/src/lib/models/user-word-list-core";

const LOCAL = "http://localhost:7340";
const trusted = { senderFrame: { url: `${LOCAL}/` } };
const untrusted = { senderFrame: { url: "https://evil.example/" } };

let dir: string;
let log: ReturnType<typeof vi.fn<(message: string) => void>>;

const isTrustedSender = (url: string | null | undefined): boolean =>
  typeof url === "string" && url.startsWith(`${LOCAL}/`);

function make() {
  return createUserWordListHandlers({ userDataDir: dir, log, isTrustedSender });
}
const file = (): string => path.join(dir, USER_WORD_LIST_FILENAME);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-user-words-"));
  log = vi.fn<(message: string) => void>();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("sender check first", () => {
  it.each(["get", "add", "remove"] as const)(
    "%s refuses an untrusted sender before validating or touching the file",
    (name) => {
      fs.writeFileSync(file(), JSON.stringify(["keep"]));
      const before = fs.readFileSync(file(), "utf8");
      const handlers = make();
      // A non-string payload would be a validation error if validation ran.
      const call = () =>
        name === "get"
          ? handlers.get(untrusted)
          : handlers[name](untrusted, 42);
      expect(call).toThrow(/untrusted sender/);
      expect(fs.readFileSync(file(), "utf8")).toBe(before);
    },
  );

  it("does not read the file for an untrusted sender", () => {
    const spy = vi.spyOn(fs, "readFileSync");
    expect(() => make().get(untrusted)).toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("get", () => {
  it("returns an empty list when the file does not exist", () => {
    expect(make().get(trusted)).toEqual({ ok: true, words: [] });
  });

  it("returns the stored words", () => {
    fs.writeFileSync(file(), JSON.stringify(["alpha", "beta"]));
    expect(make().get(trusted)).toEqual({ ok: true, words: ["alpha", "beta"] });
  });

  it("errors on a corrupt file instead of returning an empty list", () => {
    fs.writeFileSync(file(), "{not json");
    expect(make().get(trusted)).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
  });

  it("errors on valid JSON that is not an array of strings", () => {
    fs.writeFileSync(file(), JSON.stringify({ words: ["a"] }));
    expect(make().get(trusted)).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
  });
});

describe("add", () => {
  it("persists and returns the list, in userData, apart from workspace.json", () => {
    const result = make().add(trusted, "Zorblax");
    expect(result).toEqual({ ok: true, words: ["Zorblax"] });
    expect(JSON.parse(fs.readFileSync(file(), "utf8"))).toEqual(["Zorblax"]);
    expect(path.dirname(file())).toBe(dir);
    expect(USER_WORD_LIST_FILENAME).not.toBe("workspace.json");
    expect(fs.existsSync(path.join(dir, "workspace.json"))).toBe(false);
  });

  it("is idempotent and does not rewrite for a repeat", () => {
    const handlers = make();
    handlers.add(trusted, "Zorblax");
    const writes = vi.spyOn(fs, "renameSync");
    expect(handlers.add(trusted, "zorblax")).toEqual({
      ok: true,
      words: ["Zorblax"],
    });
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("two calls in sequence do not lose a word", () => {
    const handlers = make();
    handlers.add(trusted, "one");
    handlers.add(trusted, "two");
    expect(handlers.get(trusted)).toEqual({ ok: true, words: ["one", "two"] });
  });

  it.each([
    ["non-string", 42, "invalid-word"],
    ["empty", "   ", "invalid-word"],
    ["whitespace inside", "two words", "invalid-word"],
    ["control character", "a\u0007b", "invalid-word"],
    ["over length", "x".repeat(101), "too-long"],
  ])("refuses a %s word and leaves the file unchanged", (_n, word, reason) => {
    fs.writeFileSync(file(), JSON.stringify(["keep"]));
    const before = fs.readFileSync(file(), "utf8");
    expect(make().add(trusted, word)).toMatchObject({ ok: false, reason });
    expect(fs.readFileSync(file(), "utf8")).toBe(before);
  });

  it("refuses the 5001st word and leaves the file unchanged", () => {
    const full = Array.from({ length: 5000 }, (_, i) => `w${i}`);
    fs.writeFileSync(file(), JSON.stringify(full));
    const before = fs.readFileSync(file(), "utf8");
    expect(make().add(trusted, "extra")).toMatchObject({
      ok: false,
      reason: "list-full",
    });
    expect(fs.readFileSync(file(), "utf8")).toBe(before);
  });

  it("does not overwrite a corrupt file", () => {
    fs.writeFileSync(file(), "garbage");
    expect(make().add(trusted, "word")).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
    expect(fs.readFileSync(file(), "utf8")).toBe("garbage");
  });

  it("reports a write failure and logs it", () => {
    // A read-only directory: the read finds no file, the write cannot happen.
    fs.chmodSync(dir, 0o500);
    try {
      expect(make().add(trusted, "word")).toMatchObject({
        ok: false,
        reason: "write-failed",
      });
      expect(log).toHaveBeenCalled();
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });
});

describe("remove", () => {
  it("removes, persists and returns the list", () => {
    fs.writeFileSync(file(), JSON.stringify(["a", "b"]));
    expect(make().remove(trusted, "A")).toEqual({ ok: true, words: ["b"] });
    expect(JSON.parse(fs.readFileSync(file(), "utf8"))).toEqual(["b"]);
  });

  it("is idempotent for an absent word, creating no file", () => {
    expect(make().remove(trusted, "nope")).toEqual({ ok: true, words: [] });
    expect(fs.existsSync(file())).toBe(false);
  });

  it("refuses an invalid word and leaves the file unchanged", () => {
    fs.writeFileSync(file(), JSON.stringify(["a"]));
    expect(make().remove(trusted, 7)).toMatchObject({
      ok: false,
      reason: "invalid-word",
    });
    expect(JSON.parse(fs.readFileSync(file(), "utf8"))).toEqual(["a"]);
  });
});

describe("parity with the frontend core (Task 1)", () => {
  const inputs: unknown[] = [
    "word",
    " Word ",
    "WORD",
    "café",
    "café",
    "",
    "a b",
    "a\tb",
    "x".repeat(100),
    "x".repeat(101),
    7,
    null,
  ];
  const seed = ["Word", "café"];

  it("add and remove accept and refuse exactly what the core does, with the same reason", () => {
    for (const input of inputs) {
      for (const op of ["add", "remove"] as const) {
        fs.writeFileSync(file(), JSON.stringify(seed));
        const core = op === "add" ? addWord : removeWord;
        let expected:
          | { ok: true; words: string[] }
          | { ok: false; reason: string };
        try {
          expected = { ok: true, words: core(seed, input) };
        } catch (e) {
          if (!(e instanceof UserWordListError)) throw e;
          expected = { ok: false, reason: e.reason };
        }
        const actual = make()[op](trusted, input);
        if (expected.ok)
          expect(actual, `${op} ${String(input)}`).toEqual(expected);
        else expect(actual, `${op} ${String(input)}`).toMatchObject(expected);
      }
    }
  });
});
