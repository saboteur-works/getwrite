import { describe, it, expect } from "vitest";
import { isNewer } from "../src/lib/models/semver-compare";

describe("isNewer", () => {
  it("returns true when the candidate has a greater patch", () => {
    expect(isNewer("0.2.50", "0.2.49")).toBe(true);
  });

  it("returns true when the candidate has a greater minor", () => {
    expect(isNewer("0.3.0", "0.2.49")).toBe(true);
  });

  it("returns true when the candidate has a greater major", () => {
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
  });

  it("returns false for equal versions", () => {
    expect(isNewer("0.2.49", "0.2.49")).toBe(false);
  });

  it("returns false when the candidate is older", () => {
    expect(isNewer("0.2.48", "0.2.49")).toBe(false);
  });

  it("ignores a leading v prefix on either side", () => {
    expect(isNewer("v0.2.50", "0.2.49")).toBe(true);
    expect(isNewer("0.2.50", "v0.2.50")).toBe(false);
  });

  it("ignores pre-release/build suffixes", () => {
    expect(isNewer("0.2.50-beta.1", "0.2.49")).toBe(true);
    expect(isNewer("0.2.49-rc.1", "0.2.49")).toBe(false);
  });

  it("treats missing components as zero", () => {
    expect(isNewer("1", "0.9.9")).toBe(true);
    expect(isNewer("1.0", "1.0.0")).toBe(false);
  });

  it("returns false for unparseable input rather than throwing", () => {
    expect(isNewer("not-a-version", "0.2.49")).toBe(false);
    expect(isNewer("0.2.50", "garbage")).toBe(false);
  });
});
