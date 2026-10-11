#!/usr/bin/env node
/**
 * Feature 77, Task 1: which x-getwrite-classification header does a route
 * handler receive on GET and on POST with a JSON body, per caller, in the
 * standalone build and in `next dev`.
 *
 * Usage (from anywhere): node header-experiment.mjs <standalone|dev>
 *
 * Needs the throwaway route frontend/app/api/zz-echo-classification/route.ts
 * (GET and POST echo `{ header }` only) and, for "standalone", a finished
 * `pnpm build`. Refuses to run while anything listens on port 3000. Picks free
 * ports itself, uses throwaway directories under os.tmpdir(), starts each
 * server in its own process group and stops only the process groups it
 * recorded. Never prints a window secret, cookie value, pairing code or
 * credential hash: those appear only as placeholders.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../frontend",
);
const STANDALONE = path.join(FRONTEND, ".next/standalone/frontend/server.js");
const ECHO = "/api/zz-echo-classification";
const mode = process.argv[2];
if (mode !== "standalone" && mode !== "dev") {
  console.error("usage: header-experiment.mjs <standalone|dev>");
  process.exit(2);
}

function port3000Busy() {
  try {
    const out = execFileSync("lsof", ["-iTCP:3000", "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    });
    return out.trim() !== "";
  } catch {
    return false; // lsof exits 1 with no match
  }
}

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

const started = []; // recorded pids (process-group leaders) this script started

function startServer(port, env) {
  const full = {
    ...process.env,
    PORT: String(port),
    ...env,
  };
  delete full.HOSTNAME;
  let child;
  if (mode === "standalone") {
    full.HOSTNAME = "127.0.0.1";
    child = spawn(process.execPath, [STANDALONE], {
      cwd: path.dirname(STANDALONE),
      env: full,
      stdio: "ignore",
      detached: true,
    });
  } else {
    child = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
      cwd: FRONTEND,
      env: full,
      stdio: "ignore",
      detached: true,
    });
  }
  started.push(child.pid);
  child.on("error", (e) => console.log(`spawn error: ${e.message}`));
  return child;
}

function stopAll() {
  for (const pid of started) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (e) {
      console.log(`stop pid ${pid}: ${e.code ?? e.message}`);
    }
  }
}

async function waitReady(base, headers, child) {
  for (let i = 0; i < 300; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited before ready");
    try {
      const res = await fetch(`${base}${ECHO}`, { headers });
      if (res.status === 200 || res.status === 401) return;
      if (i % 20 === 0) console.log(`waiting, last status ${res.status}`);
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become ready");
}

async function call(base, method, headers, label, extra = {}) {
  const init = { method, redirect: "manual", headers: { ...headers } };
  if (method === "POST") {
    init.headers["content-type"] = "application/json";
    init.headers.origin = base;
    init.body = JSON.stringify({ probe: true });
  }
  const res = await fetch(`${extra.url ?? base}${ECHO}`, init);
  let echoed = "(no JSON header field)";
  try {
    const body = await res.json();
    if ("header" in body) echoed = body.header === null ? "null" : body.header;
  } catch {
    // non-JSON refusal body
  }
  const row = {
    build: mode,
    caller: label,
    method: `${method}${method === "POST" ? " json" : ""}${extra.forged ? " +forged header" : ""}`,
    status: res.status,
    gate: res.headers.get("x-getwrite-gate") ?? "-",
    echoed: echoed.startsWith("confirmed:") ? "confirmed:<device-id>" : echoed,
  };
  console.log(JSON.stringify(row));
  return row;
}

async function pair(base, dir) {
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const salt = randomBytes(16);
  const now = Date.now();
  await writeFile(
    path.join(dir, "pairing-state.json"),
    JSON.stringify({
      version: 1,
      salt: salt.toString("hex"),
      codeHash: createHmac("sha256", salt).update(code).digest("hex"),
      expiresAt: now + 300000,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: now,
    }),
  );
  const res = await fetch(`${base}/api/sharing/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ code }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  console.log(`pairing POST status: ${res.status}`);
  if (res.status !== 200 || !setCookie.startsWith("getwrite_device=")) {
    throw new Error("pairing did not yield a device cookie");
  }
  return setCookie.split(";")[0]; // held in memory, never printed
}

async function runCaller(base, label, headers) {
  await call(base, "GET", headers, label);
  await call(base, "POST", headers, label);
  await call(
    base,
    "POST",
    { ...headers, "x-getwrite-classification": "window" },
    label,
    { forged: true },
  );
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return undefined;
}

async function main() {
  if (port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const root = await mkdtemp(path.join(tmpdir(), "gw-hdr-"));
  const projects = path.join(root, "projects");
  const sharingDir = path.join(root, "sharing");
  await mkdir(projects);
  await mkdir(sharingDir);
  const secret = randomBytes(32).toString("hex");
  console.log(
    `mode=${mode} node=${process.version} throwaway root under os.tmpdir() (name withheld)`,
  );
  try {
    // Server A: sharing on. Window, paired, unpaired.
    const portA = await freePort();
    const baseA = `http://127.0.0.1:${portA}`;
    const a = startServer(portA, {
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_PROJECTS_DIR: projects,
    });
    console.log(`server A (sharing on) pid=${a.pid} port=${portA}`);
    await waitReady(baseA, { "x-getwrite-window": secret }, a);
    const cookie = await pair(baseA, sharingDir);
    await runCaller(baseA, "window", { "x-getwrite-window": secret });
    await runCaller(baseA, "paired device", { cookie });
    await runCaller(baseA, "unpaired device", {});
    process.kill(-a.pid, "SIGTERM");
    started.splice(started.indexOf(a.pid), 1);
    await new Promise((r) => setTimeout(r, 1500));

    // Server B: sharing off.
    const portB = await freePort();
    const baseB = `http://127.0.0.1:${portB}`;
    const b = startServer(portB, { GETWRITE_PROJECTS_DIR: projects });
    console.log(`server B (sharing off) pid=${b.pid} port=${portB}`);
    await waitReady(baseB, {}, b);
    await runCaller(baseB, "sharing off", {});
    if (mode === "dev") {
      const lan = lanAddress();
      if (lan === undefined) console.log("LAN request: not run (no LAN address)");
      else {
        console.log("LAN request window opens (server kept up only for these)");
        await call(`http://127.0.0.1:${portB}`, "GET", {}, "sharing off, from LAN address", {
          url: `http://${lan}:${portB}`,
        });
        await call(`http://127.0.0.1:${portB}`, "POST", {}, "sharing off, from LAN address", {
          url: `http://${lan}:${portB}`,
        });
        try {
          // Only members of the process group this script started.
          const members = execFileSync("ps", ["-A", "-o", "pid=,pgid="], {
            encoding: "utf8",
          })
            .split("\n")
            .map((l) => l.trim().split(/\s+/))
            .filter((x) => x[1] === String(b.pid))
            .map((x) => x[0]);
          console.log(`process-group members: ${members.join(",")}`);
          for (const pid of members) {
            try {
              const out = execFileSync(
                "lsof",
                ["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-p", pid],
                { encoding: "utf8" },
              );
              console.log(`lsof pid ${pid}:\n${out}`);
            } catch {
              console.log(`lsof pid ${pid}: no TCP listener`);
            }
          }
        } catch {
          console.log(`lsof for pid ${b.pid}: no listener under that exact pid`);
        }
      }
    }
  } finally {
    stopAll();
    await new Promise((r) => setTimeout(r, 1500));
    await rm(root, { recursive: true, force: true });
    console.log(`stopped recorded process groups: ${started.join(",") || "(none left)"}`);
  }
}

main().catch((e) => {
  console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`);
  stopAll();
  process.exit(1);
});
