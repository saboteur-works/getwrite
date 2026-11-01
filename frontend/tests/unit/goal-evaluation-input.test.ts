/**
 * Feature 98, Task 3 (FR-17, FR-18): `loadGoalEvaluationInput` fails on a
 * config read error, a sidecar read error and a `resources/<id>` directory with
 * no sidecar. A pinned smart-folder test shows `executeEvaluate` still skips a
 * directory with no sidecar (no behaviour change there).
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
import {
  GoalEvaluationInputError,
  loadGoalEvaluationInput,
} from "../../src/lib/models/goal-evaluation-input";
import { executeEvaluate } from "../../src/lib/models/query-evaluate-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";

let root: string;
const realReadFile = (
  await vi.importActual<typeof import("../../src/lib/models/io")>(
    "../../src/lib/models/io",
  )
).readFile;

/** Makes `io.readFile` throw `err` for paths ending in `suffix`; others read normally. */
function failReadsEndingWith(suffix: string, err: Error): void {
  vi.mocked(io.readFile).mockImplementation(((
    p: string,
    e?: BufferEncoding,
  ) => {
    if (p.endsWith(suffix)) return Promise.reject(err);
    return realReadFile(p, e);
  }) as typeof io.readFile);
}

async function seedProject(): Promise<void> {
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: "p1", name: "P", config: {} }),
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
    JSON.stringify(sidecar),
  );
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "goal-eval-input-"));
});

afterEach(async () => {
  vi.mocked(io.readFile).mockReset();
  vi.mocked(io.readFile).mockImplementation(realReadFile);
  await fs.rm(root, { recursive: true, force: true });
});

describe("loadGoalEvaluationInput", () => {
  it("loads resources and flattened sidecars for a healthy project", async () => {
    await seedProject();
    await seedResource("r1", {
      id: "r1",
      name: "One",
      type: "text",
      wordCount: 12,
      userMetadata: { status: "draft" },
    });

    const when = new Date("2026-01-02T00:00:00.000Z");
    const input = await loadGoalEvaluationInput(root, when);

    expect(input.resources.map((r) => r.id)).toEqual(["r1"]);
    expect(input.sidecars.r1?.status).toBe("draft");
    expect(input.evaluationTime).toBe(when);
    expect(input.context.config).toBeDefined();
  });

  it("does not read content.txt (counts come from the sidecar)", async () => {
    await seedProject();
    await seedResource("r1", { id: "r1", type: "text", wordCount: 5 });
    await fs.writeFile(
      path.join(root, "resources", "r1", "content.txt"),
      "one two three",
    );

    await loadGoalEvaluationInput(root);

    const read = vi.mocked(io.readFile).mock.calls.map((c) => String(c[0]));
    expect(read.some((p) => p.endsWith("content.txt"))).toBe(false);
  });

  it("fails when a listed resource directory has no sidecar", async () => {
    await seedProject();
    await seedResource("r1", { id: "r1", type: "text" });
    await seedResource("orphan", null);

    const failure = await loadGoalEvaluationInput(root).catch(
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(GoalEvaluationInputError);
    expect(failure).toMatchObject({
      reason: "missing-sidecar",
      resourceId: "orphan",
    });
  });

  it("fails on a non-ENOENT sidecar read error", async () => {
    await seedProject();
    await seedResource("r1", { id: "r1", type: "text" });
    const err = Object.assign(new Error("denied"), { code: "EACCES" });
    failReadsEndingWith("resource-r1.meta.json", err);

    await expect(loadGoalEvaluationInput(root)).rejects.toBe(err);
  });

  it("fails on a sidecar that is not valid JSON", async () => {
    await seedProject();
    await seedResource("r1", null);
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(root, "meta", "resource-r1.meta.json"),
      "{nope",
    );

    await expect(loadGoalEvaluationInput(root)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it("fails when project.json cannot be read", async () => {
    await seedResource("r1", { id: "r1", type: "text" });

    await expect(loadGoalEvaluationInput(root)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails when project.json is not valid JSON", async () => {
    await fs.writeFile(path.join(root, "project.json"), "{nope");

    await expect(loadGoalEvaluationInput(root)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it("rethrows a locked-access error from the config read", async () => {
    const err = new ProjectLockedError("p1");
    failReadsEndingWith("project.json", err);

    await expect(loadGoalEvaluationInput(root)).rejects.toBe(err);
  });

  it("fails when the resources listing fails (resources is a file)", async () => {
    await seedProject();
    await fs.writeFile(path.join(root, "resources"), "x");

    await expect(loadGoalEvaluationInput(root)).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });

  it("returns an empty resource list when resources/ is missing", async () => {
    await seedProject();

    const input = await loadGoalEvaluationInput(root);

    expect(input.resources).toEqual([]);
  });
});

describe("smart-folder evaluation (executeEvaluate), unchanged", () => {
  it("still skips a resources/<id> directory that has no sidecar", async () => {
    await seedProject();
    await seedResource("r1", { id: "r1", name: "One", type: "text" });
    await seedResource("orphan", null);

    const ids = await executeEvaluate(root, {
      op: "eq",
      field: "type",
      value: "text",
    });

    expect(ids).toEqual(["r1"]);
  });
});
