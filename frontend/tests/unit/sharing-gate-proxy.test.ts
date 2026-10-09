/**
 * Feature 75, Task 14: the root `proxy.ts` gate. Built from real `NextRequest`
 * objects against a temp-directory credential store. No test name, message or
 * assertion prints a window secret or a credential.
 */
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy as realProxy } from "../../proxy";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import {
  CLASSIFICATION_HEADER,
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  WINDOW_HEADER,
} from "../../src/lib/sharing/classify-request";
import {
  CREDENTIALS_FILE_NAME,
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";

const SECRET = "w".repeat(64);
const ORIGIN = "http://10.0.0.5:3000";
const FRONTEND = path.resolve(__dirname, "../..");

/** Injected machine identity (Task 25): the requests below use 10.0.0.5:3000. */
const MACHINE: OwnMachine = {
  hostname: "test-machine",
  interfaces: {
    en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
  } as OwnMachine["interfaces"],
};

function proxy(request: NextRequest): Promise<NextResponse> {
  return runGate(request, process.env, MACHINE);
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gw-gate-"));
  vi.stubEnv("GETWRITE_SHARING", "1");
  vi.stubEnv("GETWRITE_SHARING_DIR", dir);
  vi.stubEnv("GETWRITE_WINDOW_SECRET", SECRET);
  vi.stubEnv("PORT", "3000");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

function req(
  pathname: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`${ORIGIN}${pathname}`, {
    method: init.method ?? "GET",
    headers: { host: "10.0.0.5:3000", ...(init.headers ?? {}) },
  });
}

async function pairedToken(): Promise<string> {
  const { token, device } = mintCredential("Test device");
  await addDevice(dir, device);
  return token;
}

function isPassThrough(res: NextResponse): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

/** The value of the classification header the gate forwards to the route, or null. */
function forwarded(res: NextResponse): string | null {
  return res.headers.get(`x-middleware-request-${CLASSIFICATION_HEADER}`);
}

const API_PATHS = [
  "/api/projects",
  "/api/version-check",
  "/api/auth-status",
  "/api/auth/anything",
  "/api/encryption",
];
const PAGE_PATHS = [
  "/",
  "/login",
  "/preferences",
  "/project-types",
  "/reset-password",
  "/verify-email",
];

describe("sharing off", () => {
  it("passes every path through, without reading any store", async () => {
    vi.stubEnv("GETWRITE_SHARING", "0");
    vi.stubEnv("GETWRITE_SHARING_DIR", path.join(dir, "does-not-exist"));
    for (const p of [
      ...API_PATHS,
      ...PAGE_PATHS,
      "/pair",
      "/api/sharing/pair",
    ]) {
      const res = await proxy(req(p));
      expect(isPassThrough(res)).toBe(true);
      expect(forwarded(res)).toBe("off");
    }
  });

  it("passes when the sharing variable is unset", async () => {
    vi.stubEnv("GETWRITE_SHARING", "");
    const res = await proxy(req("/api/projects", { method: "POST" }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("replaces a client-sent classification header even when sharing is off", async () => {
    vi.stubEnv("GETWRITE_SHARING", "0");
    const res = await proxy(
      req("/api/projects", { headers: { [CLASSIFICATION_HEADER]: "window" } }),
    );
    expect(forwarded(res)).toBe("off");
  });
});

describe("sharing on, no credential", () => {
  it.each(API_PATHS)("refuses %s with a typed 401 JSON", async (p) => {
    for (const method of ["GET", "POST"]) {
      const res = await proxy(req(p, { method }));
      expect(res.status).toBe(401);
      expect(res.headers.get("x-getwrite-gate")).toBe("not-paired");
      expect(res.headers.get("content-type")).toContain("application/json");
      const body: unknown = await res.json();
      expect(body).toEqual({
        error: "not-paired",
        message:
          "This device is not paired. On your computer, open GetWrite, turn on sharing, and enter the code shown there.",
      });
    }
  });

  it("uses one fixed body for every refusal (nothing about a project)", async () => {
    const bodies = new Set<string>();
    for (const p of API_PATHS) {
      bodies.add(await (await proxy(req(p))).text());
    }
    expect(bodies.size).toBe(1);
  });

  it.each(PAGE_PATHS)("redirects page %s to /pair", async (p) => {
    const res = await proxy(req(`${p}?x=1`));
    expect([307, 303]).toContain(res.status);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/pair");
    expect(location.search).toBe("");
    expect(res.headers.get("x-getwrite-gate")).toBe("not-paired");
  });

  it("passes the pairing page and the code-entry POST", async () => {
    expect(isPassThrough(await proxy(req("/pair")))).toBe(true);
    const res = await proxy(req("/api/sharing/pair", { method: "POST" }));
    expect(isPassThrough(res)).toBe(true);
    expect(forwarded(res)).toBe("not-confirmed:no-credential");
  });

  it("refuses other methods on the pairing endpoint and sub-paths of it", async () => {
    expect((await proxy(req("/api/sharing/pair"))).status).toBe(401);
    expect(
      (await proxy(req("/api/sharing/pair", { method: "DELETE" }))).status,
    ).toBe(401);
    expect(
      (await proxy(req("/api/sharing/pair/extra", { method: "POST" }))).status,
    ).toBe(401);
    expect((await proxy(req("/api/sharing", { method: "POST" }))).status).toBe(
      401,
    );
  });

  it("passes /_next/static with no credential and refuses /_next/image and others", async () => {
    expect(isPassThrough(await proxy(req("/_next/static/chunks/x.js")))).toBe(
      true,
    );
    expect(
      (await proxy(req("/_next/image?url=%2Fa.png&w=64&q=75"))).status,
    ).toBe(307);
    expect((await proxy(req("/favicon.ico"))).status).toBe(307);
    expect((await proxy(req("/_next/data/x.json"))).status).toBe(307);
  });

  it("does not let a traversal-shaped path borrow the static allowance", async () => {
    const res = await proxy(req("/_next/static/%2e%2e/%2e%2e/api/projects"));
    expect(isPassThrough(res)).toBe(false);
    const res2 = await proxy(req("/_next/static/..%2fapi/projects"));
    expect(isPassThrough(res2)).toBe(false);
  });
});

describe("forged identity without the window secret", () => {
  it("refuses a forged X-Forwarded-For: 127.0.0.1", async () => {
    const res = await proxy(
      req("/api/projects", { headers: { "x-forwarded-for": "127.0.0.1" } }),
    );
    expect(res.status).toBe(401);
  });

  it("classifies a loopback request without the secret like any other client", async () => {
    const loopback = new NextRequest("http://127.0.0.1:3000/api/projects", {
      headers: { host: "127.0.0.1:3000" },
    });
    expect((await proxy(loopback)).status).toBe(401);
    const forgedLoopback = new NextRequest(
      "http://127.0.0.1:3000/api/projects",
      { headers: { host: "localhost:3000", "x-forwarded-for": "127.0.0.1" } },
    );
    expect((await proxy(forgedLoopback)).status).toBe(401);
    const page = new NextRequest("http://127.0.0.1:3000/", {
      headers: { host: "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1" },
    });
    expect(
      new URL((await proxy(page)).headers.get("location") ?? "").pathname,
    ).toBe("/pair");
  });

  it("refuses a wrong window secret", async () => {
    const res = await proxy(
      req("/api/projects", { headers: { [WINDOW_HEADER]: "x".repeat(64) } }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses everything when the window secret is not set in the env", async () => {
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "");
    const res = await proxy(
      req("/api/projects", { headers: { [WINDOW_HEADER]: SECRET } }),
    );
    expect(res.status).toBe(401);
  });
});

describe("window requests", () => {
  const win = { [WINDOW_HEADER]: SECRET };

  it("passes API and page requests, including state-changing ones without Origin", async () => {
    for (const p of [...API_PATHS, ...PAGE_PATHS]) {
      const res = await proxy(req(p, { headers: win }));
      expect(isPassThrough(res)).toBe(true);
      expect(forwarded(res)).toBe("window");
    }
    const post = await proxy(
      req("/api/projects", { method: "POST", headers: win }),
    );
    expect(isPassThrough(post)).toBe(true);
  });

  it("passes with a corrupt store (FR-27)", async () => {
    await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{ not json");
    const res = await proxy(req("/api/projects", { headers: win }));
    expect(isPassThrough(res)).toBe(true);
    expect(forwarded(res)).toBe("window");
  });
});

describe("confirmed device", () => {
  it("passes GET requests and forwards the confirmed classification", async () => {
    const token = await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    expect(isPassThrough(res)).toBe(true);
    expect(forwarded(res)).toMatch(/^confirmed:.+/);
  });

  it("passes a same-origin POST (Origin, or Referer when Origin is absent)", async () => {
    const token = await pairedToken();
    const cookie = `${DEVICE_COOKIE}=${token}`;
    const viaOrigin = await proxy(
      req("/api/projects", {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
      }),
    );
    expect(isPassThrough(viaOrigin)).toBe(true);
    const viaReferer = await proxy(
      req("/api/projects", {
        method: "POST",
        headers: { cookie, referer: `${ORIGIN}/` },
      }),
    );
    expect(isPassThrough(viaReferer)).toBe(true);
  });

  it("answers 403 for a cross-origin POST and for a POST with neither Origin nor Referer", async () => {
    const token = await pairedToken();
    const cookie = `${DEVICE_COOKIE}=${token}`;
    const cross = await proxy(
      req("/api/projects", {
        method: "POST",
        headers: { cookie, origin: "http://evil.example" },
      }),
    );
    expect(cross.status).toBe(403);
    expect(cross.headers.get("x-getwrite-gate")).toBe("cross-origin");
    const none = await proxy(
      req("/api/projects", { method: "POST", headers: { cookie } }),
    );
    expect(none.status).toBe(403);
    const forgedForwardedHost = await proxy(
      req("/api/projects", {
        method: "DELETE",
        headers: {
          cookie,
          origin: "http://other.example",
          "x-forwarded-host": "other.example",
        },
      }),
    );
    expect(forgedForwardedHost.status).toBe(403);
  });

  it("refuses an unknown credential like no credential", async () => {
    await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${"A".repeat(43)}` },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("corrupt store", () => {
  beforeEach(async () => {
    await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{ not json");
  });

  it("refuses every non-window request, including the pairing POST and the pairing page", async () => {
    for (const p of API_PATHS) {
      expect((await proxy(req(p))).status).toBe(401);
    }
    const pairPost = await proxy(req("/api/sharing/pair", { method: "POST" }));
    expect(pairPost.status).toBe(401);
    expect(isPassThrough(pairPost)).toBe(false);
    const pairPage = await proxy(req("/pair"));
    expect(pairPage.status).toBe(401);
  });

  it("still redirects other pages to /pair and still passes static assets", async () => {
    expect(
      new URL((await proxy(req("/"))).headers.get("location") ?? "").pathname,
    ).toBe("/pair");
    expect(isPassThrough(await proxy(req("/_next/static/a.js")))).toBe(true);
  });

  it("refuses when the sharing directory is not configured", async () => {
    vi.stubEnv("GETWRITE_SHARING_DIR", "");
    expect((await proxy(req("/api/projects"))).status).toBe(401);
    expect(
      (await proxy(req("/api/sharing/pair", { method: "POST" }))).status,
    ).toBe(401);
  });
});

describe("forwarded classification header", () => {
  const forgeries = ["confirmed:forged-device", "window", "off"];

  it.each(forgeries)(
    "ignores and replaces a client-sent %s on every pass-through",
    async (forged) => {
      const token = await pairedToken();
      const cases: Array<{
        p: string;
        method?: string;
        headers: Record<string, string>;
        expected: RegExp;
      }> = [
        { p: "/pair", headers: {}, expected: /^not-confirmed:no-credential$/ },
        {
          p: "/api/sharing/pair",
          method: "POST",
          headers: {},
          expected: /^not-confirmed:no-credential$/,
        },
        {
          p: "/_next/static/a.js",
          headers: {},
          expected: /^not-confirmed:no-credential$/,
        },
        {
          p: "/api/projects",
          headers: { [WINDOW_HEADER]: SECRET },
          expected: /^window$/,
        },
        {
          p: "/api/projects",
          headers: { cookie: `${DEVICE_COOKIE}=${token}` },
          expected: /^confirmed:(?!forged-device$).+/,
        },
      ];
      for (const c of cases) {
        const res = await proxy(
          req(c.p, {
            method: c.method,
            headers: {
              ...c.headers,
              [CLASSIFICATION_HEADER]: forged,
              origin: ORIGIN,
            },
          }),
        );
        expect(isPassThrough(res)).toBe(true);
        expect(forwarded(res)).toMatch(c.expected);
        const overridden =
          res.headers.get("x-middleware-override-headers") ?? "";
        expect(overridden.split(",")).toContain(CLASSIFICATION_HEADER);
      }
    },
  );

  it("does not let a forged classification turn a refusal into a pass", async () => {
    const res = await proxy(
      req("/api/projects", {
        headers: { [CLASSIFICATION_HEADER]: "confirmed:x" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("shared module state and import hygiene", () => {
  async function walk(root: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(root)) {
      const full = path.join(root, entry);
      const info = await stat(full);
      if (info.isDirectory()) out.push(...(await walk(full)));
      else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("imports src/lib/sharing from app/ only in the pairing route", async () => {
    const files = await walk(path.join(FRONTEND, "app"));
    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      if (/from\s+["'][^"']*lib\/sharing\//.test(text)) {
        offenders.push(path.relative(FRONTEND, file));
      }
    }
    const allowed = new Set(["app/api/sharing/pair/route.ts"]);
    expect(offenders.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it("reads GETWRITE_SHARING only in sharing-env.ts", async () => {
    const roots = ["app", "src", "components"].map((r) =>
      path.join(FRONTEND, r),
    );
    const files = [
      path.join(FRONTEND, "proxy.ts"),
      ...(await Promise.all(roots.map(walk))).flat(),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join("sharing", "sharing-env.ts"))) continue;
      const text = await readFile(file, "utf8");
      if (
        /process\.env\.GETWRITE_SHARING\b(?!_)|["']GETWRITE_SHARING["']/.test(
          text,
        )
      ) {
        offenders.push(path.relative(FRONTEND, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("proxy.ts and the gate hold no module-level mutable state and import no route module", async () => {
    for (const rel of ["proxy.ts", "src/lib/sharing/gate.ts"]) {
      const text = await readFile(path.join(FRONTEND, rel), "utf8");
      expect(text).not.toMatch(/^(let|var)\s/m);
      expect(text).not.toMatch(/from\s+["'][^"']*app\/api\//);
      expect(text).not.toMatch(/globalThis|process\.env\.[A-Z_]+\s*=/);
    }
  });
});

describe("Host allowlist (FR-31)", () => {
  const REFUSED_HOST = "host-not-allowed";
  const foreign = (
    pathname: string,
    method = "GET",
    extra: Record<string, string> = {},
  ): NextRequest =>
    new NextRequest(`http://evil.example:3000${pathname}`, {
      method,
      headers: {
        host: "evil.example:3000",
        origin: "http://evil.example:3000",
        ...extra,
      },
    });

  it.each([
    ["GET", "/pair"],
    ["POST", "/api/sharing/pair"],
    ["GET", "/api/projects"],
    ["GET", "/_next/static/x"],
  ])(
    "refuses the rebinding shape on %s %s with a text message, no redirect",
    async (method, p) => {
      const res = await proxy(foreign(p, method));
      expect(res.status).toBe(403);
      expect(res.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toContain(
        "This address does not name the computer running GetWrite. Open the address shown in the GetWrite window on that computer.",
      );
    },
  );

  it("refuses a paired cookie sent with a foreign Host", async () => {
    const token = await pairedToken();
    const res = await proxy(
      foreign("/api/projects", "GET", { cookie: `${DEVICE_COOKIE}=${token}` }),
    );
    expect(res.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
  });

  it.each([
    "10.0.0.5:3000",
    "localhost:3000",
    "127.0.0.1:3000",
    "LOCALHOST:3000",
    "test-machine.local:3000",
  ])(
    "an allowed Host %s reaches the pairing exception and the credential refusal",
    async (host) => {
      const page = await proxy(req("/pair", { headers: { host } }));
      expect(isPassThrough(page)).toBe(true);
      const post = await proxy(
        req("/api/sharing/pair", { method: "POST", headers: { host } }),
      );
      expect(isPassThrough(post)).toBe(true);
      const api = await proxy(req("/api/projects", { headers: { host } }));
      expect(api.status).toBe(401);
      expect(api.headers.get("x-getwrite-gate")).toBe("not-paired");
      expect(
        isPassThrough(
          await proxy(req("/_next/static/x", { headers: { host } })),
        ),
      ).toBe(true);
    },
  );

  it("refuses the wrong port and a missing port", async () => {
    for (const host of ["10.0.0.5:3001", "10.0.0.5", "[::1]:3000"]) {
      const res = await proxy(req("/pair", { headers: { host } }));
      expect(res.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
    }
  });

  it("refuses everything for a non-window request when PORT is missing or not numeric", async () => {
    for (const value of ["", "abc", "3000x", "0"]) {
      vi.stubEnv("PORT", value);
      const res = await proxy(req("/pair"));
      expect(res.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
    }
  });

  it("does not subject a window request to the allowlist, whatever Host it sends", async () => {
    const res = await proxy(
      new NextRequest("http://anything.example:9/api/projects", {
        headers: { host: "anything.example:9", [WINDOW_HEADER]: SECRET },
      }),
    );
    expect(isPassThrough(res)).toBe(true);
    expect(forwarded(res)).toBe("window");
  });

  it("does nothing with sharing off", async () => {
    vi.stubEnv("GETWRITE_SHARING", "0");
    const res = await proxy(foreign("/api/projects"));
    expect(isPassThrough(res)).toBe(true);
    expect(forwarded(res)).toBe("off");
  });

  it("follows a changed interface list with no restart", async () => {
    const moved: OwnMachine = {
      hostname: "test-machine",
      interfaces: {
        en0: [{ address: "10.0.0.9", family: "IPv4", internal: false }],
      } as OwnMachine["interfaces"],
    };
    const request = (): NextRequest =>
      req("/pair", { headers: { host: "10.0.0.9:3000" } });
    const before = await runGate(request(), process.env, MACHINE);
    const after = await runGate(request(), process.env, moved);
    expect(before.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
    expect(isPassThrough(after)).toBe(true);
  });

  it("the exported proxy reads the real machine when none is injected", async () => {
    const res = await realProxy(foreign("/pair"));
    expect(res.headers.get("x-getwrite-gate")).toBe(REFUSED_HOST);
  });
});

describe("Device cookie renewal (FR-33)", () => {
  const setCookies = (res: NextResponse): string[] =>
    res.headers.getSetCookie();
  const deviceCookies = (res: NextResponse): string[] =>
    setCookies(res).filter((c) => c.startsWith(`${DEVICE_COOKIE}=`));

  function expectRenewed(res: NextResponse, token: string): void {
    const cookies = deviceCookies(res);
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0];
    expect(cookie.startsWith(`${DEVICE_COOKIE}=${token};`)).toBe(true);
    expect(cookie).toContain(`Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toMatch(/Secure/i);
  }

  it("uses the working lifetime of 365 days", () => {
    expect(DEVICE_COOKIE_MAX_AGE_SECONDS).toBe(31536000);
  });

  it("renews the presented token on a confirmed GET", async () => {
    const token = await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    expect(isPassThrough(res)).toBe(true);
    expectRenewed(res, token);
  });

  it("renews the presented token on a confirmed same-origin POST", async () => {
    const token = await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        method: "POST",
        headers: { cookie: `${DEVICE_COOKIE}=${token}`, origin: ORIGIN },
      }),
    );
    expect(isPassThrough(res)).toBe(true);
    expectRenewed(res, token);
  });

  it("renews the presented token, not a new one: the renewed value still confirms", async () => {
    const token = await pairedToken();
    const first = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    const renewed = /getwrite_device=([^;]+)/.exec(
      deviceCookies(first)[0],
    )?.[1];
    expect(renewed).toBe(token);
    const second = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${renewed}` },
      }),
    );
    expect(forwarded(second)).toMatch(/^confirmed:.+/);
  });

  it("puts the token in no header other than Set-Cookie and in no body", async () => {
    const token = await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    for (const [name, value] of res.headers.entries()) {
      // `x-middleware-request-*` is Next's internal forwarded-request override
      // (the request's own cookie), consumed by the server, not sent to the client.
      // `x-middleware-set-cookie` is Next's internal copy of the same Set-Cookie.
      if (name.toLowerCase() === "set-cookie") continue;
      if (name.toLowerCase() === "x-middleware-set-cookie") continue;
      if (name.toLowerCase().startsWith("x-middleware-request-")) continue;
      expect(value).not.toContain(token);
    }
    expect(await res.text()).not.toContain(token);
  });

  it("sets no device cookie for a window request or with sharing off", async () => {
    const win = await proxy(
      req("/api/projects", { headers: { [WINDOW_HEADER]: SECRET } }),
    );
    expect(deviceCookies(win)).toHaveLength(0);
    vi.stubEnv("GETWRITE_SHARING", "0");
    const token = await pairedToken();
    const off = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    expect(deviceCookies(off)).toHaveLength(0);
  });

  it("sets no device cookie for unconfirmed requests, including the static allowance", async () => {
    const unknown = `${DEVICE_COOKIE}=${"A".repeat(43)}`;
    for (const p of ["/api/projects", "/pair", "/_next/static/x"]) {
      const res = await proxy(req(p, { headers: { cookie: unknown } }));
      expect(deviceCookies(res)).toHaveLength(0);
      const none = await proxy(req(p));
      expect(deviceCookies(none)).toHaveLength(0);
    }
  });

  it("sets no device cookie on a confirmed cross-origin 403", async () => {
    const token = await pairedToken();
    const res = await proxy(
      req("/api/projects", {
        method: "POST",
        headers: {
          cookie: `${DEVICE_COOKIE}=${token}`,
          origin: "http://evil.example",
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(deviceCookies(res)).toHaveLength(0);
  });

  it("sets no device cookie on a request refused for its Host", async () => {
    const token = await pairedToken();
    const res = await proxy(
      new NextRequest("http://evil.example:3000/api/projects", {
        headers: {
          host: "evil.example:3000",
          cookie: `${DEVICE_COOKIE}=${token}`,
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(deviceCookies(res)).toHaveLength(0);
  });

  it("sets no device cookie on the bind-without-gate refusal (store corrupt)", async () => {
    const token = await pairedToken();
    await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{ not json");
    const res = await proxy(
      req("/api/projects", {
        headers: { cookie: `${DEVICE_COOKIE}=${token}` },
      }),
    );
    expect(res.status).toBe(401);
    expect(deviceCookies(res)).toHaveLength(0);
  });
});

describe("bound beyond loopback without the gate on (FR-34)", () => {
  const BIND_VALUES_NOT_ON = [undefined, "0", "true", "yes", ""] as const;

  function stubBind(sharing: string | undefined, bind = "0.0.0.0"): void {
    vi.stubEnv("GETWRITE_BIND", bind);
    if (sharing === undefined) delete process.env.GETWRITE_SHARING;
    else vi.stubEnv("GETWRITE_SHARING", sharing);
  }

  async function expectBindRefusal(res: NextResponse): Promise<void> {
    expect(res.status).toBe(403);
    expect(res.headers.get("x-getwrite-gate")).toBe("bind-without-gate");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toContain("application/json");
  }

  it.each(BIND_VALUES_NOT_ON)(
    "with GETWRITE_SHARING=%j refuses every request but the window's",
    async (sharing) => {
      stubBind(sharing);
      const token = await pairedToken();
      const cases: NextRequest[] = [
        req("/api/projects"),
        req("/"),
        req("/api/projects", {
          headers: { cookie: `${DEVICE_COOKIE}=${token}` },
        }),
        req("/pair"),
        req("/api/sharing/pair", { method: "POST" }),
        req("/_next/static/x"),
      ];
      for (const request of cases) {
        await expectBindRefusal(await proxy(request));
      }
    },
  );

  it.each(BIND_VALUES_NOT_ON)(
    "with GETWRITE_SHARING=%j passes a request with the correct window secret",
    async (sharing) => {
      stubBind(sharing);
      const res = await proxy(
        req("/api/projects", { headers: { [WINDOW_HEADER]: SECRET } }),
      );
      expect(isPassThrough(res)).toBe(true);
      expect(forwarded(res)).toBe("window");
    },
  );

  it("refuses a wrong window secret", async () => {
    stubBind("0");
    await expectBindRefusal(
      await proxy(req("/", { headers: { [WINDOW_HEADER]: "x".repeat(64) } })),
    );
  });

  it("refuses everything when no window secret is configured", async () => {
    stubBind("0");
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "");
    await expectBindRefusal(
      await proxy(req("/", { headers: { [WINDOW_HEADER]: "" } })),
    );
  });

  it("treats a present but empty GETWRITE_BIND as beyond loopback", async () => {
    stubBind("0", "");
    await expectBindRefusal(await proxy(req("/api/projects")));
  });

  it.each(["127.0.0.1", "localhost", "::1"])(
    "GETWRITE_BIND=%s with sharing off passes everything",
    async (bind) => {
      stubBind("0", bind);
      for (const p of ["/api/projects", "/", "/pair", "/_next/static/x"]) {
        const res = await proxy(req(p));
        expect(isPassThrough(res)).toBe(true);
        expect(forwarded(res)).toBe("off");
      }
    },
  );

  it("unset GETWRITE_BIND with sharing off passes everything", async () => {
    delete process.env.GETWRITE_BIND;
    vi.stubEnv("GETWRITE_SHARING", "0");
    expect(isPassThrough(await proxy(req("/api/projects")))).toBe(true);
  });

  it("with sharing on (GETWRITE_SHARING=1) a non-loopback bind uses the normal gate", async () => {
    stubBind("1");
    const res = await proxy(req("/api/projects"));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-getwrite-gate")).toBe("not-paired");
    const win = await proxy(
      req("/api/projects", { headers: { [WINDOW_HEADER]: SECRET } }),
    );
    expect(isPassThrough(win)).toBe(true);
  });

  it("refuses without consulting the Host allowlist or PORT", async () => {
    stubBind("0");
    vi.stubEnv("PORT", "");
    await expectBindRefusal(await proxy(req("/")));
  });
});
