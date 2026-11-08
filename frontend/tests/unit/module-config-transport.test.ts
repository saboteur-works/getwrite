/**
 * Feature 103 Task 8: lib/api/modules.ts (HTTP transport), its native
 * backend, the web-stub's export parity, and the web-bundle exclusion.
 * Native lock parity with the server is reasoned from the shared core, not run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  httpModulesTransport,
  setModuleEnabled,
} from "../../src/lib/api/modules";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as nativeBackend from "../../src/store/transport/native-modules-backend";
import * as webStub from "../../src/store/transport/native-modules-backend.web-stub";
import * as moduleCore from "../../src/lib/models/module-config-core";
import { MODULE_SWITCH_MESSAGES } from "../../src/lib/models/module-config-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const PID = "55555555-5555-4555-8555-555555555555";
const REQ = { projectId: PID, moduleId: "sources", enabled: false };

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("setModuleEnabled: HTTP", () => {
  it("PUTs the request and returns the stored map", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200, { modules: { sources: false } }));
    await expect(setModuleEnabled(REQ)).resolves.toEqual({
      modules: { sources: false },
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/modules");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(REQ);
  });

  it("keeps an unknown module id in the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { modules: { sources: true, future: false } }),
    );
    await expect(setModuleEnabled(REQ)).resolves.toEqual({
      modules: { sources: true, future: false },
    });
  });

  it("rejects with the server's message on a 400", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(400, { error: MODULE_SWITCH_MESSAGES.moduleId }),
    );
    await expect(setModuleEnabled(REQ)).rejects.toThrow(
      MODULE_SWITCH_MESSAGES.moduleId,
    );
  });

  it("rejects with a status fallback when the error body is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500 }),
    );
    await expect(setModuleEnabled(REQ)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(setModuleEnabled(REQ)).rejects.toThrow("offline");
  });

  it("turns HTTP 401 back into ProjectLockedError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "locked" }),
    );
    const err = await setModuleEnabled(REQ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProjectLockedError);
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("turns HTTP 409 back into MissingProjectKeyError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(409, { error: "no key" }),
    );
    const err = await setModuleEnabled(REQ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MissingProjectKeyError);
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("leaves a not-paired 401 as an ordinary failure, not a locked project", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(401, { error: "x" }, { "x-getwrite-gate": "not-paired" }),
    );
    const err = await setModuleEnabled(REQ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(false);
    expect(err).toBeInstanceOf(Error);
  });

  it("reports a malformed body without passing the body, and rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { modules: { sources: "SECRET-BODY-VALUE" } }),
    );
    await expect(setModuleEnabled(REQ)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe("modules.setModuleEnabled");
    expect(args).toHaveLength(2);
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });

  it("exposes the http transport object", () => {
    expect(typeof httpModulesTransport.setModuleEnabled).toBe("function");
  });
});

describe("native backend", () => {
  function nativeTransport() {
    return nativeBackend.createNativeModulesTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });
  }

  it("calls setModuleEnabledCore with the request object", async () => {
    const coreSpy = vi
      .spyOn(moduleCore, "setModuleEnabledCore")
      .mockResolvedValue({ modules: { sources: false } });
    await expect(nativeTransport().setModuleEnabled(REQ)).resolves.toEqual({
      modules: { sources: false },
    });
    expect(coreSpy).toHaveBeenCalledWith(REQ);
  });

  it("writes through the real core into the native project and keeps the rest", async () => {
    const fake = createFakeCapacitorFilesystem();
    const adapter = capacitorFsAdapter(fake);
    await adapter.mkdir(`/projects/${PID}`, { recursive: true });
    await adapter.writeFile(
      `/projects/${PID}/project.json`,
      JSON.stringify(
        { id: PID, name: "N", config: { statuses: ["a"] } },
        null,
        2,
      ),
      "utf8",
    );
    const transport = nativeBackend.createNativeModulesTransport({
      fs: fake,
      projectsDir: "/projects",
    });
    await expect(transport.setModuleEnabled(REQ)).resolves.toEqual({
      modules: { sources: false },
    });
    const saved = JSON.parse(
      String(await adapter.readFile(`/projects/${PID}/project.json`, "utf8")),
    ) as { config: Record<string, unknown> };
    expect(saved.config).toEqual({
      statuses: ["a"],
      modules: { sources: false },
    });
  });

  it("refuses with the same messages as the route (bad id, module id, unknown key)", async () => {
    const t = nativeTransport();
    await expect(
      t.setModuleEnabled({ ...REQ, projectId: "nope" }),
    ).rejects.toBeInstanceOf(moduleCore.InvalidProjectIdCoreError);
    await expect(
      t.setModuleEnabled({ ...REQ, moduleId: "../x" }),
    ).rejects.toThrow(MODULE_SWITCH_MESSAGES.moduleId);
    await expect(
      t.setModuleEnabled({ ...REQ, path: "/x" } as never),
    ).rejects.toThrow(MODULE_SWITCH_MESSAGES.unknownKey);
  });

  it("propagates a locked-access error from the core", async () => {
    vi.spyOn(moduleCore, "setModuleEnabledCore").mockRejectedValue(
      new ProjectLockedError(PID),
    );
    const err = await nativeTransport()
      .setModuleEnabled(REQ)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isLockedAccessError(err)).toBe(true);
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
  });

  it("throws if ever reached", () => {
    expect(() => webStub.createNativeModulesTransport()).toThrow(/web-stub/);
  });
});

describe("native-modules-backend web-bundle exclusion", () => {
  const frontendRoot = path.resolve(__dirname, "..", "..");
  const NATIVE = path.join(
    "src",
    "store",
    "transport",
    "native-modules-backend.ts",
  );
  const CLIENT = path.join("src", "lib", "api", "modules.ts");
  const STUB = path.join(
    "src",
    "store",
    "transport",
    "native-modules-backend.web-stub.ts",
  );

  function collect(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === "node_modules" || entry.name === ".next"
          ? []
          : collect(full);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("is referenced only from lib/api/modules.ts", () => {
    const re = /native-modules-backend(?!\.web-stub)["']/;
    const offenders = ["src", "app"]
      .flatMap((d) => collect(path.join(frontendRoot, d)))
      .map((f) => path.relative(frontendRoot, f))
      .filter((rel) => ![NATIVE, CLIENT, STUB].includes(rel))
      .filter((rel) =>
        re.test(fs.readFileSync(path.join(frontendRoot, rel), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("the client's thunk carries the literal specifier and next.config.mjs aliases it to the stub", () => {
    expect(fs.readFileSync(path.join(frontendRoot, CLIENT), "utf8")).toContain(
      'import("../../store/transport/native-modules-backend")',
    );
    const config = fs.readFileSync(
      path.join(frontendRoot, "next.config.mjs"),
      "utf8",
    );
    expect(config).toContain("resolveAlias");
    expect(config).toContain('"../../store/transport/native-modules-backend"');
    expect(config).toContain("native-modules-backend.web-stub");
  });

  it("the web-stub contains no reference to node:* built-ins", () => {
    const stub = fs.readFileSync(path.join(frontendRoot, STUB), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    expect(stub).not.toMatch(/require\(\s*["']node:/);
  });
});
