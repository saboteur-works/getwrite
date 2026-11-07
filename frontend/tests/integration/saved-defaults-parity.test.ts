/**
 * Feature 101 Task 4 (FR-3): the same invalid (and valid) input gives the same
 * message through the HTTP client (wired to the real route handler over a real
 * temp directory) and through the native backend (over a fake Capacitor
 * filesystem), for both the compile and export setters.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PUT as putCompile } from "../../app/api/project/compile-defaults/route";
import { PUT as putExport } from "../../app/api/project/export-defaults/route";
import { httpCompileDefaultsTransport } from "../../src/lib/api/compile-defaults";
import { httpExportDefaultsTransport } from "../../src/lib/api/export-defaults";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  SAVED_DEFAULTS_MAX_IDS,
  SAVED_DEFAULTS_MESSAGES,
} from "../../src/lib/models/saved-defaults-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { createNativeCompileDefaultsTransport } from "../../src/store/transport/native-compile-defaults-backend";
import { createNativeExportDefaultsTransport } from "../../src/store/transport/native-export-defaults-backend";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const NATIVE_DIR = "/projects";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const SIDES = [
  {
    name: "compile",
    route: putCompile,
    endpoint: "/api/project/compile-defaults",
    http: httpCompileDefaultsTransport,
    native: createNativeCompileDefaultsTransport,
    key: "compileDefaults",
  },
  {
    name: "export",
    route: putExport,
    endpoint: "/api/project/export-defaults",
    http: httpExportDefaultsTransport,
    native: createNativeExportDefaultsTransport,
    key: "exportDefaults",
  },
] as const;

const INVALID: ReadonlyArray<{
  name: string;
  input: unknown;
  message: string;
}> = [
  {
    name: "non-array",
    input: "nope",
    message: SAVED_DEFAULTS_MESSAGES.notArray,
  },
  {
    name: "non-string id",
    input: [1],
    message: SAVED_DEFAULTS_MESSAGES.notString,
  },
  {
    name: "non-UUID id",
    input: ["x"],
    message: SAVED_DEFAULTS_MESSAGES.notUuid,
  },
  {
    name: "too many ids",
    input: Array.from({ length: SAVED_DEFAULTS_MAX_IDS + 1 }, () => A),
    message: SAVED_DEFAULTS_MESSAGES.tooMany,
  },
];

const tmpDirs: string[] = [];
const originalDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalDir === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalDir;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

function projectJson(id: string): string {
  return JSON.stringify({ id, name: "parity", config: { dailyWordGoal: 500 } });
}

async function seedHttp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-sd-parity-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  await fs.mkdir(path.join(dir, id), { recursive: true });
  await fs.writeFile(path.join(dir, id, "project.json"), projectJson(id));
  process.env.GETWRITE_PROJECTS_DIR = dir;
  return id;
}

async function seedNative() {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const id = generateUUID();
  await adapter.mkdir(path.join(NATIVE_DIR, id), { recursive: true });
  await adapter.writeFile(
    path.join(NATIVE_DIR, id, "project.json"),
    projectJson(id),
  );
  return { nativeFs, id };
}

/** Routes the HTTP client's fetch to the real route handler. */
function wireFetch(route: (req: NextRequest) => Promise<Response>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
    route(
      new NextRequest(`http://localhost${String(url)}`, {
        method: init?.method,
        headers: init?.headers as HeadersInit,
        body: init?.body as string,
      }),
    ),
  );
}

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "NO ERROR";
}

describe.each(SIDES)("$name defaults: HTTP client vs native backend", (s) => {
  it.each(INVALID)(
    "refuses $name with the same message on both",
    async ({ input, message: expected }) => {
      const httpId = await seedHttp();
      wireFetch(s.route);
      const { nativeFs, id } = await seedNative();
      const native = s.native({ fs: nativeFs, projectsDir: NATIVE_DIR });

      const viaHttp = await message(
        s.http.setDefaults(httpId, input as string[]),
      );
      const viaNative = await message(
        native.setDefaults(id, input as string[]),
      );
      expect(viaHttp).toBe(expected);
      expect(viaNative).toBe(expected);
    },
  );

  it("stores, dedupes and clears identically on both, keeping other keys", async () => {
    const httpId = await seedHttp();
    wireFetch(s.route);
    const { nativeFs, id } = await seedNative();
    const native = s.native({ fs: nativeFs, projectsDir: NATIVE_DIR });

    const setHttp = await s.http.setDefaults(httpId, [A, B, A]);
    const setNative = await native.setDefaults(id, [A, B, A]);
    expect(setHttp).toEqual({ excludedResourceIds: [A, B] });
    expect(setNative).toEqual(setHttp);

    const readHttp = JSON.parse(
      await fs.readFile(
        path.join(
          process.env.GETWRITE_PROJECTS_DIR ?? "",
          httpId,
          "project.json",
        ),
        "utf8",
      ),
    ) as { config: Record<string, unknown> };
    expect(readHttp.config[s.key]).toEqual({ excludedResourceIds: [A, B] });
    expect(readHttp.config.dailyWordGoal).toBe(500);

    const clearHttp = await s.http.setDefaults(httpId, null);
    const clearNative = await native.setDefaults(id, null);
    expect(clearHttp).toEqual({ excludedResourceIds: undefined });
    expect(clearNative).toEqual(clearHttp);
  });

  it("refuses an invalid project id with the same message on both", async () => {
    await seedHttp();
    wireFetch(s.route);
    const { nativeFs } = await seedNative();
    const native = s.native({ fs: nativeFs, projectsDir: NATIVE_DIR });
    const viaHttp = await message(s.http.setDefaults("not-a-uuid", [A]));
    const viaNative = await message(native.setDefaults("not-a-uuid", [A]));
    expect(viaHttp).toMatch(/Invalid projectId/);
    expect(viaNative).toMatch(/Invalid projectId/);
  });
});
