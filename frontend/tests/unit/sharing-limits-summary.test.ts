/**
 * The App Settings limits summary (Feature 77, Task 24, FR-28): generated from
 * the effective limit state; never says a paired device can do something a
 * limit has stopped, nor that it cannot when a limit is off.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeLimits,
  type LimitsReadState,
} from "../../components/Sharing/sharing-copy";
import type { SharingLimitKey } from "../../src/lib/desktop-bridge";

const KEYS: SharingLimitKey[] = [
  "projectDeletion",
  "unlocking",
  "locking",
  "encryptionChanges",
  "permanentDeletion",
];

/** Words of each action as they appear in the summary. */
const PHRASE: Record<SharingLimitKey, string> = {
  projectDeletion: "delete projects",
  unlocking: "unlock",
  locking: "lock",
  encryptionChanges: "change encryption",
  permanentDeletion: "permanently delete",
};

function read(
  on: Partial<Record<SharingLimitKey, boolean>>,
  kind: "ok" | "missing" | "invalid" | "unreadable" = "ok",
): LimitsReadState {
  const limits = {
    projectDeletion: false,
    unlocking: false,
    locking: false,
    encryptionChanges: false,
    permanentDeletion: false,
    ...on,
  };
  return { status: "read", result: { kind, limits, storeDirectory: "/u" } };
}

const ALL_ON = Object.fromEntries(KEYS.map((k) => [k, true])) as Record<
  SharingLimitKey,
  boolean
>;

/** Whole-word match, so "lock" is not found inside "unlock". */
function has(sentence: string, key: SharingLimitKey): boolean {
  return new RegExp(`\\b${PHRASE[key]}\\b`).test(sentence);
}

/** Splits the summary into its "can" and "cannot" sentences. */
function parts(text: string): { can: string; cannot: string } {
  const sentences = text.split(". ").map((s) => s.replace(/\.$/, ""));
  return {
    can: sentences.find((s) => /\bcan\b/.test(s)) ?? "",
    cannot: sentences.find((s) => /\bcannot\b/.test(s)) ?? "",
  };
}

describe("summarizeLimits", () => {
  it("all five on says paired devices cannot do any of the five", () => {
    expect(summarizeLimits(read(ALL_ON))).toBe(
      "Paired devices cannot delete projects, unlock, lock, change encryption or permanently delete.",
    );
  });

  it("all five off lists all five as things paired devices can do", () => {
    expect(summarizeLimits(read({}))).toBe(
      "Paired devices can delete projects, unlock, lock, change encryption and permanently delete.",
    );
  });

  it("some off lists what they can do and what they cannot", () => {
    expect(
      summarizeLimits(read({ projectDeletion: true, locking: true })),
    ).toBe(
      "Paired devices can unlock, change encryption and permanently delete. They cannot delete projects or lock.",
    );
  });

  it.each(KEYS)(
    "with only %s on, that action is cannot and the rest can",
    (key) => {
      const { can, cannot } = parts(summarizeLimits(read({ [key]: true }))!);
      expect(has(cannot, key)).toBe(true);
      expect(has(can, key)).toBe(false);
      for (const other of KEYS.filter((k) => k !== key)) {
        expect(has(can, other)).toBe(true);
      }
    },
  );

  it.each(KEYS)(
    "with only %s off, that action is can and the rest cannot",
    (key) => {
      const on = { ...ALL_ON, [key]: false };
      const { can, cannot } = parts(summarizeLimits(read(on))!);
      expect(has(can, key)).toBe(true);
      expect(has(cannot, key)).toBe(false);
      for (const other of KEYS.filter((k) => k !== key)) {
        expect(has(cannot, other)).toBe(true);
      }
    },
  );

  it("an unreadable file reads as all on whatever limits the result carried", () => {
    expect(summarizeLimits(read({}, "unreadable"))).toBe(
      summarizeLimits(read(ALL_ON)),
    );
  });

  it("a missing or invalid file uses the effective limits it reports", () => {
    expect(summarizeLimits(read(ALL_ON, "missing"))).toBe(
      summarizeLimits(read(ALL_ON)),
    );
    expect(summarizeLimits(read({ locking: true }, "invalid"))).toContain(
      "They cannot lock.",
    );
  });

  it("a failed read says it could not be read and claims neither can nor cannot", () => {
    const text = summarizeLimits({ status: "failed" });
    expect(text).toBe(
      "What paired devices can do could not be read, so it is not known here.",
    );
    expect(text).not.toMatch(/cannot (delete|unlock|lock)/);
  });

  it("returns null while the first read is in flight", () => {
    expect(summarizeLimits({ status: "loading" })).toBeNull();
  });
});
