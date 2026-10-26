/**
 * Feature 96, Task 25 (added after Task 23, defect 4; spec FR-24): which cue,
 * if any, the editor footer shows about the spell checker. Pure derivation
 * plus the composed selector over a real store.
 */
import { describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import spellingReducer, {
  type SpellingState,
} from "../src/store/spellingSlice";
import userWordListReducer, {
  initialUserWordListState,
  type UserWordListState,
} from "../src/store/userWordListSlice";
import availabilityReducer, {
  browserUnsupported,
  continueWithoutUserList,
  engineFailed,
  setUserListApplies,
} from "../src/store/spellingAvailabilitySlice";
import {
  deriveSpellCheckEditorCue,
  selectSpellCheckEditorCue,
} from "../src/store/spellCheckEditorCue";

function makeStore(
  spelling: Partial<SpellingState> = {},
  userWordList: Partial<UserWordListState> = {},
) {
  const initial = spellingReducer(undefined, { type: "@@init" });
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
      userWordList: userWordListReducer,
    },
    preloadedState: {
      spelling: {
        ...initial,
        status: "loaded" as const,
        aliasTableStatus: "loaded" as const,
        ...spelling,
      },
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
      userWordList: { ...initialUserWordListState, ...userWordList },
    },
  });
}

describe("deriveSpellCheckEditorCue", () => {
  it("is null when the checker is active and the user words are applied", () => {
    expect(deriveSpellCheckEditorCue({ status: "active" }, false)).toBeNull();
  });

  it("is notApplied when the checker is active and user words are not applied", () => {
    expect(deriveSpellCheckEditorCue({ status: "active" }, true)).toEqual({
      kind: "notApplied",
    });
  });

  it("is null while the checker is only loading", () => {
    expect(
      deriveSpellCheckEditorCue(
        {
          status: "paused",
          reasons: [{ kind: "loading", message: "Spelling data is loading." }],
        },
        false,
      ),
    ).toBeNull();
  });

  it("is paused with the first failure's message, skipping a loading reason", () => {
    expect(
      deriveSpellCheckEditorCue(
        {
          status: "paused",
          reasons: [
            { kind: "loading", message: "Your dictionary is loading." },
            { kind: "engine-failed", message: "Engine down." },
          ],
        },
        false,
      ),
    ).toEqual({ kind: "paused", message: "Engine down." });
  });

  it("prefers paused over notApplied", () => {
    expect(
      deriveSpellCheckEditorCue(
        {
          status: "paused",
          reasons: [{ kind: "lists-failed", message: "Lists failed." }],
        },
        true,
      ),
    ).toEqual({ kind: "paused", message: "Lists failed." });
  });
});

describe("selectSpellCheckEditorCue", () => {
  it("is null for a healthy store", () => {
    expect(selectSpellCheckEditorCue(makeStore().getState())).toBeNull();
  });

  it("is null while the project lists are still loading", () => {
    const store = makeStore({
      status: "not-loaded",
      aliasTableStatus: "not-loaded",
    });
    expect(selectSpellCheckEditorCue(store.getState())).toBeNull();
  });

  it.each([
    [
      "lists-failed",
      { status: "failed" as const, errorMessage: "disk" },
      "The project's spelling lists could not be loaded (disk).",
    ],
    [
      "alias-table-failed",
      { aliasTableStatus: "failed" as const, aliasTableErrorMessage: "net" },
      "The entity names could not be loaded (net).",
    ],
  ])("is paused for %s with the slice's message", (_k, spelling, message) => {
    const store = makeStore(spelling);
    expect(selectSpellCheckEditorCue(store.getState())).toEqual({
      kind: "paused",
      message,
    });
  });

  it("is paused for engine-failed", () => {
    const store = makeStore();
    store.dispatch(engineFailed("worker crashed"));
    expect(selectSpellCheckEditorCue(store.getState())).toEqual({
      kind: "paused",
      message: "The spell checker stopped working (worker crashed).",
    });
  });

  it("is paused for browser-unsupported", () => {
    const store = makeStore();
    store.dispatch(browserUnsupported({ detected: 60, minimum: 67 }));
    expect(selectSpellCheckEditorCue(store.getState())).toEqual({
      kind: "paused",
      message: "Spell checking needs Chrome 67 or newer; this is Chrome 60.",
    });
  });

  it("is paused for user-list-failed, then notApplied after Continue without my dictionary", () => {
    const store = makeStore({}, { status: "failed", reason: "read-failed" });
    store.dispatch(setUserListApplies(true));
    const paused = selectSpellCheckEditorCue(store.getState());
    expect(paused?.kind).toBe("paused");
    store.dispatch(continueWithoutUserList());
    expect(selectSpellCheckEditorCue(store.getState())).toEqual({
      kind: "notApplied",
    });
  });

  it("is null when the user list does not apply (paired device), whatever its status", () => {
    const store = makeStore({}, { status: "failed", reason: "read-failed" });
    expect(selectSpellCheckEditorCue(store.getState())).toBeNull();
  });

  it("returns the same object for an unchanged state", () => {
    const store = makeStore();
    store.dispatch(engineFailed("x"));
    expect(selectSpellCheckEditorCue(store.getState())).toBe(
      selectSpellCheckEditorCue(store.getState()),
    );
  });
});
