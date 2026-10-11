#!/usr/bin/env node
/**
 * Feature 80, Task 15: checks against the BUILT standalone server on the
 * desktop app's port (7340).
 *
 * Starts `frontend/.next/standalone/frontend/server.js` (must already be built,
 * with `.next/static` copied in) four times, one after another, each with
 * PORT=7340 and the env the app would build (mirrors
 * electron/src/sharing/sharing-mode.ts `buildServerBindEnv`):
 *   sharing ON  (HOSTNAME=0.0.0.0, GETWRITE_BIND=0.0.0.0, GETWRITE_SHARING=1)
 *   sharing OFF (HOSTNAME=127.0.0.1, GETWRITE_BIND=127.0.0.1, GETWRITE_SHARING=0)
 * each with and without GETWRITE_READINESS_KEY. Throwaway sharing dir and
 * projects folder under a fresh mkdtemp directory (removed at the end).
 *
 * Reports status numbers, gate-header presence/value (the value is a fixed
 * label such as "host-not-allowed", not a secret), content types and body
 * SHAPES. Window secret, readiness key, challenge proofs are held in memory;
 * comparisons are done in the script and only equal / not-equal is printed.
 *
 * Safety: refuses to run if anything listens on 7340 or 3000 (checked with
 * lsof; nothing is bound on 3000). Stops only the pid it started, after
 * confirming its command name is unchanged, then confirms 7340 is free.
 * Requests with a LAN-address Host are sent from this host to its own LAN
 * address: NOT a second-device result.
 *
 * Run OUTSIDE the command sandbox.   node built-server-check.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7340;
const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), "../../../..");
const SERVER = path.join(
  REPO,
  "frontend/.next/standalone/frontend/server.js",
);

let failures = 0;
const log = (s = "") => console.log(s);
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  log(`  [${ok ? "ok  " : "FAIL"}] ${label}${detail ? " -- " + detail : ""}`);
}

function listeners(port) {
  try {
    return execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
}

function lanIp() {
  for (const infos of Object.values(networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return undefined;
}

/** One HTTP request to connectHost:PORT with an explicit Host header. */
function send({ connectHost = "127.0.0.1", host, method = "GET", p, headers = {} }) {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        host: connectHost,
        port: PORT,
        method,
        path: p,
        agent: false,
        timeout: 8000,
        headers: { ...(host === undefined ? {} : { host }), ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            gate: res.headers["x-getwrite-gate"],
            type: res.headers["content-type"],
            location: res.headers["location"],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ status: 0, error: e.code ?? e.message, body: "" }));
    req.end();
  });
}

function shape(body) {
  try {
    const j = JSON.parse(body);
    return "json{" + Object.keys(j).sort().join(",") + "}";
  } catch {
    return `text(${body.length} bytes)`;
  }
}
const desc = (r) =>
  r.status === 0
    ? `no response (${r.error})`
    : `${r.status}, x-getwrite-gate ${r.gate === undefined ? "absent" : `"${r.gate}"`}, ${(r.type ?? "no content-type").split(";")[0]}, ${shape(r.body)}`;

function comm(pid) {
  try {
    return execFileSync("ps", ["-o", "comm=", "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function startServer({ sharingOn, withKey, dirs, secrets }) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: sharingOn ? "0.0.0.0" : "127.0.0.1",
    GETWRITE_BIND: sharingOn ? "0.0.0.0" : "127.0.0.1",
    GETWRITE_SHARING: sharingOn ? "1" : "0",
    GETWRITE_SHARING_DIR: dirs.sharing,
    GETWRITE_PROJECTS_DIR: dirs.projects,
    GETWRITE_WINDOW_SECRET: secrets.window,
  };
  if (withKey) env.GETWRITE_READINESS_KEY = secrets.key;
  const child = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env,
    stdio: "ignore",
  });
  const rec = { pid: child.pid, comm: comm(child.pid), exited: false };
  child.on("exit", () => (rec.exited = true));
  // Wait until THIS pid is the listener on PORT, then until it answers (any
  // status) on loopback with an allowed Host. A listener owned by another pid
  // is never probed (an earlier run of this script answered from a leftover).
  for (let i = 0; i < 80; i += 1) {
    if (rec.exited) throw new Error("server exited during start");
    if (!listeners(PORT).includes(String(rec.pid))) {
      await new Promise((r2) => setTimeout(r2, 250));
      continue;
    }
    const r = await send({ host: `127.0.0.1:${PORT}`, p: "/pair" });
    if (r.status !== 0) return rec;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  throw new Error("server did not answer within 20s");
}

async function stopServer(rec) {
  if (rec.exited) return log(`  pid ${rec.pid} had already exited`);
  const now = comm(rec.pid);
  // Next retitles its process ("next-server (v...)"); the pid is the one this
  // script spawned and it must still be the listener on PORT.
  const same = now === rec.comm || now.startsWith("next-server");
  if (now === "" || !same || !listeners(PORT).includes(String(rec.pid))) {
    return log(`  pid ${rec.pid} NOT signalled: command name changed or gone ("${rec.comm}" -> "${now}")`);
  }
  process.kill(rec.pid, "SIGTERM");
  for (let i = 0; i < 40 && comm(rec.pid) !== ""; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const gone = comm(rec.pid) === "";
  const free = listeners(PORT).length === 0;
  check(`pid ${rec.pid} stopped by pid (SIGTERM); ${PORT} free afterwards`, gone && free);
}

const hex64 = () => randomBytes(32).toString("hex");
const expectedProof = (key, ch) =>
  createHmac("sha256", key).update("getwrite-ready/1\n" + ch).digest("hex");

async function hostAllowlist(lan) {
  log("Host allowlist (sharing ON, bound 0.0.0.0, PORT=7340). Requests from this host; the LAN-address ones go to this machine's own LAN address: NOT a second-device result.");
  const accepted = [`${lan}:${PORT}`, `localhost:${PORT}`, `127.0.0.1:${PORT}`];
  const refused = [
    `${lan}:3000`, `localhost:3000`, `127.0.0.1:3000`,
    `${lan}:7341`, `localhost:7341`, `localhost:8080`, `${lan}:80`,
    `${lan}`, `localhost`, `evil.example:${PORT}`,
  ];
  for (const h of accepted) {
    const conn = h.startsWith(lan) ? lan : "127.0.0.1";
    for (const p of ["/pair", "/api/projects"]) {
      const r = await send({ connectHost: conn, host: h, p });
      const notHostRefusal = r.gate !== "host-not-allowed" && r.status !== 403;
      log(`  Host ${h} GET ${p}: ${desc(r)}`);
      check(`Host ${h} ${p} passes the Host allowlist`, notHostRefusal);
    }
  }
  for (const h of refused) {
    const conn = h.startsWith(lan) ? lan : "127.0.0.1";
    const r = await send({ connectHost: conn, host: h, p: "/pair" });
    log(`  Host ${h} GET /pair: ${desc(r)}`);
    check(
      `Host ${h} refused with plain-text 403`,
      r.status === 403 && r.gate === "host-not-allowed" && (r.type ?? "").startsWith("text/plain") && !r.location,
    );
  }
}

async function unpairedElsewhere() {
  log("Unpaired client, sharing ON, allowed Host, everything except the exceptions");
  const host = `127.0.0.1:${PORT}`;
  const cases = [
    ["GET", "/api/projects", 401],
    ["POST", "/api/projects", 401],
    ["GET", "/api/sharing/pair", 401],
    ["GET", "/api/sharing/limits", 401],
    ["POST", "/api/sharing/ready", 401],
    ["GET", "/api/sharing/ready/extra", 401],
    ["GET", "/api/sharing/ready.json", 401],
    ["GET", "/", 307],
    ["GET", "/_next/static/../../package.json", null],
  ];
  for (const [method, p, want] of cases) {
    const r = await send({ host, method, p });
    log(`  ${method} ${p}: ${desc(r)}${r.location ? ", redirect target path " + new URL(r.location, "http://x").pathname : ""}`);
    if (want !== null) {
      check(`${method} ${p} is ${want} with x-getwrite-gate "not-paired"`, r.status === want && r.gate === "not-paired");
    }
  }
}

async function readyChecks({ sharingOn, withKey, secrets }) {
  const label = `sharing ${sharingOn ? "ON" : "OFF"}, readiness key ${withKey ? "SET" : "NOT set"}`;
  log(`GET /api/sharing/ready behaviour -- ${label}`);
  const host = `127.0.0.1:${PORT}`;
  const valid = hex64();
  const variants = [
    ["no challenge", "/api/sharing/ready"],
    ["empty challenge", "/api/sharing/ready?challenge="],
    ["malformed (3 chars)", "/api/sharing/ready?challenge=abc"],
    ["malformed (63 hex)", `/api/sharing/ready?challenge=${valid.slice(1)}`],
    ["malformed (65 hex)", `/api/sharing/ready?challenge=${valid}a`],
    ["malformed (uppercase hex)", `/api/sharing/ready?challenge=${valid.toUpperCase()}`],
    ["malformed (64 non-hex)", `/api/sharing/ready?challenge=${"g".repeat(64)}`],
    ["valid 64-hex", `/api/sharing/ready?challenge=${valid}`],
  ];
  const results = new Map();
  for (const [name, p] of variants) {
    const r = await send({ host, p });
    results.set(name, r);
    log(`  ${name}: ${desc(r)}`);
  }
  const v = results.get("valid 64-hex");
  if (withKey) {
    let proofOk = false;
    try {
      proofOk = JSON.parse(v.body).proof === expectedProof(secrets.key, valid) && Object.keys(JSON.parse(v.body)).length === 1;
    } catch { /* stays false */ }
    check("valid challenge: 200 with a body of exactly one field whose value equals the in-script HMAC (equal; values not printed)", v.status === 200 && proofOk);
    check("no challenge / malformed: 400 invalid-challenge", ["no challenge", "empty challenge", "malformed (3 chars)", "malformed (63 hex)", "malformed (65 hex)", "malformed (uppercase hex)", "malformed (64 non-hex)"].every((n) => results.get(n).status === 400));
  } else {
    check("key not set: every variant is 404 not-available", [...results.values()].every((r) => r.status === 404));
  }

  // Same valid challenge with extra headers; compare to the plain response.
  const plain = v;
  const extras = [
    ["with the window-secret header (correct value)", { "x-getwrite-window": secrets.window }],
    ["with a wrong window-secret header", { "x-getwrite-window": hex64() }],
    ["with forged x-getwrite-classification: window", { "x-getwrite-classification": "window" }],
    ["with forged x-getwrite-classification: off", { "x-getwrite-classification": "off" }],
    ["with forged x-getwrite-classification: confirmed:forged", { "x-getwrite-classification": "confirmed:forged" }],
  ];
  for (const [name, headers] of extras) {
    const r = await send({ host, p: `/api/sharing/ready?challenge=${valid}`, headers });
    const same = r.status === plain.status && r.body === plain.body && r.gate === plain.gate;
    log(`  ${name}: ${desc(r)}`);
    check(`response ${name} is identical to the plain response (status, gate header, body: equal)`, same);
  }

  // Foreign Host and POST.
  const foreign = await send({ host: `evil.example:${PORT}`, p: `/api/sharing/ready?challenge=${valid}` });
  log(`  foreign Host (evil.example:${PORT}): ${desc(foreign)}`);
  const foreign3000 = await send({ host: `127.0.0.1:3000`, p: `/api/sharing/ready?challenge=${valid}` });
  log(`  Host 127.0.0.1:3000: ${desc(foreign3000)}`);
  if (sharingOn) {
    check("foreign Host: 403 host-not-allowed", foreign.status === 403 && foreign.gate === "host-not-allowed");
    check("Host 127.0.0.1:3000: 403 host-not-allowed", foreign3000.status === 403 && foreign3000.gate === "host-not-allowed");
  }
  const post = await send({ host, method: "POST", p: `/api/sharing/ready?challenge=${valid}` });
  log(`  POST: ${desc(post)}`);
  if (sharingOn) check("POST: 401 not-paired", post.status === 401 && post.gate === "not-paired");
}

async function main() {
  const lan = lanIp();
  if (lan === undefined) throw new Error("no LAN IPv4 address found");
  for (const port of [PORT, 3000]) {
    const l = listeners(port);
    if (l.length > 0) {
      log(`REFUSING: something already listens on ${port} (pids ${l.join(",")}); started nothing.`);
      process.exit(2);
    }
  }
  log(`pre-check: no listener on ${PORT} or 3000 (lsof). LAN address used: ${lan}`);
  if (!existsSync(SERVER)) throw new Error("standalone server not built");
  if (!existsSync(path.join(path.dirname(SERVER), ".next/static"))) throw new Error(".next/static not copied into standalone");

  const base = mkdtempSync(path.join(tmpdir(), "gw-t15-"));
  const dirs = { sharing: path.join(base, "sharing"), projects: path.join(base, "projects") };
  mkdirSync(dirs.sharing);
  mkdirSync(dirs.projects);
  log(`throwaway folder: ${base}`);
  const secrets = { window: hex64(), key: hex64() };
  const started = [];
  try {
    for (const [sharingOn, withKey] of [[true, true], [true, false], [false, true], [false, false]]) {
      log("");
      log(`=== server: sharing ${sharingOn ? "ON" : "OFF"}, HOSTNAME=${sharingOn ? "0.0.0.0" : "127.0.0.1"}, PORT=${PORT}, readiness key ${withKey ? "set" : "not set"} ===`);
      const rec = await startServer({ sharingOn, withKey, dirs, secrets });
      started.push(rec);
      log(`  started pid ${rec.pid} (command "${rec.comm}")`);
      const own = listeners(PORT);
      check(`${PORT} listened on by exactly the pid started`, own.length === 1 && own[0] === String(rec.pid), `listener count ${own.length}`);
      check(`3000 has no listener while it runs`, listeners(3000).length === 0);
      if (sharingOn && withKey) {
        await hostAllowlist(lan);
        await unpairedElsewhere();
      }
      await readyChecks({ sharingOn, withKey, secrets });
      await stopServer(rec);
    }
  } finally {
    for (const rec of started) {
      const now = comm(rec.pid);
      if (!rec.exited && now !== "" && (now === rec.comm || now.startsWith("next-server"))) process.kill(rec.pid, "SIGTERM");
    }
    rmSync(base, { recursive: true, force: true });
    log("");
    log(`throwaway folder removed: ${!existsSync(base)}`);
    log(`final: ${PORT} listeners ${listeners(PORT).length}, 3000 listeners ${listeners(3000).length}`);
  }
  log(`failures: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("script error:", e.message);
  process.exit(3);
});
