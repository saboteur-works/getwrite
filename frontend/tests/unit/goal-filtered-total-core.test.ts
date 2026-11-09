/**
 * Feature 98, Task 6 (FR-10, FR-13, FR-14): the filtered total core returns a
 * discriminated result; the unavailable branch carries no number.
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

vi.mock("../../src/lib/models/folder-utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/folder-utils")>();
  return { ...actual, readFolderTree: vi.fn(actual.readFolderTree) };
});

import * as io from "../../src/lib/models/io";
import * as folderUtils from "../../src/lib/models/folder-utils";
import {
  evaluateGoalFilteredTotal,
  evaluateGoalTotal,
} from "../../src/lib/models/goal-filtered-total-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";

const NOW = new Date("2026-06-01T00:00:00.000Z");
let root: string;
const realReadFile = (
  await vi.importActual<typeof import("../../src/lib/models/io")>(
    "../../src/lib/models/io",
  )
).readFile;

async function seedProject(config: Record<string, unknown>): Promise<void> {
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: "p1", name: "P", config }),
  );
}

async function seedResource(
  id: string,
  sidecar: Record<string, unknown> | null,
  content?: string,
): Promise<void> {
  const dir = path.join(root, "resources", id);
  await fs.mkdir(dir, { recursive: true });
  if (content !== undefined) {
    await fs.writeFile(path.join(dir, "content.txt"), content);
  }
  if (sidecar === null) return;
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", `resource-${id}.meta.json`),
    JSON.stringify({ id, type: "text", ...sidecar }),
  );
}

const typeText = { op: "eq", field: "type", value: "text" };
const statusDraft = { op: "eq", field: "status", value: "draft" };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "goal-total-"));
});

afterEach(async () => {
  vi.mocked(io.readFile).mockReset();
  vi.mocked(io.readFile).mockImplementation(realReadFile);
  await fs.rm(root, { recursive: true, force: true });
});

describe("evaluateGoalFilteredTotal", () => {
  it("equals the unfiltered text-only sum when the filter matches every text document", async () => {
    await seedProject({ goalFilter: typeText });
    await seedResource("a", { wordCount: 10 });
    await seedResource("b", { wordCount: 5, userMetadata: { wordCount: 7 } });
    await seedResource("c", {});
    await seedResource("img", { type: "image", wordCount: 99 });
    // userMetadata.wordCount ?? wordCount ?? 0 -> 10 + 7 + 0
    expect(await evaluateGoalFilteredTotal(root, NOW)).toEqual({
      status: "total",
      total: 17,
    });
  });

  it("does not sum the evaluator's content-derived counts", async () => {
    await seedProject({ goalFilter: typeText });
    await seedResource("a", { wordCount: 3 }, "one two three four five six");
    await seedResource("b", {}, "alpha beta gamma");
    expect(await evaluateGoalFilteredTotal(root, NOW)).toEqual({
      status: "total",
      total: 3,
    });
  });

  it("sums a Source's sidecar count with a text document's under a writer-set filter (Feature 102 FR-28)", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("t", {
      wordCount: 4,
      userMetadata: { status: "draft" },
    });
    await seedResource("s", {
      type: "source",
      wordCount: 6,
      userMetadata: { status: "draft" },
    });
    expect(await evaluateGoalFilteredTotal(root, NOW)).toEqual({
      status: "total",
      total: 10,
    });
  });

  it("sums only members of the filter", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", {
      wordCount: 4,
      userMetadata: { status: "draft" },
    });
    await seedResource("b", {
      wordCount: 8,
      userMetadata: { status: "final" },
    });
    expect(await evaluateGoalFilteredTotal(root, NOW)).toEqual({
      status: "total",
      total: 4,
    });
  });

  it("returns total 0 flagged no-match when nothing matches", async () => {
    await seedProject({ goalFilter: statusDraft });
    await seedResource("a", {
      wordCount: 8,
      userMetadata: { status: "final" },
    });
    expect(await evaluateGoalFilteredTotal(root, NOW)).toEqual({
      status: "no-match",
      total: 0,
    });
  });

  it("returns not-filtered, with no number, when no filter is stored", async () => {
    await seedProject({});
    await seedResource("a", { wordCount: 8 });
    const result = await evaluateGoalFilteredTotal(root, NOW);
    expect(result).toEqual({ status: "not-filtered" });
    expect("total" in result).toBe(false);
  });

  it("is recomputed on every call (edit, trash, restore, copy)", async () => {
    await seedProject({ goalFilter: statusDraft });
    const draft = (n: number): Record<string, unknown> => ({
      wordCount: n,
      userMetadata: { status: "draft" },
    });
    await seedResource("a", draft(2));
    await seedResource("b", draft(3));
    const total = (): ReturnType<typeof evaluateGoalFilteredTotal> =>
      evaluateGoalFilteredTotal(root, NOW);
    expect(await total()).toEqual({ status: "total", total: 5 });

    await seedResource("a", draft(10)); // edit
    expect(await total()).toEqual({ status: "total", total: 13 });

    const live = path.join(root, "resources", "b");
    const trashed = path.join(root, ".trash", "b");
    await fs.mkdir(path.join(root, ".trash"), { recursive: true });
    await fs.rename(live, trashed); // trash
    expect(await total()).toEqual({ status: "total", total: 10 });

    await fs.rename(trashed, live); // restore
    expect(await total()).toEqual({ status: "total", total: 13 });

    await seedResource("copy", draft(4)); // copy counts on its own fields
    expect(await total()).toEqual({ status: "total", total: 17 });
  });

  describe("unavailable results carry no number", () => {
    function expectUnavailable(result: object, reason: string): void {
      expect(result).toMatchObject({ status: "unavailable", reason });
      expect("total" in result).toBe(false);
    }

    it("invalid stored filter", async () => {
      await seedProject({ goalFilter: { op: "ref", id: "q1" } });
      await seedResource("a", { wordCount: 1 });
      expectUnavailable(
        await evaluateGoalFilteredTotal(root, NOW),
        "invalid-filter",
      );
    });

    it("missing field", async () => {
      await seedProject({
        goalFilter: { op: "eq", field: "gone", value: "x" },
        metadataSchema: { groups: [] },
      });
      await seedResource("a", { wordCount: 1 });
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "missing-field");
      expect(result).toMatchObject({ fields: ["gone"] });
    });

    it("directory with no sidecar", async () => {
      await seedProject({ goalFilter: statusDraft });
      await seedResource("a", { userMetadata: { status: "draft" } });
      await seedResource("bare", null);
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "missing-sidecar" });
    });

    it("sidecar read error", async () => {
      await seedProject({ goalFilter: statusDraft });
      await seedResource("a", { userMetadata: { status: "draft" } });
      await fs.writeFile(
        path.join(root, "meta", "resource-a.meta.json"),
        "{not json",
      );
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "corrupt" });
    });

    it("failed listing", async () => {
      await seedProject({ goalFilter: statusDraft });
      await fs.writeFile(path.join(root, "resources"), "x");
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "unreadable" });
    });

    it("config read error", async () => {
      await fs.writeFile(path.join(root, "project.json"), "{nope");
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "corrupt" });
    });

    it("locked or keyless project", async () => {
      await seedProject({ goalFilter: statusDraft });
      vi.mocked(io.readFile).mockImplementation((() =>
        Promise.reject(new ProjectLockedError("p1"))) as typeof io.readFile);
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "locked" });
    });

    it("a sidecar that fails to read while summing members", async () => {
      await seedProject({ goalFilter: typeText });
      await seedResource("a", { wordCount: 1 });
      let sidecarReads = 0;
      vi.mocked(io.readFile).mockImplementation(((
        p: string,
        e?: BufferEncoding,
      ) => {
        if (p.endsWith("resource-a.meta.json") && ++sidecarReads > 1) {
          return Promise.reject(new SyntaxError("bad"));
        }
        return realReadFile(p, e);
      }) as typeof io.readFile);
      const result = await evaluateGoalFilteredTotal(root, NOW);
      expectUnavailable(result, "read-failed");
      expect(result).toMatchObject({ cause: "corrupt" });
    });
  });

  it("rethrows an error it does not recognise", async () => {
    await seedProject({ goalFilter: statusDraft });
    vi.mocked(io.readFile).mockImplementation((() =>
      Promise.reject(new TypeError("unexpected"))) as typeof io.readFile);
    await expect(evaluateGoalFilteredTotal(root, NOW)).rejects.toThrow(
      "unexpected",
    );
  });

  it("rethrows an error whose code is not a file-read code", async () => {
    await seedProject({ goalFilter: statusDraft });
    const odd = Object.assign(new Error("odd"), { code: "ERR_ODD" });
    vi.mocked(io.readFile).mockImplementation((() =>
      Promise.reject(odd)) as typeof io.readFile);
    await expect(evaluateGoalFilteredTotal(root, NOW)).rejects.toThrow("odd");
  });
});

describe("evaluateGoalTotal (Feature 106 FR-7, server total)", () => {
  const INBOX = "11111111-1111-4111-8111-111111111111";
  const SUB = "22222222-2222-4222-8222-222222222222";
  const OTHER = "33333333-3333-4333-8333-333333333333";

  async function seedFolder(id: string, parentId?: string): Promise<void> {
    const dir = path.join(root, "folders", id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "folder.json"),
      JSON.stringify({ id, name: id, parentId }),
    );
  }

  async function seedInboxProject(
    config: Record<string, unknown> = {},
  ): Promise<void> {
    await seedProject({ inboxFolderId: INBOX, ...config });
    await seedFolder(INBOX);
    await seedFolder(SUB, INBOX);
    await seedFolder(OTHER);
  }

  const total = (): ReturnType<typeof evaluateGoalTotal> =>
    evaluateGoalTotal(root, NOW);

  it("with no filter, skips text in the Inbox and in a descendant folder, and counts one outside", async () => {
    await seedInboxProject();
    await seedResource("in", { wordCount: 100, folderId: INBOX });
    await seedResource("deep", { wordCount: 200, folderId: SUB });
    await seedResource("out", { wordCount: 7, folderId: OTHER });
    await seedResource("root", { wordCount: 3 });
    expect(await total()).toEqual({ status: "total", total: 10 });
  });

  it("with no filter, keeps skipping a Source and non-text as before", async () => {
    await seedInboxProject();
    await seedResource("t", { wordCount: 4 });
    await seedResource("s", { type: "source", wordCount: 50 });
    await seedResource("img", { type: "image", wordCount: 60 });
    expect(await total()).toEqual({ status: "total", total: 4 });
  });

  it("with a filter that selects the Inbox by the Folder intrinsic, the Inbox items count", async () => {
    await seedInboxProject({
      goalFilter: { op: "eq", field: "folderId", value: INBOX },
    });
    await seedResource("in", { wordCount: 100, folderId: INBOX });
    await seedResource("out", { wordCount: 7, folderId: OTHER });
    expect(await total()).toEqual({ status: "total", total: 100 });
  });

  it("with a filter that does not mention the Inbox, the filter alone decides", async () => {
    await seedInboxProject({ goalFilter: typeText });
    await seedResource("in", { wordCount: 100, folderId: INBOX });
    await seedResource("out", { wordCount: 7, folderId: OTHER });
    expect(await total()).toEqual({ status: "total", total: 107 });
  });

  it("counts the words once the item is moved out", async () => {
    await seedInboxProject();
    await seedResource("a", { wordCount: 100, folderId: INBOX });
    await seedResource("b", { wordCount: 5, folderId: OTHER });
    expect(await total()).toEqual({ status: "total", total: 5 });
    await seedResource("a", { wordCount: 100, folderId: OTHER });
    expect(await total()).toEqual({ status: "total", total: 105 });
  });

  it("counts everything when no Inbox is configured", async () => {
    await seedProject({});
    await seedResource("a", { wordCount: 2 });
    expect(await total()).toEqual({ status: "total", total: 2 });
  });

  it("reads the folder tree once for many resources", async () => {
    await seedInboxProject();
    for (let i = 0; i < 12; i += 1) {
      await seedResource(`r${i}`, { wordCount: 1, folderId: OTHER });
    }
    vi.mocked(folderUtils.readFolderTree).mockClear();
    expect(await total()).toEqual({ status: "total", total: 12 });
    expect(folderUtils.readFolderTree).toHaveBeenCalledTimes(1);
  });

  it("is unavailable, never 0, when the folder tree cannot be read", async () => {
    await seedInboxProject();
    await seedResource("a", { wordCount: 1 });
    vi.mocked(folderUtils.readFolderTree).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    const result = await total();
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "read-failed",
      cause: "unreadable",
    });
    expect("total" in result).toBe(false);
  });

  it("is unavailable when the folders form a cycle through the Inbox", async () => {
    await seedProject({ inboxFolderId: INBOX });
    await seedFolder(INBOX, SUB);
    await seedFolder(SUB, INBOX);
    await seedResource("a", { wordCount: 1, folderId: SUB });
    const result = await total();
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "read-failed",
    });
    expect("total" in result).toBe(false);
  });

  it("is unavailable, never 0, when a sidecar is missing or corrupt", async () => {
    await seedInboxProject();
    await seedResource("a", { wordCount: 1 });
    await seedResource("bare", null);
    expect(await total()).toMatchObject({
      status: "unavailable",
      cause: "missing-sidecar",
    });
    await fs.rm(path.join(root, "resources", "bare"), { recursive: true });
    await fs.writeFile(
      path.join(root, "meta", "resource-a.meta.json"),
      "{not json",
    );
    expect(await total()).toMatchObject({
      status: "unavailable",
      cause: "corrupt",
    });
  });

  it("passes a filter's unavailable result through", async () => {
    await seedProject({ goalFilter: { op: "ref", id: "q1" } });
    expect(await total()).toMatchObject({
      status: "unavailable",
      reason: "invalid-filter",
    });
  });
});
