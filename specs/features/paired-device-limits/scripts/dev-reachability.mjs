#!/usr/bin/env node
/**
 * Feature 77, Task 3 (context only): is a `next dev` server started the way the
 * desktop app starts it in development mode (electron/src/main.ts startServer:
 * spawn("pnpm", ["dev"], { cwd: frontend, env, shell: true }), env from
 * buildServerBindEnv with sharing off) reachable at the host's LAN address?
 *
 * Usage: node dev-reachability.mjs
 *
 * Refuses to run while anything listens on port 3000. Picks a free port, uses
 * throwaway empty directories under os.tmpdir(), starts the server as its own
 * process group, lists listeners only for pids in that group (never by port),
 * and stops only that group. Prints variable NAMES of the environment, never
 * values of secrets.
 */
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../frontend",
);
const PROBE = "/api/projects";

function port3000Busy() {
  try {
    return (
      execFileSync("lsof", ["-iTCP:3000", "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
      }).trim() !== ""
    );
  } catch {
    return false;
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

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return undefined;
}

let groupLeader;
function stop() {
  if (groupLeader === undefined) return;
  try {
    process.kill(-groupLeader, "SIGTERM");
  } catch (e) {
    console.log(`stop group ${groupLeader}: ${e.code ?? e.message}`);
  }
}

async function request(label, url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    console.log(
      JSON.stringify({
        request: label,
        status: res.status,
        "x-getwrite-gate": res.headers.get("x-getwrite-gate") ?? "(absent)",
      }),
    );
    return res.status;
  } catch (e) {
    console.log(JSON.stringify({ request: label, error: e.code ?? e.message }));
    return undefined;
  }
}

async function main() {
  if (port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const lan = lanAddress();
  if (lan === undefined) {
    console.log("no LAN address on this machine (no non-internal IPv4); stopping");
    return;
  }
  const root = await mkdtemp(path.join(tmpdir(), "gw-devreach-"));
  const projects = path.join(root, "projects");
  const sharingDir = path.join(root, "userData");
  await mkdir(projects);
  await mkdir(sharingDir);
  const port = await freePort();
  // Mirrors startServer with sharing off: buildServerBindEnv(effective=false).
  const env = {
    ...process.env,
    PORT: String(port),
    GETWRITE_PROJECTS_DIR: projects,
    GETWRITE_DESKTOP: "1",
    GETWRITE_REPO: "saboteur-works/getwrite",
    GETWRITE_APP_VERSION: "0.0.0-experiment",
    GETWRITE_WINDOW_SECRET: randomBytes(32).toString("hex"),
    GETWRITE_SHARING_DIR: sharingDir,
    HOSTNAME: "127.0.0.1",
    GETWRITE_BIND: "127.0.0.1",
    GETWRITE_SHARING: "0",
  };
  const added = [
    "PORT", "GETWRITE_PROJECTS_DIR", "GETWRITE_DESKTOP", "GETWRITE_REPO",
    "GETWRITE_APP_VERSION", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR",
    "HOSTNAME", "GETWRITE_BIND", "GETWRITE_SHARING",
  ];
  console.log(`node=${process.version} lan=${lan} port=${port}`);
  console.log(`env set on top of the inherited process env (names): ${added.join(", ")}`);
  console.log(`inherited names that matter here: hosted-auth DATABASE_URL set=${Boolean(process.env.DATABASE_URL)}, BETTER_AUTH_SECRET set=${Boolean(process.env.BETTER_AUTH_SECRET)}`);
  console.log(`values: HOSTNAME=${env.HOSTNAME} GETWRITE_BIND=${env.GETWRITE_BIND} GETWRITE_SHARING=${env.GETWRITE_SHARING} (secrets withheld)`);
  try {
    const child = spawn("pnpm", ["dev"], {
      cwd: FRONTEND,
      env,
      shell: true,
      stdio: "ignore",
      detached: true,
    });
    groupLeader = child.pid;
    console.log(`started pnpm dev (shell:true) group leader pid=${child.pid}`);
    let ready = false;
    for (let i = 0; i < 240 && !ready; i += 1) {
      if (child.exitCode !== null) throw new Error("server exited before ready");
      try {
        const res = await fetch(`http://127.0.0.1:${port}${PROBE}`);
        if (res.status !== 404) ready = true;
      } catch {
        // not listening yet
      }
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error("server did not become ready");

    await request("loopback", `http://127.0.0.1:${port}${PROBE}`);
    await request("own LAN address", `http://${lan}:${port}${PROBE}`);

    const members = execFileSync("ps", ["-A", "-o", "pid=,pgid="], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((x) => x[1] === String(child.pid))
      .map((x) => x[0]);
    console.log(`process-group members: ${members.join(",")}`);
    for (const pid of members) {
      try {
        const out = execFileSync(
          "lsof",
          ["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-p", pid],
          { encoding: "utf8" },
        );
        console.log(`lsof -nP -iTCP -sTCP:LISTEN pid ${pid}:\n${out}`);
      } catch {
        console.log(`pid ${pid}: no TCP listener`);
      }
    }
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 2000));
    await rm(root, { recursive: true, force: true });
    console.log(`stopped group ${groupLeader}`);
  }
}

main().catch((e) => {
  console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`);
  stop();
  process.exit(1);
});
