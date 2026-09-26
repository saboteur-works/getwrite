/**
 * Feature 59 Task 10: lib/api/writing-log.ts (HTTP transport, local-day window
 * computation) and its native backend, including native/HTTP parity.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTodayWritingLog,
  httpWritingLogTransport,
  localDayWindow,
  setDailyWordGoal,
} from "../../src/lib/api/writing-log";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import { GET } from "../../app/api/project/writing-log/route";
import { createNativeWritingLogTransport } from "../../src/store/transport/native-writing-log-backend";
import { InvalidWritingLogWindowError } from "../../src/lib/models/writing-log-core";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const originalTz = process.env.TZ;
const originalRuntime = process.env.NEXT_PUBLIC_GETWRITE_RUNTIME;
const tmpDirs: string[] = [];

afterEach(async () => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  if (originalRuntime === undefined)
    delete process.env.NEXT_PUBLIC_GETWRITE_RUNTIME;
  else process.env.NEXT_PUBLIC_GETWRITE_RUNTIME = originalRuntime;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

const hours = (w: { from: string; to: string }): number =>
  (Date.parse(w.to) - Date.parse(w.from)) / 3_600_000;

describe("localDayWindow", () => {
  it("returns local midnight to next local midnight as ISO instants (UTC+10-ish zone)", () => {
    process.env.TZ = "Australia/Brisbane"; // UTC+10, no DST
    const w = localDayWindow(new Date("2026-09-26T05:00:00.000Z"));
    expect(w).toEqual({
      from: "2026-09-25T14:00:00.000Z",
      to: "2026-09-26T14:00:00.000Z",
    });
  });

  it("yields a 23-hour window on the spring-forward day", () => {
    process.env.TZ = "America/New_York";
    const w = localDayWindow(new Date("2026-03-08T15:00:00.000Z"));
    expect(w.from).toBe("2026-03-08T05:00:00.000Z");
    expect(w.to).toBe("2026-03-09T04:00:00.000Z");
    expect(hours(w)).toBe(23);
  });

  it("yields a 25-hour window on the fall-back day", () => {
    process.env.TZ = "America/New_York";
    const w = localDayWindow(new Date("2026-11-01T15:00:00.000Z"));
    expect(w.from).toBe("2026-11-01T04:00:00.000Z");
    expect(w.to).toBe("2026-11-02T05:00:00.000Z");
    expect(hours(w)).toBe(25);
  });

  it("uses the fake clock when no instant is passed", () => {
    process.env.TZ = "Australia/Brisbane";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T05:00:00.000Z"));
    expect(localDayWindow().from).toBe("2026-09-25T14:00:00.000Z");
  });
});

describe("getTodayWritingLog / setDailyWordGoal — HTTP", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GETWRITE_RUNTIME;
  });

  const aggregate = {
    totals: { added: 5, deleted: 1, net: 4 },
    imported: { added: 0, deleted: 0, net: 0 },
    goal: 300,
    incomplete: false,
  };

  it("sends the local day's window as from/to query params, never in the path", async () => {
    process.env.TZ = "America/New_York";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => aggregate } as Response);

    const result = await getTodayWritingLog(
      "proj-1",
      new Date("2026-03-08T15:00:00.000Z"),
    );

    expect(result).toEqual(aggregate);
    const url = new URL(String(fetchSpy.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/project/writing-log");
    expect(url.searchParams.get("projectId")).toBe("proj-1");
    expect(url.searchParams.get("from")).toBe("2026-03-08T05:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-03-09T04:00:00.000Z");
  });

  it("accepts a response with no goal (JSON-dropped undefined)", async () => {
    const { goal: _goal, ...noGoal } = aggregate;
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => noGoal,
    } as Response);
    const r = await getTodayWritingLog("p");
    expect(r.goal).toBeUndefined();
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("rejects on a non-2xx response rather than resolving to zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "x" }),
    } as Response);
    await expect(getTodayWritingLog("p")).rejects.toThrow();
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getTodayWritingLog("p")).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ totals: "nope" }),
    } as Response);
    await expect(getTodayWritingLog("p")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "writing-log.getWritingLog",
      expect.any(Array),
    );
  });

  it("setDailyWordGoal PUTs projectId and goal, and returns the stored goal", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ dailyWordGoal: 400 }),
      } as Response);
    await expect(setDailyWordGoal("p", 400)).resolves.toEqual({
      dailyWordGoal: 400,
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/writing-log");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      dailyWordGoal: 400,
    });
  });

  it("setDailyWordGoal(null) accepts an empty object response (cleared)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    await expect(setDailyWordGoal("p", null)).resolves.toEqual({
      dailyWordGoal: undefined,
    });
  });

  it("setDailyWordGoal rejects on non-2xx with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid dailyWordGoal" }),
    } as Response);
    await expect(setDailyWordGoal("p", -1)).rejects.toThrow(
      "Invalid dailyWordGoal",
    );
  });

  it("setDailyWordGoal reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ dailyWordGoal: "x" }),
    } as Response);
    await expect(setDailyWordGoal("p", 1)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "writing-log.setDailyWordGoal",
      expect.any(Array),
    );
  });

  it("exposes the http transport object", () => {
    expect(typeof httpWritingLogTransport.getWritingLog).toBe("function");
  });
});

describe("native backend", () => {
  const FROM = "2026-09-25T14:00:00.000Z";
  const TO = "2026-09-26T14:00:00.000Z";

  async function seedNative(): Promise<{
    id: string;
    fsLike: ReturnType<typeof createFakeCapacitorFilesystem>;
  }> {
    const fsLike = createFakeCapacitorFilesystem();
    const adapter = capacitorFsAdapter(fsLike);
    const id = generateUUID();
    const root = path.join("/projects", id);
    await adapter.mkdir(root, { recursive: true });
    await adapter.writeFile(
      path.join(root, PROJECT_FILENAME),
      JSON.stringify(
        { ...createProject({ name: "n" }), config: { dailyWordGoal: 250 } },
        null,
        2,
      ),
    );
    await runInStorageContext({ tenantRoot: "/projects", adapter }, () =>
      appendWritingLogEntry(
        root,
        { added: 10, deleted: 2 },
        "2026-09-26T01:00:00.000Z",
      ),
    );
    return { id, fsLike };
  }

  it("returns the same result as the HTTP route for the same fixture", async () => {
    const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-wl-par-"));
    tmpDirs.push(projectsDir);
    const httpId = generateUUID();
    const httpRoot = path.join(projectsDir, httpId);
    await fs.mkdir(httpRoot, { recursive: true });
    await fs.writeFile(
      path.join(httpRoot, PROJECT_FILENAME),
      JSON.stringify({
        ...createProject({ name: "h" }),
        config: { dailyWordGoal: 250 },
      }),
    );
    await appendWritingLogEntry(
      httpRoot,
      { added: 10, deleted: 2 },
      "2026-09-26T01:00:00.000Z",
    );

    const original = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    let httpBody: unknown;
    try {
      const url = new URL("http://localhost/api/project/writing-log");
      url.searchParams.set("projectId", httpId);
      url.searchParams.set("from", FROM);
      url.searchParams.set("to", TO);
      const res = await GET(new Request(url) as never);
      expect(res.status).toBe(200);
      httpBody = await res.json();
    } finally {
      if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = original;
    }

    const { id, fsLike } = await seedNative();
    const native = createNativeWritingLogTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
    const nativeResult = await native.getWritingLog(id, FROM, TO);

    expect(JSON.parse(JSON.stringify(nativeResult))).toEqual(httpBody);
    expect(nativeResult.totals.net).toBe(8);
    expect(nativeResult.goal).toBe(250);
  });

  it("rejects the same windows as the core (missing, non-ISO, unordered, over cap)", async () => {
    const { id, fsLike } = await seedNative();
    const native = createNativeWritingLogTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
    const bad: [string, string][] = [
      ["", TO],
      ["yesterday", TO],
      [TO, FROM],
      [FROM, "2026-09-26T16:00:01.000Z"],
    ];
    for (const [from, to] of bad) {
      await expect(native.getWritingLog(id, from, to)).rejects.toBeInstanceOf(
        InvalidWritingLogWindowError,
      );
    }
  });

  it("sets and clears the goal", async () => {
    const { id, fsLike } = await seedNative();
    const native = createNativeWritingLogTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
    await expect(native.setDailyWordGoal(id, 42)).resolves.toEqual({
      dailyWordGoal: 42,
    });
    expect((await native.getWritingLog(id, FROM, TO)).goal).toBe(42);
    await native.setDailyWordGoal(id, null);
    expect((await native.getWritingLog(id, FROM, TO)).goal).toBeUndefined();
  });

  it("rejects an invalid projectId rather than returning zeros", async () => {
    const { fsLike } = await seedNative();
    const native = createNativeWritingLogTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
    await expect(native.getWritingLog("../x", FROM, TO)).rejects.toThrow();
  });
});
