#!/usr/bin/env node
/**
 * Feature 77, Task 2: does POST /api/encryption build a filesystem path from a
 * traversal `projectId`, for `enable` (null and non-null passphrase) and
 * `export`?
 *
 * Usage: node traversal-experiment.mjs [standalone|dev]   (default standalone)
 *
 * Uses the real /api/encryption route; no throwaway route. For each traversal
 * value x action it creates a fresh throwaway layout and a fresh server:
 *
 *   $TMPDIR/gw-trav-XXXX/            (parent)
 *     workspace/                     (GETWRITE_PROJECTS_DIR; one valid project)
 *     sentinel-XXXX/marker.txt       (sibling sentinel)
 *     userdata/                      (HOME for the server; throwaway)
 *
 * and compares listings of parent, workspace, sentinel and userdata before and
 * after. Refuses to run while anything listens on port 3000, picks free ports,
 * stops only the process groups it started. Every path it uses is asserted to
 * be under os.tmpdir(). The passphrase is random and never printed. Response
 * bodies are reduced to status and `error` string (and key names).
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../frontend");
const STANDALONE = path.join(FRONTEND, ".next/standalone/frontend/server.js");
const mode = process.argv[2] ?? "standalone";
if (mode !== "standalone" && mode !== "dev") {
  console.error("usage: traversal-experiment.mjs [standalone|dev]");
  process.exit(2);
}

function port3000Busy() {
  try {
    return execFileSync("lsof", ["-iTCP:3000", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim() !== "";
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

const started = [];
function startServer(port, workspace, home) {
  const env = { ...process.env, PORT: String(port), GETWRITE_PROJECTS_DIR: workspace, HOME: home };
  for (const k of ["HOSTNAME", "DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET"]) delete env[k];
  let child;
  if (mode === "standalone") {
    env.HOSTNAME = "127.0.0.1";
    child = spawn(process.execPath, [STANDALONE], { cwd: path.dirname(STANDALONE), env, stdio: "ignore", detached: true });
  } else {
    child = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], { cwd: FRONTEND, env, stdio: "ignore", detached: true });
  }
  started.push(child.pid);
  return child;
}
async function stopServer(child) {
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
  await new Promise((r) => setTimeout(r, 800));
  const i = started.indexOf(child.pid);
  if (i >= 0) started.splice(i, 1);
}
async function waitReady(base, child) {
  for (let i = 0; i < 300; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited before ready");
    try {
      const res = await fetch(`${base}/api/encryption`);
      if (res.status === 200) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not ready");
}

const TMP = await realpath(tmpdir());
function assertUnderTmp(p) {
  const r = path.resolve(p);
  if (!r.startsWith(TMP + path.sep)) throw new Error("path outside os.tmpdir(): refusing");
}

async function walk(dir, rel = "") {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { out.push(`${r}/`); out.push(...(await walk(path.join(dir, e.name), r))); }
    else {
      const buf = await readFile(path.join(dir, e.name));
      const s = await stat(path.join(dir, e.name));
      out.push(`${r} [${s.size}B sha=${createHash("sha256").update(buf).digest("hex").slice(0, 8)}]`);
    }
  }
  return out;
}
async function snap(layout) {
  return {
    parent: (await readdir(layout.parent)).sort(),
    workspace: await walk(layout.workspace),
    sentinel: await walk(layout.sentinel),
    userdata: await walk(layout.userdata),
  };
}
function diff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return { added: b.filter((x) => !sa.has(x)), removed: a.filter((x) => !sb.has(x)) };
}
function summarize(before, after) {
  const out = {};
  for (const k of Object.keys(before)) {
    const d = diff(before[k], after[k]);
    out[k] = { before: before[k].length, after: after[k].length, ...(d.added.length || d.removed.length ? d : {}) };
  }
  return out;
}

async function makeLayout() {
  const parent = await mkdtemp(path.join(TMP, "gw-trav-"));
  const sentinelName = `sentinel-${randomBytes(4).toString("hex")}`;
  const layout = {
    parent,
    workspace: path.join(parent, "workspace"),
    sentinelName,
    sentinel: path.join(parent, sentinelName),
    userdata: path.join(parent, "userdata"),
    projectId: randomUUID(),
  };
  Object.values(layout).filter((v) => typeof v === "string" && v.startsWith(TMP)).forEach(assertUnderTmp);
  await mkdir(layout.workspace);
  await mkdir(layout.sentinel);
  await mkdir(layout.userdata);
  await writeFile(path.join(layout.sentinel, "marker.txt"), "sentinel marker\n");
  const proj = path.join(layout.workspace, layout.projectId);
  await mkdir(path.join(proj, "resources", "r1"), { recursive: true });
  await writeFile(path.join(proj, "project.json"), JSON.stringify({ id: layout.projectId, name: "Throwaway" }));
  await writeFile(path.join(proj, "resources", "r1", "content.txt"), "throwaway body\n");
  return layout;
}

async function post(base, body) {
  const res = await fetch(`${base}/api/encryption`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, error: typeof json.error === "string" ? json.error : null, keys: Object.keys(json) };
}

function values(layout) {
  const s = layout.sentinelName;
  return [
    ["relative", `../${s}`],
    ["absolute", layout.sentinel],
    ["percent-encoded", `..%2F${s}`],
    ["empty", ""],
    ["null", null],
    ["NUL byte", `../${s}\u0000`],
  ];
}
function spell(v) { return JSON.stringify(v).replace(/sentinel-[0-9a-f]{8}/g, "<sentinel>").replace(/\/[^"]*\/<sentinel>/, "<abs>/<sentinel>"); }

function classify(before, after, res) {
  const sentinelChanged = JSON.stringify(before.sentinel) !== JSON.stringify(after.sentinel);
  const parentChanged = JSON.stringify(before.parent) !== JSON.stringify(after.parent);
  if (sentinelChanged || parentChanged) return "path was built outside the root";
  if (after.workspace.includes(".encrypted.json") === false && after.workspace.some((x) => x.startsWith(".encrypted.json ")) && !before.workspace.some((x) => x.startsWith(".encrypted.json "))) {
    return "path was built at the workspace root itself (effect inside the workspace, not outside it)";
  }
  const wsChanged = JSON.stringify(before.workspace) !== JSON.stringify(after.workspace);
  const udChanged = JSON.stringify(before.userdata) !== JSON.stringify(after.userdata);
  const looksValidation = res.status === 400 && /project ?id/i.test(res.error ?? "");
  if (!wsChanged && !udChanged && looksValidation) return "rejected before a path was built";
  return "failed later for another reason";
}

async function runCase(action, label, value) {
  const layout = await makeLayout();
  const passphrase = randomBytes(12).toString("hex"); // never printed
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = startServer(port, layout.workspace, layout.userdata);
  try {
    await waitReady(base, child);
    // Case value is rebuilt per layout so the sentinel name matches this layout.
    const v = values(layout).find(([l]) => l === label)[1];
    let setup = "none";
    if (action !== "enable-nonnull") {
      const s = await post(base, { action: "enable", projectId: layout.projectId, projectName: "Throwaway", passphrase });
      setup = `valid enable of the seeded project: ${s.status}`;
    }
    const before = await snap(layout);
    const body =
      action === "export"
        ? { action: "export", projectId: v }
        : { action: "enable", projectId: v, projectName: "Throwaway", passphrase: action === "enable-null" ? null : passphrase };
    const res = await post(base, body);
    const after = await snap(layout);
    const verdict = classify(before, after, res);
    console.log(JSON.stringify({ action, value: label, sent: spell(v), setup, status: res.status, error: res.error, resultKeys: res.keys, verdict, listings: summarize(before, after) }));
    return verdict;
  } finally {
    await stopServer(child);
    assertUnderTmp(layout.parent);
    await rm(layout.parent, { recursive: true, force: true });
  }
}

async function main() {
  if (port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  console.log(`mode=${mode} node=${process.version} tmp root under os.tmpdir() (name withheld)`);
  const labels = ["relative", "absolute", "percent-encoded", "empty", "null", "NUL byte"];
  const tally = {};
  for (const action of ["enable-null", "enable-nonnull", "export"]) {
    for (const label of labels) {
      const v = await runCase(action, label);
      tally[v] = (tally[v] ?? 0) + 1;
    }
  }
  console.log(`tally: ${JSON.stringify(tally)}`);
}
main()
  .catch((e) => { console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`); process.exitCode = 1; })
  .finally(async () => {
    for (const pid of [...started]) { try { process.kill(-pid, "SIGTERM"); } catch { /* gone */ } }
    console.log(`process groups still recorded: ${started.length}`);
  });
