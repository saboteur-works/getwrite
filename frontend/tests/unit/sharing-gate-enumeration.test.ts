/**
 * Feature 75, Task 18 (FR-9, FR-10, FR-23, FR-26): the tree-walking enumeration
 * test. Every `route.ts` under `app/api` and every `page.tsx` under `app` is
 * found by walking the source tree (no hard-coded list), and `frontend/proxy.ts`
 * must refuse each one, for each HTTP method the route file exports, in each
 * unconfirmed credential case.
 *
 * Counts observed on 2026-10-09 when this test was written (worktree
 * integ/hns-13-21): 64 route files under app/api and 7 page files; by `grep`
 * of the exported handler names, GET 29, POST 42, PUT 8, PATCH 2, DELETE 2
 * files, i.e. 83 route/method pairs, plus 7 pages (GET) = 90 enumerated
 * entries. The floors below are deliberately lower than the observed values so
 * an empty or truncated walk fails while a new route does not.
 *
 * No test name, message or assertion prints a window secret or a credential.
 */
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isStaticAsset, runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import {
  DEVICE_COOKIE,
  WINDOW_HEADER,
} from "../../src/lib/sharing/classify-request";
import {
  CREDENTIALS_FILE_NAME,
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";

const FRONTEND = path.resolve(__dirname, "../..");
const APP_DIR = path.join(FRONTEND, "app");
const SECRET = "w".repeat(64);
const DUMMY = "dummy";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/** Floors for the walk; see the header comment for the observed values. */
const MIN_ROUTE_FILES = 50;
const MIN_PAGE_FILES = 5;
const MIN_ENTRIES = 80;

/**
 * The documented exceptions, by name. Adding one changes EXCEPTION_COUNT, which
 * the test checks, so loosening the gate is a visible diff.
 */
const ENUMERATED_EXCEPTIONS: readonly string[] = [
  "GET /pair",
  "POST /api/sharing/pair",
];
/** Not enumerated from the tree: build output the proxy forwards (Task 6). */
const STATIC_EXCEPTION = "/_next/static/";
const EXCEPTION_COUNT = 3;

interface Entry {
  kind: "route" | "page";
  file: string;
  url: string;
  method: string;
}

async function walk(dir: string, name: string): Promise<string[]> {
  const found: string[] = [];
  const children = await readdir(dir, { withFileTypes: true });
  for (const child of children) {
    const full = path.join(dir, child.name);
    if (child.isDirectory()) {
      found.push(...(await walk(full, name)));
    } else if (child.name === name) {
      found.push(full);
    }
  }
  return found.sort();
}

/** `(group)` folders vanish; `[x]` and `[...x]` become a fixed dummy segment. */
function toUrl(appDir: string, file: string): string {
  const segments = path
    .relative(appDir, path.dirname(file))
    .split(path.sep)
    .filter((s) => s !== "" && !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => (s.startsWith("[") && s.endsWith("]") ? DUMMY : s));
  return `/${segments.join("/")}`;
}

function exportedMethods(source: string): HttpMethod[] {
  const names = new Set<string>();
  const direct =
    /export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  for (const m of source.matchAll(direct)) names.add(m[1]);
  for (const list of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of list[1].split(",")) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? "";
      if ((HTTP_METHODS as readonly string[]).includes(name)) names.add(name);
    }
  }
  return HTTP_METHODS.filter((m) => names.has(m));
}

async function enumerate(
  appDir: string,
): Promise<{ routeFiles: string[]; pageFiles: string[]; entries: Entry[] }> {
  const routeFiles = await walk(path.join(appDir, "api"), "route.ts");
  const pageFiles = await walk(appDir, "page.tsx");
  const entries: Entry[] = [];
  for (const file of routeFiles) {
    const methods = exportedMethods(await readFile(file, "utf8"));
    for (const method of methods) {
      entries.push({ kind: "route", file, url: toUrl(appDir, file), method });
    }
  }
  for (const file of pageFiles) {
    entries.push({
      kind: "page",
      file,
      url: toUrl(appDir, file),
      method: "GET",
    });
  }
  return { routeFiles, pageFiles, entries };
}

/** Injected machine identity (Task 25): the requests use 10.0.0.5:3000 and loopback. */
const MACHINE: OwnMachine = {
  hostname: "test-machine",
  interfaces: {
    en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
  } as OwnMachine["interfaces"],
};

function proxy(request: NextRequest): Promise<NextResponse> {
  return runGate(request, process.env, MACHINE);
}

const label = (e: { method: string; url: string }): string =>
  `${e.method} ${e.url}`;
const isException = (e: Entry): boolean =>
  ENUMERATED_EXCEPTIONS.includes(label(e));

let dir: string;
let otherDir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gw-enum-"));
  otherDir = await mkdtemp(path.join(tmpdir(), "gw-enum-other-"));
  vi.stubEnv("GETWRITE_SHARING", "1");
  vi.stubEnv("GETWRITE_SHARING_DIR", dir);
  vi.stubEnv("GETWRITE_WINDOW_SECRET", SECRET);
  vi.stubEnv("PORT", "3000");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(otherDir, { recursive: true, force: true });
});

function makeRequest(
  entry: { url: string; method: string },
  options: { host?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const host = options.host ?? "10.0.0.5:3000";
  return new NextRequest(`http://${host}${entry.url}`, {
    method: entry.method,
    headers: { host, ...(options.headers ?? {}) },
  });
}

function isPassThrough(res: NextResponse): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

function isRefusal(res: NextResponse): boolean {
  if (isPassThrough(res)) return false;
  if (res.status === 401 || res.status === 403) return true;
  const location = res.headers.get("location");
  return (
    [302, 303, 307].includes(res.status) &&
    location !== null &&
    new URL(location).pathname === "/pair"
  );
}

interface CredentialCase {
  name: string;
  host?: string;
  /** Prepares the stores and returns the request headers for this case. */
  setup: () => Promise<Record<string, string>>;
}

async function pairInto(target: string): Promise<string> {
  const { token, device } = mintCredential("Device");
  await addDevice(target, device);
  return token;
}

const CASES: CredentialCase[] = [
  { name: "no credential", setup: async () => ({}) },
  {
    name: "malformed cookie",
    setup: async () => ({ cookie: `${DEVICE_COOKIE}=not%20a%20token` }),
  },
  {
    name: "unknown credential",
    setup: async () => {
      await pairInto(dir);
      const stranger = mintCredential("Stranger").token;
      return { cookie: `${DEVICE_COOKIE}=${stranger}` };
    },
  },
  {
    name: "credential valid for a different store directory",
    setup: async () => {
      await pairInto(dir);
      const token = await pairInto(otherDir);
      return { cookie: `${DEVICE_COOKIE}=${token}` };
    },
  },
  {
    name: "corrupt store",
    setup: async () => {
      const token = await pairInto(dir);
      await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{ not json");
      return { cookie: `${DEVICE_COOKIE}=${token}` };
    },
  },
  {
    name: "loopback, no secret",
    host: "127.0.0.1:3000",
    setup: async () => ({}),
  },
  {
    name: "loopback, no secret, forged X-Forwarded-For",
    host: "127.0.0.1:3000",
    setup: async () => ({ "x-forwarded-for": "127.0.0.1" }),
  },
];

describe("route and page enumeration", () => {
  it("finds routes, pages and handlers from the source tree", async () => {
    const { routeFiles, pageFiles, entries } = await enumerate(APP_DIR);
    expect(routeFiles.length).toBeGreaterThanOrEqual(MIN_ROUTE_FILES);
    expect(pageFiles.length).toBeGreaterThanOrEqual(MIN_PAGE_FILES);
    expect(entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
    // Every route file exports at least one recognised handler.
    for (const file of routeFiles) {
      expect(entries.some((e) => e.file === file)).toBe(true);
    }
  });

  it("converts route groups and dynamic segments to URLs", async () => {
    const { entries } = await enumerate(APP_DIR);
    const urls = new Set(entries.map((e) => e.url));
    expect(urls.has("/")).toBe(true);
    expect(urls.has(`/api/auth/${DUMMY}`)).toBe(true);
    expect(urls.has(`/api/resource/${DUMMY}`)).toBe(true);
    for (const url of urls) {
      expect(url).not.toMatch(/[()[\]]/);
    }
  });

  it("includes the pairing page and the pairing route", async () => {
    const { entries } = await enumerate(APP_DIR);
    const labels = entries.map(label);
    for (const name of ENUMERATED_EXCEPTIONS) expect(labels).toContain(name);
  });

  it("counts the documented exceptions", () => {
    expect(ENUMERATED_EXCEPTIONS.length + 1).toBe(EXCEPTION_COUNT);
    expect(STATIC_EXCEPTION).toBe("/_next/static/");
  });

  it("picks up a route added to a temp copy of the tree", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "gw-enum-tree-"));
    try {
      await mkdir(path.join(temp, "api", "widgets", "[widget-id]"), {
        recursive: true,
      });
      await writeFile(
        path.join(temp, "api", "widgets", "[widget-id]", "route.ts"),
        "export async function GET() {}\nexport const DELETE = () => {};\n",
      );
      await mkdir(path.join(temp, "(group)", "inner"), { recursive: true });
      await writeFile(
        path.join(temp, "(group)", "inner", "page.tsx"),
        "export default function P() { return null; }\n",
      );
      const { entries } = await enumerate(temp);
      expect(entries.map(label).sort()).toEqual([
        `DELETE /api/widgets/${DUMMY}`,
        `GET /api/widgets/${DUMMY}`,
        "GET /inner",
      ]);
      for (const entry of entries) {
        const res = await proxy(makeRequest(entry));
        expect(isRefusal(res)).toBe(true);
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("sharing on: every enumerated URL is refused when unconfirmed", () => {
  for (const credentialCase of CASES) {
    it(`refuses all enumerated URLs: ${credentialCase.name}`, async () => {
      const headers = await credentialCase.setup();
      const { entries } = await enumerate(APP_DIR);
      const wrong: string[] = [];
      let exceptionsSeen = 0;
      for (const entry of entries) {
        const res = await proxy(
          makeRequest(entry, { host: credentialCase.host, headers }),
        );
        if (isException(entry)) {
          exceptionsSeen += 1;
          // Reachable unless the store is corrupt (then it must refuse too).
          const isCorruptCase = credentialCase.name === "corrupt store";
          if (isPassThrough(res) === isCorruptCase) wrong.push(label(entry));
          continue;
        }
        if (!isRefusal(res)) wrong.push(label(entry));
      }
      expect(exceptionsSeen).toBe(ENUMERATED_EXCEPTIONS.length);
      expect(wrong).toEqual([]);
    });
  }

  for (const credentialCase of CASES) {
    it(`refuses every enumerated URL, the exceptions and static assets with the host refusal when the Host is foreign: ${credentialCase.name}`, async () => {
      const headers = await credentialCase.setup();
      const { entries } = await enumerate(APP_DIR);
      const wrong: string[] = [];
      const all = [
        ...entries,
        { url: "/_next/static/chunks/a.js", method: "GET" },
      ];
      for (const entry of all) {
        const res = await proxy(
          makeRequest(entry, {
            host: "evil.example:3000",
            headers: { ...headers, origin: "http://evil.example:3000" },
          }),
        );
        if (
          res.status !== 403 ||
          res.headers.get("x-getwrite-gate") !== "host-not-allowed"
        ) {
          wrong.push(`${entry.method} ${entry.url}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  it("forwards /_next/static without a credential (the static exception)", async () => {
    const res = await proxy(
      makeRequest({ url: "/_next/static/chunks/a.js", method: "GET" }),
    );
    expect(isPassThrough(res)).toBe(true);
  });

  const STATIC_DIR = path.join(FRONTEND, ".next/static");
  it.skipIf(!existsSync(STATIC_DIR))(
    existsSync(STATIC_DIR)
      ? "admits every real file in the build's static directory"
      : "SKIPPED: frontend/.next/static does not exist (run pnpm build first)",
    async () => {
      const files: string[] = [];
      const walkAll = async (dirPath: string): Promise<void> => {
        for (const child of await readdir(dirPath, { withFileTypes: true })) {
          const full = path.join(dirPath, child.name);
          if (child.isDirectory()) await walkAll(full);
          else files.push(full);
        }
      };
      await walkAll(STATIC_DIR);
      const refused = files
        .map(
          (f) =>
            `/_next/static/${path.relative(STATIC_DIR, f).split(path.sep).join("/")}`,
        )
        .filter((url) => !isStaticAsset(url));
      expect(
        refused,
        `${files.length} files checked, ${refused.length} refused`,
      ).toEqual([]);
      expect(files.length, "files checked").toBeGreaterThan(0);
    },
  );

  it("lets the window header through every enumerated URL", async () => {
    const { entries } = await enumerate(APP_DIR);
    for (const entry of entries) {
      const res = await proxy(
        makeRequest(entry, { headers: { [WINDOW_HEADER]: SECRET } }),
      );
      expect(isPassThrough(res)).toBe(true);
    }
  });
});

describe("bound beyond loopback, gate not on (FR-34): every enumerated URL is refused", () => {
  for (const credentialCase of CASES) {
    it(`refuses all enumerated URLs, the exceptions and static assets: ${credentialCase.name}`, async () => {
      vi.stubEnv("GETWRITE_BIND", "0.0.0.0");
      vi.stubEnv("GETWRITE_SHARING", "0");
      const headers = await credentialCase.setup();
      const { entries } = await enumerate(APP_DIR);
      const all = [
        ...entries,
        { url: "/_next/static/chunks/a.js", method: "GET" },
      ];
      const wrong: string[] = [];
      for (const entry of all) {
        const res = await proxy(
          makeRequest(entry, { host: credentialCase.host, headers }),
        );
        if (
          res.status !== 403 ||
          res.headers.get("x-getwrite-gate") !== "bind-without-gate"
        ) {
          wrong.push(`${entry.method} ${entry.url}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  it("still lets the window header through every enumerated URL", async () => {
    vi.stubEnv("GETWRITE_BIND", "0.0.0.0");
    vi.stubEnv("GETWRITE_SHARING", "0");
    const { entries } = await enumerate(APP_DIR);
    for (const entry of entries) {
      const res = await proxy(
        makeRequest(entry, { headers: { [WINDOW_HEADER]: SECRET } }),
      );
      expect(isPassThrough(res)).toBe(true);
    }
  });
});

describe("sharing off: every enumerated URL passes through (FR-23)", () => {
  it("forwards every entry", async () => {
    vi.stubEnv("GETWRITE_SHARING", "0");
    const { entries } = await enumerate(APP_DIR);
    for (const entry of entries) {
      const res = await proxy(makeRequest(entry));
      expect(isPassThrough(res)).toBe(true);
    }
  });
});

describe("/api/version-check makes no outbound call when refused (FR-10)", () => {
  it("refused: zero fetch calls; window header: reaches the handler", async () => {
    vi.stubEnv("GETWRITE_DESKTOP", "1");
    vi.stubEnv("GETWRITE_APP_VERSION", "0.0.1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 500 }));
    const { GET } = await import("../../app/api/version-check/route");
    const entry = { url: "/api/version-check", method: "GET" };

    const refused = await proxy(makeRequest(entry));
    expect(isRefusal(refused)).toBe(true);
    if (isPassThrough(refused)) await GET();
    expect(fetchSpy).not.toHaveBeenCalled();

    const allowed = await proxy(
      makeRequest(entry, { headers: { [WINDOW_HEADER]: SECRET } }),
    );
    expect(isPassThrough(allowed)).toBe(true);
    await GET();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
