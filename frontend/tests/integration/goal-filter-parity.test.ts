/**
 * Feature 98 Task 9 (FR-35): the goal filter's set, clear and filtered total
 * give identical results and errors through the core, the HTTP route handler
 * and the native backend.
 *
 * Each fixture is seeded three times: twice into real temp directories (one
 * driven through the core, one through the route handler) and once into a fake
 * Capacitor filesystem (driven through the native backend). The three outputs
 * are then compared with each other, and with the literal expected value so a
 * shared regression cannot pass by agreeing with itself.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET as getTotalRoute } from "../../app/api/project/goal-filtered-total/route";
import { PUT as putFilterRoute } from "../../app/api/project/goal-filter/route";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  InvalidGoalFilterError,
  setGoalFilterCore,
} from "../../src/lib/models/goal-filter-core";
import {
  GOAL_FILTER_BOUNDS,
  GOAL_FILTER_MESSAGES,
  type GoalFilterRefusalReason,
} from "../../src/lib/models/goal-filter-validation";
import {
  evaluateGoalFilteredTotal,
  type GoalFilteredTotalResult,
} from "../../src/lib/models/goal-filtered-total-core";
import { resolveProjectRoot } from "../../src/lib/models/project-root-resolver";
import { generateUUID } from "../../src/lib/models/uuid";
import { createNativeGoalFilterTransport } from "../../src/store/transport/native-goal-filter-backend";
import { createNativeGoalTotalTransport } from "../../src/store/transport/native-goal-total-backend";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const NATIVE_PROJECTS_DIR = "/projects";
const NOW = new Date("2026-06-01T00:00:00.000Z");

/** A sidecar to seed: `null` means the resource has no sidecar at all. */
interface ResourceFixture {
  id: string;
  sidecar: Record<string, unknown> | null | "corrupt";
}

interface ProjectFixture {
  config: Record<string, unknown>;
  resources: ResourceFixture[];
}

/** The minimal write surface shared by `fs/promises` and the native adapter. */
interface Writer {
  mkdir(p: string): Promise<void>;
  writeFile(p: string, data: string): Promise<void>;
  readFile(p: string): Promise<string>;
}

const realWriter: Writer = {
  mkdir: async (p) => {
    await fs.mkdir(p, { recursive: true });
  },
  writeFile: (p, data) => fs.writeFile(p, data, "utf8"),
  readFile: (p) => fs.readFile(p, "utf8"),
};

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function seed(
  writer: Writer,
  projectsDir: string,
  fixture: ProjectFixture,
): Promise<string> {
  const projectId = generateUUID();
  const root = path.join(projectsDir, projectId);
  await writer.mkdir(root);
  await writer.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: projectId, name: "parity", config: fixture.config }),
  );
  for (const resource of fixture.resources) {
    await writer.mkdir(path.join(root, "resources", resource.id));
    if (resource.sidecar === null) continue;
    await writer.mkdir(path.join(root, "meta"));
    await writer.writeFile(
      path.join(root, "meta", `resource-${resource.id}.meta.json`),
      resource.sidecar === "corrupt"
        ? "{ not json"
        : JSON.stringify({
            id: resource.id,
            type: "text",
            ...resource.sidecar,
          }),
    );
  }
  return projectId;
}

interface Side {
  projectsDir: string;
  projectId: string;
  writer: Writer;
}

async function seedReal(fixture: ProjectFixture): Promise<Side> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gf-parity-"));
  tmpDirs.push(projectsDir);
  const projectId = await seed(realWriter, projectsDir, fixture);
  return { projectsDir, projectId, writer: realWriter };
}

interface Trio {
  core: Side;
  route: Side;
  nativeFs: ReturnType<typeof createFakeCapacitorFilesystem>;
  nativeId: string;
  nativeWriter: Writer;
}

async function seedTrio(fixture: ProjectFixture): Promise<Trio> {
  const core = await seedReal(fixture);
  const route = await seedReal(fixture);
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const nativeWriter: Writer = {
    mkdir: (p) => adapter.mkdir(p, { recursive: true }),
    writeFile: (p, data) => adapter.writeFile(p, data),
    readFile: async (p) => String(await adapter.readFile(p, "utf8")),
  };
  const nativeId = await seed(nativeWriter, NATIVE_PROJECTS_DIR, fixture);
  return { core, route, nativeFs, nativeId, nativeWriter };
}

async function withProjectsDir<T>(dir: string, fn: () => Promise<T>) {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

async function storedConfig(
  writer: Writer,
  projectsDir: string,
  projectId: string,
): Promise<Record<string, unknown>> {
  const raw = await writer.readFile(
    path.join(projectsDir, projectId, "project.json"),
  );
  return (JSON.parse(raw) as { config: Record<string, unknown> }).config;
}

// ---------------------------------------------------------------- set/clear

/** One transport's outcome for a set or clear, in a comparable shape. */
type SetOutcome =
  | { ok: true; goalFilter: unknown; stored: unknown; keyPresent: boolean }
  | { ok: false; message: string; status?: number; reason?: string };

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function viaCore(trio: Trio, filter: unknown): Promise<SetOutcome> {
  const { projectsDir, projectId, writer } = trio.core;
  return withProjectsDir(projectsDir, async () => {
    try {
      const saved = await setGoalFilterCore(projectId, filter);
      const config = await storedConfig(writer, projectsDir, projectId);
      return {
        ok: true,
        goalFilter: saved.goalFilter,
        stored: config.goalFilter,
        keyPresent: "goalFilter" in config,
      };
    } catch (error) {
      if (error instanceof InvalidGoalFilterError) {
        return { ok: false, message: error.message, reason: error.reason };
      }
      throw error;
    }
  });
}

async function viaRoute(trio: Trio, filter: unknown): Promise<SetOutcome> {
  const { projectsDir, projectId, writer } = trio.route;
  return withProjectsDir(projectsDir, async () => {
    const res = await putFilterRoute(
      new NextRequest("http://localhost/api/project/goal-filter", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, goalFilter: filter }),
      }),
    );
    const body = (await res.json()) as { goalFilter?: unknown; error?: string };
    if (res.status !== 200) {
      return { ok: false, message: String(body.error), status: res.status };
    }
    const config = await storedConfig(writer, projectsDir, projectId);
    return {
      ok: true,
      goalFilter: body.goalFilter,
      stored: config.goalFilter,
      keyPresent: "goalFilter" in config,
    };
  });
}

async function viaNative(trio: Trio, filter: unknown): Promise<SetOutcome> {
  const transport = createNativeGoalFilterTransport({
    fs: trio.nativeFs,
    projectsDir: NATIVE_PROJECTS_DIR,
  });
  try {
    const saved = await transport.setGoalFilter(trio.nativeId, filter);
    const config = await storedConfig(
      trio.nativeWriter,
      NATIVE_PROJECTS_DIR,
      trio.nativeId,
    );
    return {
      ok: true,
      goalFilter: saved.goalFilter,
      stored: config.goalFilter,
      keyPresent: "goalFilter" in config,
    };
  } catch (error) {
    if (error instanceof InvalidGoalFilterError) {
      return { ok: false, message: error.message, reason: error.reason };
    }
    throw error;
  }
}

/** Runs one set/clear on all three transports and returns the outcomes. */
async function runSet(fixture: ProjectFixture, filter: unknown) {
  const trio = await seedTrio(fixture);
  return {
    core: await viaCore(trio, filter),
    route: await viaRoute(trio, filter),
    native: await viaNative(trio, filter),
  };
}

const leaf = (n = 0) => ({ op: "eq", field: "status", value: `s${n}` });

function chain(depth: number): unknown {
  let node: unknown = leaf();
  for (let i = 1; i < depth; i += 1) node = { op: "and", children: [node] };
  return node;
}

const VALID = { op: "eq", field: "status", value: "draft" };
const EMPTY_PROJECT: ProjectFixture = { config: {}, resources: [] };

const REFUSALS: ReadonlyArray<{
  name: string;
  reason: GoalFilterRefusalReason;
  filter: unknown;
}> = [
  { name: "schema", reason: "schema", filter: { op: "nope" } },
  {
    name: "ref",
    reason: "ref",
    filter: { op: "and", children: [leaf(), { op: "ref", id: "q" }] },
  },
  {
    name: "param",
    reason: "param",
    filter: { op: "or", children: [leaf(), { op: "param", name: "p" }] },
  },
  {
    name: "relative-date",
    reason: "relative-date",
    filter: {
      op: "gte",
      field: "updatedAt",
      value: { amount: 7, unit: "days" },
    },
  },
  {
    name: "no-condition",
    reason: "no-condition",
    filter: { op: "and", children: [] },
  },
  {
    name: "too-deep",
    reason: "too-deep",
    filter: chain(GOAL_FILTER_BOUNDS.maxDepth + 1),
  },
  {
    name: "too-many-conditions",
    reason: "too-many-conditions",
    filter: {
      op: "or",
      children: Array.from(
        { length: GOAL_FILTER_BOUNDS.maxConditions + 1 },
        (_, i) => leaf(i),
      ),
    },
  },
];

describe("goal filter set/clear parity: core, route, native (FR-35)", () => {
  it("stores a valid filter identically on all three", async () => {
    const { core, route, native } = await runSet(EMPTY_PROJECT, VALID);
    const expected: SetOutcome = {
      ok: true,
      goalFilter: VALID,
      stored: VALID,
      keyPresent: true,
    };
    expect(core).toEqual(expected);
    expect(jsonRoundTrip(route)).toEqual(jsonRoundTrip(expected));
    expect(native).toEqual(core);
    expect(route).toEqual(core);
  });

  it.each(REFUSALS)(
    "refuses $name with the same message and writes nothing",
    async ({ reason, filter }) => {
      const { core, route, native } = await runSet(EMPTY_PROJECT, filter);
      const message = GOAL_FILTER_MESSAGES[reason];
      expect(core).toEqual({ ok: false, message, reason });
      expect(native).toEqual({ ok: false, message, reason });
      expect(route).toEqual({ ok: false, message, status: 400 });
    },
  );

  it("leaves the stored filter untouched after a refusal on all three", async () => {
    const fixture: ProjectFixture = {
      config: { goalFilter: VALID, dailyWordGoal: 500 },
      resources: [],
    };
    const trio = await seedTrio(fixture);
    await viaCore(trio, { op: "ref", id: "q" });
    await viaRoute(trio, { op: "ref", id: "q" });
    await viaNative(trio, { op: "ref", id: "q" });
    const configs = [
      await storedConfig(
        trio.core.writer,
        trio.core.projectsDir,
        trio.core.projectId,
      ),
      await storedConfig(
        trio.route.writer,
        trio.route.projectsDir,
        trio.route.projectId,
      ),
      await storedConfig(trio.nativeWriter, NATIVE_PROJECTS_DIR, trio.nativeId),
    ];
    for (const config of configs) {
      expect(config).toEqual({ goalFilter: VALID, dailyWordGoal: 500 });
    }
  });

  it("clears a stored filter by deleting the key, identically on all three, keeping other keys", async () => {
    const fixture: ProjectFixture = {
      config: { goalFilter: VALID, dailyWordGoal: 500 },
      resources: [],
    };
    const { core, route, native } = await runSet(fixture, null);
    const expected: SetOutcome = {
      ok: true,
      goalFilter: undefined,
      stored: undefined,
      keyPresent: false,
    };
    expect(core).toEqual(expected);
    expect(native).toEqual(expected);
    // The route body omits the undefined key; JSON has no undefined.
    expect(route).toEqual(expected);
  });

  it("clearing a project that has no filter succeeds identically", async () => {
    const { core, route, native } = await runSet(EMPTY_PROJECT, null);
    expect(core).toMatchObject({ ok: true, keyPresent: false });
    expect(route).toEqual(core);
    expect(native).toEqual(core);
  });

  it("rejects an invalid project id on all three with the same refusal", async () => {
    const trio = await seedTrio(EMPTY_PROJECT);
    await withProjectsDir(trio.core.projectsDir, async () => {
      await expect(setGoalFilterCore("not-a-uuid", VALID)).rejects.toThrow(
        /Invalid projectId/,
      );
    });
    const res = await withProjectsDir(trio.route.projectsDir, () =>
      putFilterRoute(
        new NextRequest("http://localhost/api/project/goal-filter", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: "not-a-uuid", goalFilter: VALID }),
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid projectId",
    );
    const transport = createNativeGoalFilterTransport({
      fs: trio.nativeFs,
      projectsDir: NATIVE_PROJECTS_DIR,
    });
    await expect(transport.setGoalFilter("not-a-uuid", VALID)).rejects.toThrow(
      expect.objectContaining({ message: "Invalid projectId" }),
    );
  });
});

// ------------------------------------------------------------ filtered total

const draft = (wordCount: number): Record<string, unknown> => ({
  wordCount,
  userMetadata: { status: "draft" },
});
const final = (wordCount: number): Record<string, unknown> => ({
  wordCount,
  userMetadata: { status: "final" },
});

async function totalViaCore(trio: Trio): Promise<GoalFilteredTotalResult> {
  return withProjectsDir(trio.core.projectsDir, async () => {
    const root = resolveProjectRoot(trio.core.projectId);
    if (!root) throw new Error("core project did not resolve");
    return evaluateGoalFilteredTotal(root, NOW);
  });
}

async function totalViaRoute(trio: Trio): Promise<unknown> {
  return withProjectsDir(trio.route.projectsDir, async () => {
    const res = await getTotalRoute(
      new NextRequest(
        `http://localhost/api/project/goal-filtered-total?projectId=${trio.route.projectId}`,
      ),
    );
    expect(res.status).toBe(200);
    return res.json();
  });
}

async function totalViaNative(trio: Trio): Promise<GoalFilteredTotalResult> {
  return createNativeGoalTotalTransport({
    fs: trio.nativeFs,
    projectsDir: NATIVE_PROJECTS_DIR,
  }).getGoalFilteredTotal(trio.nativeId);
}

async function runTotal(fixture: ProjectFixture) {
  const trio = await seedTrio(fixture);
  return {
    core: await totalViaCore(trio),
    route: await totalViaRoute(trio),
    native: await totalViaNative(trio),
  };
}

function expectIdentical(
  outcome: { core: unknown; route: unknown; native: unknown },
  expected: GoalFilteredTotalResult,
): void {
  expect(outcome.core).toEqual(expected);
  expect(outcome.route).toEqual(expected);
  expect(outcome.native).toEqual(expected);
}

describe("goal filtered total parity: core, route, native (FR-35)", () => {
  it("sums the members' sidecar counts identically (matching total)", async () => {
    const outcome = await runTotal({
      config: { goalFilter: VALID },
      resources: [
        { id: "a", sidecar: draft(4) },
        {
          id: "b",
          sidecar: {
            ...draft(5),
            userMetadata: { status: "draft", wordCount: 9 },
          },
        },
        { id: "c", sidecar: final(100) },
      ],
    });
    expectIdentical(outcome, { status: "total", total: 13 });
  });

  it("reports no-match with total 0 identically", async () => {
    const outcome = await runTotal({
      config: { goalFilter: VALID },
      resources: [{ id: "a", sidecar: final(8) }],
    });
    expectIdentical(outcome, { status: "no-match", total: 0 });
  });

  it("reports not-filtered, with no number, when no filter is stored", async () => {
    const outcome = await runTotal({
      config: {},
      resources: [{ id: "a", sidecar: draft(8) }],
    });
    expectIdentical(outcome, { status: "not-filtered" });
    expect("total" in (outcome.route as object)).toBe(false);
  });

  it("reports unavailable/invalid-filter with no total key identically", async () => {
    const outcome = await runTotal({
      config: { goalFilter: { op: "ref", id: "q" } },
      resources: [{ id: "a", sidecar: draft(8) }],
    });
    expectIdentical(outcome, {
      status: "unavailable",
      reason: "invalid-filter",
      message: GOAL_FILTER_MESSAGES.ref,
    });
    expect("total" in (outcome.route as object)).toBe(false);
  });

  it("reports unavailable/missing-field identically", async () => {
    const outcome = await runTotal({
      config: { goalFilter: { op: "eq", field: "mood", value: "calm" } },
      resources: [{ id: "a", sidecar: draft(8) }],
    });
    expectIdentical(outcome, {
      status: "unavailable",
      reason: "missing-field",
      fields: ["mood"],
    });
  });

  it("reports unavailable/read-failed (corrupt sidecar) identically", async () => {
    const outcome = await runTotal({
      config: { goalFilter: VALID },
      resources: [
        { id: "a", sidecar: draft(8) },
        { id: "b", sidecar: "corrupt" },
      ],
    });
    expectIdentical(outcome, {
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    expect("total" in (outcome.route as object)).toBe(false);
  });

  it("reports unavailable/read-failed (missing sidecar) identically", async () => {
    const outcome = await runTotal({
      config: { goalFilter: VALID },
      resources: [
        { id: "a", sidecar: draft(8) },
        { id: "b", sidecar: null },
      ],
    });
    expect(outcome.core).toMatchObject({ status: "unavailable" });
    expect(outcome.route).toEqual(outcome.core);
    expect(outcome.native).toEqual(outcome.core);
  });

  it("rejects an invalid project id on route and native", async () => {
    const trio = await seedTrio(EMPTY_PROJECT);
    const res = await withProjectsDir(trio.route.projectsDir, () =>
      getTotalRoute(
        new NextRequest(
          "http://localhost/api/project/goal-filtered-total?projectId=nope",
        ),
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid projectId",
    );
    await expect(
      createNativeGoalTotalTransport({
        fs: trio.nativeFs,
        projectsDir: NATIVE_PROJECTS_DIR,
      }).getGoalFilteredTotal("nope"),
    ).rejects.toThrow(/Invalid projectId/);
  });
});
