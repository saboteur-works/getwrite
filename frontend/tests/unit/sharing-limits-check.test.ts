import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decideLimit,
  checkLimit,
  refusalFor,
  checkUserWordListAccess,
} from "../../src/lib/sharing/limits-check";
import {
  LIMIT_REFUSAL_MESSAGES,
  USER_WORD_LIST_REFUSAL_MESSAGE,
} from "../../src/lib/sharing/limits-copy";
import { CLASSIFICATION_HEADER } from "../../src/lib/sharing/classify-request";
import {
  LIMITS_FILE_NAME,
  type LimitKey,
  type Limits,
} from "../../src/lib/sharing/limits-store";

const KEYS: LimitKey[] = [
  "projectDeletion",
  "unlocking",
  "locking",
  "encryptionChanges",
  "permanentDeletion",
];

function limits(value: boolean): Limits {
  return {
    projectDeletion: value,
    unlocking: value,
    locking: value,
    encryptionChanges: value,
    permanentDeletion: value,
  };
}

function req(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set(CLASSIFICATION_HEADER, header);
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers,
    body: '{"secret":"s3"}',
  });
}

describe("decideLimit", () => {
  it.each(["off", "window"])("allows %s even when the limit is on", (h) => {
    for (const k of KEYS)
      expect(decideLimit(h, limits(true), k)).toBe("allowed");
  });
  it("confirmed: refused when on, allowed when off", () => {
    for (const k of KEYS) {
      expect(decideLimit("confirmed:d1", limits(true), k)).toBe("refused");
      expect(decideLimit("confirmed:d1", limits(false), k)).toBe("allowed");
    }
  });
  it("not-confirmed:no-credential is treated as a paired device subject to the file", () => {
    expect(
      decideLimit("not-confirmed:no-credential", limits(true), "locking"),
    ).toBe("refused");
    expect(
      decideLimit("not-confirmed:no-credential", limits(false), "locking"),
    ).toBe("allowed");
  });
  it.each([null, "garbage", "confirmed:", ""])(
    "refuses a missing, empty or unparseable header (%s) for every key, whatever the limits say",
    (h) => {
      for (const k of KEYS) {
        expect(decideLimit(h, limits(true), k)).toBe("refused");
        expect(decideLimit(h, limits(false), k)).toBe("refused");
      }
    },
  );
});

describe("checkLimit", () => {
  it.each(["off", "window"])("does not read the limits for %s", (h) => {
    const reader = vi.fn(() => limits(true));
    expect(checkLimit(req(h), "unlocking", reader)).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });

  it("reads for a paired device and returns null when the limit is off", () => {
    const reader = vi.fn(() => limits(false));
    expect(checkLimit(req("confirmed:d1"), "unlocking", reader)).toBeNull();
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("refuses with 403 and the exact body, no gate header, no echo", async () => {
    const reader = (): Limits => ({ ...limits(false), locking: true });
    for (const h of [
      "confirmed:d1",
      null,
      "junk",
      "not-confirmed:store-corrupt",
    ]) {
      const res = checkLimit(req(h), "locking", reader);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
      expect(res!.headers.get("x-getwrite-gate")).toBeNull();
      expect(res!.headers.get("location")).toBeNull();
      const body: unknown = await res!.json();
      expect(body).toEqual({
        error: LIMIT_REFUSAL_MESSAGES.locking,
        limit: "locking",
      });
      expect(Object.keys(body as object).sort()).toEqual(["error", "limit"]);
    }
  });

  it("has a distinct non-empty message per limit", () => {
    const messages = KEYS.map((k) => LIMIT_REFUSAL_MESSAGES[k]);
    for (const m of messages) expect(m.length).toBeGreaterThan(10);
    expect(new Set(messages).size).toBe(5);
    for (const k of KEYS) expect(refusalFor(k).status).toBe(403);
  });

  it("refusalFor and checkLimit use a supplied message in place of the key's, keeping the key and 403", async () => {
    const direct = refusalFor("permanentDeletion", "Custom sentence.");
    expect(direct.status).toBe(403);
    expect(await direct.json()).toEqual({
      error: "Custom sentence.",
      limit: "permanentDeletion",
    });
    const checked = checkLimit(
      req("confirmed:d1"),
      "permanentDeletion",
      () => limits(true),
      "Custom sentence.",
    );
    expect(checked?.status).toBe(403);
    expect(await checked!.json()).toEqual({
      error: "Custom sentence.",
      limit: "permanentDeletion",
    });
    expect(
      checkLimit(
        req("window"),
        "permanentDeletion",
        () => limits(true),
        "Custom sentence.",
      ),
    ).toBeNull();
  });

  it.each([null, "", "garbage", "confirmed:"])(
    "refuses header %s for every key with that key's 403 and does not read the limits",
    async (h) => {
      for (const k of KEYS) {
        const reader = vi.fn(() => limits(false));
        const res = checkLimit(req(h), k, reader);
        expect(res?.status).toBe(403);
        expect(await res!.json()).toEqual({
          error: LIMIT_REFUSAL_MESSAGES[k],
          limit: k,
        });
        expect(reader).not.toHaveBeenCalled();
      }
    },
  );

  describe("with the real file reader", () => {
    let dir: string;
    const saved = process.env.GETWRITE_SHARING_DIR;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "limits-check-"));
      process.env.GETWRITE_SHARING_DIR = dir;
    });
    afterEach(() => {
      if (saved === undefined) delete process.env.GETWRITE_SHARING_DIR;
      else process.env.GETWRITE_SHARING_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const write = (l: Limits): void =>
      fs.writeFileSync(
        path.join(dir, LIMITS_FILE_NAME),
        JSON.stringify({ version: 1, limits: l }),
      );

    it("unreadable file refuses every key", () => {
      fs.mkdirSync(path.join(dir, LIMITS_FILE_NAME)); // a directory: read fails
      for (const k of KEYS)
        expect(checkLimit(req("confirmed:d1"), k)?.status).toBe(403);
    });

    it("a change applies on the next call in both directions", () => {
      write(limits(false));
      expect(checkLimit(req("confirmed:d1"), "unlocking")).toBeNull();
      write(limits(true));
      expect(checkLimit(req("confirmed:d1"), "unlocking")?.status).toBe(403);
      write(limits(false));
      expect(checkLimit(req("confirmed:d1"), "unlocking")).toBeNull();
    });

    it("exempt classification is allowed even with an unreadable file", () => {
      fs.mkdirSync(path.join(dir, LIMITS_FILE_NAME));
      expect(checkLimit(req("window"), "unlocking")).toBeNull();
      expect(checkLimit(req("off"), "unlocking")).toBeNull();
    });
  });
});

describe("checkUserWordListAccess (always refused for a paired caller)", () => {
  it.each(["off", "window"])("does not refuse %s", (h) => {
    expect(checkUserWordListAccess(req(h))).toBeNull();
  });

  it.each(["confirmed:d1", "not-confirmed:no-credential", "", "garbage", null])(
    "refuses a paired or unclassified caller (%s) with 403 { error, limit }",
    async (h) => {
      const res = checkUserWordListAccess(req(h));
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
      const body = (await res?.json()) as { error: string; limit: string };
      expect(Object.keys(body).sort()).toEqual(["error", "limit"]);
      expect(body.error).toBe(USER_WORD_LIST_REFUSAL_MESSAGE);
      expect(body.limit).toBe("userWordList");
    },
  );

  it("refuses a paired caller on GET as well as POST", () => {
    const get = new Request("http://localhost/api/user-word-list", {
      method: "GET",
      headers: { [CLASSIFICATION_HEADER]: "confirmed:d1" },
    });
    expect(checkUserWordListAccess(get)?.status).toBe(403);
  });

  it("does not read the limits file and leaves the LimitKey table unchanged", () => {
    expect(Object.keys(LIMIT_REFUSAL_MESSAGES).sort()).toEqual(
      [...KEYS].sort(),
    );
  });
});
