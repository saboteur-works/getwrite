import { describe, it, expect, beforeEach } from "vitest";
import {
  getSuppressedVersion,
  setSuppressedVersion,
  isSuppressed,
  clearSuppressedVersion,
} from "../src/lib/update-notice-suppression";

describe("update-notice-suppression", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips the suppressed version through localStorage", () => {
    expect(getSuppressedVersion()).toBeNull();
    setSuppressedVersion("0.3.0");
    expect(getSuppressedVersion()).toBe("0.3.0");
  });

  it("clears the suppressed version", () => {
    setSuppressedVersion("0.3.0");
    clearSuppressedVersion();
    expect(getSuppressedVersion()).toBeNull();
  });

  it("suppresses a version equal to the stored one", () => {
    setSuppressedVersion("0.3.0");
    expect(isSuppressed("0.3.0")).toBe(true);
  });

  it("suppresses a version older than the stored one", () => {
    setSuppressedVersion("0.3.0");
    expect(isSuppressed("0.2.9")).toBe(true);
  });

  it("does not suppress a version newer than the stored one (FR7)", () => {
    setSuppressedVersion("0.3.0");
    expect(isSuppressed("0.3.1")).toBe(false);
  });

  it("does not suppress anything when nothing is stored", () => {
    expect(isSuppressed("0.3.0")).toBe(false);
  });
});
