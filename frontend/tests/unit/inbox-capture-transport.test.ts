/**
 * Feature 106 Task 10 (FR-10, FR-9, FR-2): the capture client, native backend,
 * web-stub and web-bundle exclusion. The native path runs over an in-memory
 * fake Capacitor filesystem; nothing here is a device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-inbox-capture-backend";
import * as webStub from "../../src/store/transport/native-inbox-capture-backend.web-stub";
import * as captureCore from "../../src/lib/models/inbox-capture-core";
import {
  captureToInbox,
  httpInboxCaptureTransport,
} from "../../src/lib/api/inbox-capture";
import type {
  CaptureRequest,
  CaptureResult,
} from "../../src/lib/api/inbox-capture-types";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  isLockedAccessError,
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST: CaptureRequest = {
  projectId: PROJECT_ID,
  text: "a thought",
  link: "https://example.com",
  origin: "typed",
};
const CREATED: CaptureResult = {
  status: "created",
  resourceId: "22222222-2222-4222-8222-222222222222",
  inboxFolderId: "33333333-3333-4333-8333-333333333333",
  notices: [{ code: "seeding", severity: "info", message: "m" }],
};
const NEEDS: CaptureResult = {
  status: "needs-choice",
  state: "inbox-in-trash",
};
const REFUSED: CaptureResult = {
  status: "refused",
  notices: [{ code: "empty", severity: "error", message: "Nothing to save." }],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function response(
  body: unknown,
  init: {
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
  } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(init.headers),
    json: async () => body,
  } as Response;
}

describe("capture client, web", () => {
  it("POSTs the request to /api/project/capture and returns each typed result unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    for (const result of [CREATED, NEEDS, REFUSED]) {
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(response(result));
      await expect(captureToInbox(REQUEST)).resolves.toEqual(result);
      const [url, init] = spy.mock.calls[0];
      expect(url).toBe("/api/project/capture");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(REQUEST);
    }
  });

  it("carries the Inbox folder id on a created result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(CREATED));
    const result = await httpInboxCaptureTransport.capture(REQUEST);
    expect(result.status === "created" && result.inboxFolderId).toBe(
      CREATED.status === "created" && CREATED.inboxFolderId,
    );
  });

  it("turns a 401 and a 409 into locked-access errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response({ error: "locked" }, { ok: false, status: 401 }),
    );
    const locked = await captureToInbox(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );
    expect(locked).toBeInstanceOf(ProjectLockedError);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response({ error: "no key" }, { ok: false, status: 409 }),
    );
    const noKey = await captureToInbox(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );
    expect(noKey).toBeInstanceOf(MissingProjectKeyError);
  });

  it("leaves a not-paired 401 as an ordinary failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        { error: "Device not paired" },
        {
          ok: false,
          status: 401,
          headers: { "x-getwrite-gate": "not-paired" },
        },
      ),
    );
    const err = await captureToInbox(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(false);
    expect((err as Error).message).toBe("Device not paired");
  });

  it("rejects with the server message on a 400 and a status fallback when unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      response({ error: "text must be a string." }, { ok: false, status: 400 }),
    );
    await expect(captureToInbox(REQUEST)).rejects.toThrow(
      "text must be a string.",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(captureToInbox(REQUEST)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(captureToInbox(REQUEST)).rejects.toThrow("offline");
  });

  it("reports a malformed body without passing the body, and rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ status: "created", resourceId: "SECRET-BODY-VALUE" }),
    );
    await expect(captureToInbox(REQUEST)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe("inbox-capture.captureToInbox");
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });
});

describe("capture client, native", () => {
  async function stubBootstrap(): Promise<void> {
    const bootstrap = await import("../../src/lib/models/native-bootstrap");
    vi.spyOn(bootstrap, "ensureNativeStorageContext").mockResolvedValue(
      undefined as never,
    );
  }

  it("calls the in-process core, never fetch, and returns the result unchanged", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    await stubBootstrap();
    const core = vi
      .spyOn(captureCore, "captureToInboxCore")
      .mockResolvedValue(CREATED);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(captureToInbox(REQUEST)).resolves.toBe(CREATED);
    expect(core).toHaveBeenCalledWith(REQUEST);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not call fetch on web when native is off, and not the core", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    const core = vi.spyOn(captureCore, "captureToInboxCore");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(REFUSED));
    await captureToInbox(REQUEST);
    expect(core).not.toHaveBeenCalled();
  });
});

describe("native inbox capture backend", () => {
  const deps = () => ({
    fs: createFakeCapacitorFilesystem(),
    projectsDir: PROJECTS_DIR,
  });

  it("passes each typed core result through unchanged", async () => {
    for (const result of [CREATED, NEEDS, REFUSED]) {
      vi.spyOn(captureCore, "captureToInboxCore").mockResolvedValueOnce(result);
      await expect(
        nativeBackend
          .createNativeInboxCaptureTransport(deps())
          .capture(REQUEST),
      ).resolves.toBe(result);
    }
  });

  it("propagates a locked-access error unchanged", async () => {
    const locked = new ProjectLockedError(PROJECT_ID);
    vi.spyOn(captureCore, "captureToInboxCore").mockRejectedValue(locked);
    const err = await nativeBackend
      .createNativeInboxCaptureTransport(deps())
      .capture(REQUEST)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBe(locked);
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("creates the item in the in-memory device filesystem", async () => {
    const d = deps();
    const projectId = generateUUID();
    const adapter = capacitorFsAdapter(d.fs);
    const root = `${PROJECTS_DIR}/${projectId}`;
    await adapter.mkdir(`${root}/meta`, { recursive: true });
    await adapter.writeFile(
      `${root}/project.json`,
      JSON.stringify({
        id: projectId,
        name: "p",
        createdAt: "2026-01-01T00:00:00.000Z",
        config: {},
      }),
    );
    const result = await nativeBackend
      .createNativeInboxCaptureTransport(d)
      .capture({ projectId, text: "from native", origin: "typed" });
    expect(result.status).toBe("created");
  });

  it("establishes the storage context; a context-less core call fails closed", async () => {
    await expect(captureCore.captureToInboxCore(REQUEST)).rejects.toThrow();
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend and throws if reached", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeInboxCaptureTransport()).toThrow(
      /web-stub/,
    );
  });
});

describe("native-inbox-capture-backend web-bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const CLIENT = path.join("src", "lib", "api", "inbox-capture.ts");
  const STUB = path.join(
    "src",
    "store",
    "transport",
    "native-inbox-capture-backend.web-stub.ts",
  );

  it("the client carries the literal specifier and the raw runtime comparison goes through createTransport", () => {
    const src = fs.readFileSync(path.join(root, CLIENT), "utf8");
    expect(src).toContain(
      'import("../../store/transport/native-inbox-capture-backend")',
    );
    expect(src).toContain("createTransport(");
    expect(src).not.toContain("resolveRuntime");
  });

  it("the client composes no existing create, config or log call", () => {
    const src = fs.readFileSync(path.join(root, CLIENT), "utf8");
    for (const banned of [
      "lib/api/resources",
      "lib/api/projects",
      "lib/api/writing-log",
      "compile-defaults",
      "saved-defaults",
      "createResource",
      "appendWritingLog",
    ]) {
      expect(src).not.toContain(banned);
    }
  });

  it("is referenced only from lib/api/inbox-capture.ts", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          /native-inbox-capture-backend(?!\.web-stub)["']/.test(
            fs.readFileSync(full, "utf8"),
          )
        ) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "src"));
    walk(path.join(root, "app"));
    expect(hits).toEqual([CLIENT]);
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain(
      '"../../store/transport/native-inbox-capture-backend":\n            "./src/store/transport/native-inbox-capture-backend.web-stub"',
    );
  });

  it("the web-stub has no node:* reference and no imports beyond types", () => {
    const stub = fs.readFileSync(path.join(root, STUB), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    const values = stub
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(values).toEqual([]);
  });
});
