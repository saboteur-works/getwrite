#!/usr/bin/env node
/**
 * Feature 75, Task 18: refusal smoke test against a real built server.
 *
 * Builds nothing. Starts the standalone server (default
 * `.next/standalone/frontend/server.js` under `frontend/`, or the path in the
 * GETWRITE_SMOKE_SERVER environment variable or the first argument) on a free
 * loopback port with sharing on, then checks with `fetch` that every URL found
 * by walking `app/` is refused when unconfirmed. This script runs from
 * loopback, so its "no credential" case is the loopback-without-secret case.
 *
 * Never prints a pairing code, a window secret or a credential: output is
 * check labels, methods, paths and status numbers only.
 */
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const APP_DIR = path.join(FRONTEND, "app");
const DEFAULT_SERVER = path.join(
  FRONTEND,
  ".next/standalone/frontend/server.js",
);
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const DUMMY = "dummy";
const ENUMERATED_EXCEPTIONS = ["GET /pair", "POST /api/sharing/pair"];

const failures = [];
let checks = 0;

function check(name, ok) {
  checks += 1;
  if (!ok) failures.push(name);
}

async function walk(dir, name) {
  const found = [];
  for (const child of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, child.name);
    if (child.isDirectory()) found.push(...(await walk(full, name)));
    else if (child.name === name) found.push(full);
  }
  return found.sort();
}

function toUrl(file) {
  const segments = path
    .relative(APP_DIR, path.dirname(file))
    .split(path.sep)
    .filter((s) => s !== "" && !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => (s.startsWith("[") && s.endsWith("]") ? DUMMY : s));
  return `/${segments.join("/")}`;
}

function exportedMethods(source) {
  const names = new Set();
  const direct =
    /export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  for (const m of source.matchAll(direct)) names.add(m[1]);
  for (const list of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of list[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (HTTP_METHODS.includes(name)) names.add(name);
    }
  }
  return HTTP_METHODS.filter((m) => names.has(m));
}

async function enumerate() {
  const entries = [];
  for (const file of await walk(path.join(APP_DIR, "api"), "route.ts")) {
    for (const method of exportedMethods(await readFile(file, "utf8"))) {
      entries.push({ url: toUrl(file), method });
    }
  }
  for (const file of await walk(APP_DIR, "page.tsx")) {
    entries.push({ url: toUrl(file), method: "GET" });
  }
  return entries;
}

const label = (e) => `${e.method} ${e.url}`;
const isException = (e) => ENUMERATED_EXCEPTIONS.includes(label(e));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function isRefusal(res) {
  if (res.status === 401 || res.status === 403) return true;
  const location = res.headers.get("location");
  return (
    [302, 303, 307].includes(res.status) &&
    location !== null &&
    new URL(location, "http://x").pathname === "/pair"
  );
}

/** node:http, because a `Host` override through `fetch` is not assumed to work. */
function rawRequest(port, method, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method, path: pathname, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            gate: res.headers["x-getwrite-gate"],
            location: res.headers.location,
            setCookie: res.headers["set-cookie"],
            body,
          }),
        );
      },
    );
    req.once("error", reject);
    req.end(method === "POST" ? JSON.stringify({ code: "000000" }) : undefined);
  });
}

async function waitForServer(base, secret, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited before ready");
    try {
      const res = await fetch(`${base}/api/auth-status`, {
        headers: { "x-getwrite-window": secret },
      });
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become ready");
}

async function writePairingState(dir, code, overrides = {}) {
  const salt = randomBytes(16);
  const codeHash = createHmac("sha256", salt).update(code).digest("hex");
  const now = Date.now();
  await writeFile(
    path.join(dir, "pairing-state.json"),
    JSON.stringify({
      version: 1,
      salt: salt.toString("hex"),
      codeHash,
      expiresAt: now + 300000,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: now,
      ...overrides,
    }),
  );
}

function newCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

async function main() {
  const serverPath = path.resolve(
    process.argv[2] ?? process.env.GETWRITE_SMOKE_SERVER ?? DEFAULT_SERVER,
  );
  const entries = await enumerate();
  check("enumeration is non-empty", entries.length > 0);
  check(
    "enumeration includes the pairing page and route",
    ENUMERATED_EXCEPTIONS.every((n) => entries.map(label).includes(n)),
  );

  const dir = await mkdtemp(path.join(tmpdir(), "gw-smoke-"));
  const secret = randomBytes(32).toString("hex");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_SHARING_DIR: dir,
    },
    stdio: "ignore",
  });

  const send = (entry, headers = {}) =>
    fetch(`${base}${entry.url}`, {
      method: entry.method,
      redirect: "manual",
      headers: { origin: base, ...headers },
    });

  async function expectAllRefused(name, headers, includeExceptions) {
    const wrong = [];
    for (const entry of entries) {
      if (!includeExceptions && isException(entry)) continue;
      const res = await send(entry, headers);
      if (!isRefusal(res)) wrong.push(`${label(entry)} -> ${res.status}`);
    }
    check(
      `${name}: every enumerated URL refused (${wrong.join("; ")})`,
      wrong.length === 0,
    );
  }

  const pairBody = (code) => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ code }),
  });

  try {
    await waitForServer(base, secret, child);

    // Loopback with no secret is the script's own no-credential case.
    await expectAllRefused("loopback, no secret", {}, false);
    await expectAllRefused(
      "forged X-Forwarded-For",
      { "x-forwarded-for": "127.0.0.1" },
      false,
    );
    await expectAllRefused(
      "made-up cookie",
      { cookie: `getwrite_device=${randomBytes(32).toString("base64url")}` },
      false,
    );

    const statik = await fetch(`${base}/_next/static/none.js`, {
      redirect: "manual",
    });
    check("static path is not gated (not a refusal)", !isRefusal(statik));
    const pairPage = await fetch(`${base}/pair`, { redirect: "manual" });
    check("pairing page reachable unpaired", pairPage.status === 200);

    const window = await fetch(`${base}/api/auth-status`, {
      headers: { "x-getwrite-window": secret },
    });
    check("window header passes /api/auth-status", window.status === 200);
    const wrongWindow = await fetch(`${base}/api/auth-status`, {
      headers: { "x-getwrite-window": "x".repeat(64) },
    });
    check("wrong window header refused", isRefusal(wrongWindow));

    // FR-31: a forged Host/Origin naming a foreign host is refused for its Host,
    // on the exempt pairing paths too, and is never redirected to /pair.
    const foreignHost = `evil.example:${port}`;
    for (const [method, pathname] of [
      ["GET", "/pair"],
      ["POST", "/api/sharing/pair"],
      ["GET", "/api/auth-status"],
    ]) {
      const res = await rawRequest(port, method, pathname, {
        host: foreignHost,
        origin: `http://${foreignHost}`,
        "content-type": "application/json",
      });
      check(
        `foreign Host refused with host-not-allowed: ${method} ${pathname} (${res.status})`,
        res.status === 403 &&
          res.gate === "host-not-allowed" &&
          res.location === undefined &&
          res.setCookie === undefined &&
          res.body.includes("does not name the computer running GetWrite"),
      );
    }
    const wrongPortHost = await rawRequest(port, "GET", "/pair", {
      host: `127.0.0.1:${port + 1}`,
    });
    check(
      "own address on the wrong port refused with host-not-allowed",
      wrongPortHost.status === 403 && wrongPortHost.gate === "host-not-allowed",
    );
    const windowForeignHost = await rawRequest(
      port,
      "GET",
      "/api/auth-status",
      { host: foreignHost, "x-getwrite-window": secret },
    );
    check(
      "window header passes with any Host",
      windowForeignHost.status === 200,
    );

    // Pairing-code states written as fixtures: expired, over the attempt limit, used.
    let code = newCode();
    await writePairingState(dir, code, { expiresAt: Date.now() - 1000 });
    const expired = await fetch(`${base}/api/sharing/pair`, pairBody(code));
    check(
      "expired code refused",
      expired.status === 400 && !expired.headers.get("set-cookie"),
    );

    code = newCode();
    await writePairingState(dir, code, { attempts: 5, dead: true });
    const dead = await fetch(`${base}/api/sharing/pair`, pairBody(code));
    check(
      "over-limit code refused",
      dead.status === 400 && !dead.headers.get("set-cookie"),
    );

    code = newCode();
    await writePairingState(dir, code, { used: true });
    const used = await fetch(`${base}/api/sharing/pair`, pairBody(code));
    check(
      "used code refused",
      used.status === 400 && !used.headers.get("set-cookie"),
    );

    // A live code pairs once and yields a cookie.
    code = newCode();
    await writePairingState(dir, code);
    const paired = await fetch(`${base}/api/sharing/pair`, pairBody(code));
    const setCookie = paired.headers.get("set-cookie") ?? "";
    check(
      "live code pairs",
      paired.status === 200 && setCookie.startsWith("getwrite_device="),
    );
    const cookie = setCookie.split(";")[0];
    const again = await fetch(`${base}/api/sharing/pair`, pairBody(code));
    check("the same code cannot pair twice", again.status === 400);

    const authStatus = { url: "/api/auth-status", method: "GET" };
    const okGet = await send(authStatus, { cookie });
    check("paired cookie passes a GET", okGet.status === 200);
    const crossOrigin = await send(
      { url: "/api/project/rename", method: "POST" },
      { cookie, origin: "http://evil.example" },
    );
    check(
      "paired cookie fails a cross-origin POST",
      crossOrigin.status === 403,
    );

    // A corrupt store refuses everything that is not the window.
    await writeFile(path.join(dir, "device-credentials.json"), "{ not json");
    await expectAllRefused(
      "corrupt store with paired cookie",
      { cookie },
      true,
    );
    const windowCorrupt = await fetch(`${base}/api/auth-status`, {
      headers: { "x-getwrite-window": secret },
    });
    check(
      "window still passes with a corrupt store",
      windowCorrupt.status === 200,
    );
  } finally {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  }

  console.log(
    `enumerated entries: ${entries.length}; checks: ${checks}; failures: ${failures.length}`,
  );
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length > 0) process.exit(1);
  console.log("sharing refusal smoke: all checks passed");
}

main().catch((error) => {
  console.error(
    `smoke script error: ${error instanceof Error ? error.message : "unknown"}`,
  );
  process.exit(1);
});
