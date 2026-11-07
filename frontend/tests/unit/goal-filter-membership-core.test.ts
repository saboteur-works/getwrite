/**
 * Feature 98, Task 5 (FR-6, FR-8, FR-10, FR-12, FR-17, FR-18): the goal
 * membership core returns a discriminated result, so a failure can never read
 * as "no match" or "not filtered".
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/io", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/io")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

import * as io from "../../src/lib/models/io";
import { evaluateGoalMembership } from "../../src/lib/models/goal-filter-membership-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";

const NOW = new Date("2026-06-01T00:00:00.000Z");
let root: string;
const realReadFile = (
  await vi.importActual<typeof import("../../src/lib/models/io")>(
    "../../src/lib/models/io",
  )
).readFile;

type Config = Record<string, unknown>;

async function seedProject(config: Config): Promise<void> {
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: "p1", name: "P", config }),
  );
}

async function seedResource(
  id: string,
  sidecar: Record<string, unknown> | null,
): Promise<void> {
  await fs.mkdir(path.join(root, "resources", id), { recursive: true });
  if (sidecar === null) return;
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", `resource-${id}.meta.json`),
    JSON.stringify({ id, type: "text", ...sidecar }),
  );
}

/** Makes `io.readFile` reject with `err` for paths ending in `suffix`. */
function failReadsEndingWith(suffix: string, err: Error): void {
  vi.mocked(io.readFile).mockImplementation(((p: string, e?: BufferEncoding) =>
    p.endsWith(suffix)
      ? Promise.reject(err)
      : realReadFile(p, e)) as typeof io.readFile);
}

const statusDraft = { op: "eq", field: "status", value: "draft" };
const draftSidecar = (
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ userMetadata: { status: "draft" }, ...extra });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "goal-membership-"));
});

afterEach(async () => {
  vi.mocked(io.readFile).mockReset();
  vi.mocked(io.readFile).mockImplementation(realReadFile);
  await fs.rm(root, { recursive: true, force: true });
});

describe("evaluateGoalMembership", () => {
  it("returns not-filtered when no goal filter is stored", async () => {
    await seedProject({});
    await seedResource("r1", draftSidecar());
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "not-filtered",
    });
  });

  it("returns only text resources that match", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("t1", draftSidecar());
    await seedResource("img", draftSidecar({ type: "image" }));
    await seedResource("aud", draftSidecar({ type: "audio" }));
    await seedResource("fold", draftSidecar({ type: "folder" }));
    await seedResource("t2", { userMetadata: { status: "final" } });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["t1"],
    });
  });

  it("includes a Source under a writer-set filter by the same rule as text (Feature 102 FR-28)", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("t1", draftSidecar());
    await seedResource("s1", draftSidecar({ type: "source" }));
    await seedResource("s2", {
      type: "source",
      userMetadata: { status: "final" },
    });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["s1", "t1"],
    });
  });

  it("evaluates a Source's word count under a wordCount filter as it does a text document's (Feature 102 FR-28)", async () => {
    await seedProject({
      goalFilter: { op: "gte", field: "wordCount", value: 3 },
    });
    await seedResource("t1", { wordCount: 3 });
    await seedResource("s1", { type: "source", wordCount: 3 });
    await seedResource("t2", { wordCount: 1 });
    await seedResource("s2", { type: "source", wordCount: 1 });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["s1", "t1"],
    });
  });

  it("still leaves image, audio and folder resources out", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("s1", draftSidecar({ type: "source" }));
    await seedResource("img", draftSidecar({ type: "image" }));
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["s1"],
    });
  });

  it("selects text resources by subtype", async () => {
    await seedProject({
      subtypes: ["Scene"],
      goalFilter: { op: "eq", field: "resourceSubtype", value: "Scene" },
    });
    await seedResource("scene", { resourceSubtype: "scene" });
    await seedResource("outline", { resourceSubtype: "Outline" });
    await seedResource("none", {});
    await seedResource("image", { type: "image", resourceSubtype: "Scene" });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["scene"],
    });
  });

  it("excludes a trashed resource and includes it again once restored", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", draftSidecar());
    await seedResource("b", draftSidecar());
    const live = path.join(root, "resources", "b");
    const trashed = path.join(root, ".trash", "b");
    await fs.mkdir(path.join(root, ".trash"), { recursive: true });
    await fs.rename(live, trashed);
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["a"],
    });
    await fs.rename(trashed, live);
    const restored = await evaluateGoalMembership(root, NOW);
    expect(restored.status === "members" && [...restored.ids].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("evaluates a copy on its own fields", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("orig", draftSidecar());
    await seedResource("copy", { userMetadata: { status: "final" } });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["orig"],
    });
  });

  it("returns every text id for a filter that matches every text document", async () => {
    await seedProject({
      goalFilter: { op: "eq", field: "type", value: "text" },
    });
    await seedResource("a", {});
    await seedResource("b", {});
    await seedResource("img", { type: "image" });
    const result = await evaluateGoalMembership(root, NOW);
    expect(result.status === "members" && [...result.ids].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns no-match, distinct from a failure, when nothing matches", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", { userMetadata: { status: "final" } });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "no-match",
    });
  });

  it("returns no-match when the project has no resources directory", async () => {
    await seedProject({ goalFilter: statusDraft });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "no-match",
    });
  });

  it("returns an invalid-filter failure and leaves project.json untouched", async () => {
    await seedProject({ goalFilter: { op: "ref", id: "q1" } });
    await seedResource("a", draftSidecar());
    const before = await fs.readFile(path.join(root, "project.json"), "utf8");
    const result = await evaluateGoalMembership(root, NOW);
    expect(result).toMatchObject({
      status: "failure",
      reason: "invalid-filter",
    });
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(
      before,
    );
  });

  it("returns a missing-field failure naming the field that no longer exists", async () => {
    await seedProject({
      goalFilter: { op: "eq", field: "deletedField", value: "x" },
      metadataSchema: {
        groups: [
          {
            id: "g",
            label: "G",
            fields: [{ key: "status", label: "Status", type: "text" }],
          },
        ],
      },
    });
    await seedResource("a", draftSidecar());
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "missing-field",
      fields: ["deletedField"],
    });
  });

  it("evaluates a condition on a deprecated field normally", async () => {
    await seedProject({
      goalFilter: { op: "eq", field: "old", value: "x" },
      metadataSchema: {
        groups: [
          {
            id: "g",
            label: "G",
            fields: [
              { key: "old", label: "Old", type: "text", deprecated: true },
            ],
          },
        ],
      },
    });
    await seedResource("a", { userMetadata: { old: "x" } });
    await seedResource("b", { userMetadata: { old: "y" } });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["a"],
    });
  });

  it("uses the default schema when none is persisted (built-in field is not missing)", async () => {
    await seedProject({ goalFilter: { op: "exists", field: "synopsis" } });
    await seedResource("a", { userMetadata: { synopsis: "s" } });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["a"],
    });
  });

  it("evaluates eq on an absent value as the evaluator does (no match)", async () => {
    await seedProject({
      goalFilter: { op: "eq", field: "synopsis", value: "x" },
    });
    await seedResource("a", {});
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "no-match",
    });
  });

  it("treats intrinsic fields as present even when absent from the schema", async () => {
    await seedProject({
      goalFilter: { op: "gte", field: "wordCount", value: 5 },
      metadataSchema: { groups: [] },
    });
    await seedResource("a", { wordCount: 9 });
    await seedResource("b", { wordCount: 1 });
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "members",
      ids: ["a"],
    });
  });

  it("surfaces a resource directory with no sidecar as a failure", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", draftSidecar());
    await seedResource("bare", null);
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "missing-sidecar",
    });
  });

  it("surfaces a corrupt sidecar as a failure", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", draftSidecar());
    await fs.writeFile(
      path.join(root, "meta", "resource-a.meta.json"),
      "{not json",
    );
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "corrupt",
    });
  });

  it("surfaces a failed listing as a failure, not as no-match", async () => {
    await seedProject({ goalFilter: statusDraft });
    // `resources` is a file, so readdir fails with a non-ENOENT error.
    await fs.writeFile(path.join(root, "resources"), "x");
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "unreadable",
    });
  });

  it("surfaces a corrupt project.json as a failure", async () => {
    await fs.writeFile(path.join(root, "project.json"), "{nope");
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "corrupt",
    });
  });

  it("surfaces a missing project.json as a failure", async () => {
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "unreadable",
    });
  });

  it("surfaces a locked project as a failure", async () => {
    await seedProject({ goalFilter: statusDraft });
    failReadsEndingWith("project.json", new ProjectLockedError("p1"));
    expect(await evaluateGoalMembership(root, NOW)).toEqual({
      status: "failure",
      reason: "read-failed",
      cause: "locked",
    });
  });

  it("rethrows an error it does not recognise", async () => {
    await seedProject({ goalFilter: statusDraft });
    failReadsEndingWith("project.json", new TypeError("unexpected"));
    await expect(evaluateGoalMembership(root, NOW)).rejects.toThrow(
      "unexpected",
    );
  });

  it("rethrows an error whose code is not a file-read code", async () => {
    await seedProject({ goalFilter: statusDraft });
    const odd = Object.assign(new Error("odd"), { code: "ERR_ODD" });
    failReadsEndingWith("project.json", odd);
    await expect(evaluateGoalMembership(root, NOW)).rejects.toThrow("odd");
  });

  it("never writes project.json", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", draftSidecar());
    const before = await fs.stat(path.join(root, "project.json"));
    await evaluateGoalMembership(root, NOW);
    const after = await fs.stat(path.join(root, "project.json"));
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
