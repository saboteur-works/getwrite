import { describe, it, expect } from "vitest";
import {
  InvalidProjectIdError,
  validateProjectId,
  respondInvalidProjectId,
} from "../../src/lib/models/project-path";

describe("validateProjectId", () => {
  it("returns a well-formed UUID unchanged", () => {
    const id = crypto.randomUUID();
    expect(validateProjectId(id)).toBe(id);
  });

  const adversarialInputs: Array<[string, string]> = [
    ["../otherProject", "relative traversal"],
    ["../../etc", "multi-level relative traversal"],
    ["/etc/passwd", "absolute path"],
    ["..%2Fother", "URL-encoded separator"],
    ["abc\0def", "embedded null byte"],
    ["", "empty string"],
    ["foo/bar", "non-UUID string with embedded path separator"],
  ];

  it.each(adversarialInputs)("rejects %j (%s)", (input) => {
    expect(() => validateProjectId(input)).toThrow(InvalidProjectIdError);
  });
});

describe("respondInvalidProjectId", () => {
  it("returns a 400 response", () => {
    const response = respondInvalidProjectId();
    expect(response.status).toBe(400);
  });

  it("returns a fixed, generic body regardless of any project's existence on disk", async () => {
    const first = await respondInvalidProjectId().json();
    const second = await respondInvalidProjectId().json();
    expect(first).toEqual(second);
    expect(first).toEqual({ error: "Invalid projectId" });
  });
});
