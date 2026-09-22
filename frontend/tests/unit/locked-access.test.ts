// Last Updated: 2026-09-17

import { describe, it, expect } from "vitest";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { ProjectMarkerFormatError } from "../../src/lib/models/crypto/project-marker";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("isLockedAccessError", () => {
  it("returns true for a ProjectLockedError", () => {
    expect(isLockedAccessError(new ProjectLockedError(PROJECT_ID))).toBe(true);
  });

  it("returns true for a MissingProjectKeyError", () => {
    expect(isLockedAccessError(new MissingProjectKeyError(PROJECT_ID))).toBe(
      true,
    );
  });

  it("returns false for a ProjectMarkerFormatError", () => {
    expect(
      isLockedAccessError(new ProjectMarkerFormatError("bad marker")),
    ).toBe(false);
  });

  it("returns false for a plain unrelated Error", () => {
    expect(isLockedAccessError(new Error("unrelated"))).toBe(false);
  });
});
