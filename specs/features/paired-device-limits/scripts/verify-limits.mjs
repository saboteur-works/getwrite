#!/usr/bin/env node
/**
 * Feature 77, Task 26: built-server verification of the paired-device limits.
 *
 * Usage: node verify-limits.mjs <standalone|dev>
 *
 * "standalone" needs a finished `pnpm build` in frontend/ with
 * `.next/static` copied into `.next/standalone/frontend/.next/static`, and the
 * Electron workspace built (`pnpm build` in electron/) so that
 * `electron/dist/sharing/limits-store.js` exists. "dev" starts `next dev`.
 *
 * Everything runs against a throwaway root under os.tmpdir(): its own
 * GETWRITE_PROJECTS_DIR, GETWRITE_SHARING_DIR, a throwaway encrypted project
 * and a random throwaway passphrase. The script refuses to run while anything
 * listens on port 3000, picks free ports, records the process groups it
 * starts and stops only those. Every change to the limits file goes through
 * the main-side writer (`setLimit`), except the two deliberately unreadable
 * variants (a mode-0 file, a directory at the file path), which no writer can
 * produce.
 *
 * Output is request labels, status codes, the gate header value and `limit`
 * keys only. It never prints a cookie value, window secret, pairing code,
 * passphrase or response body text.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const FRONTEND = path.join(REPO, "frontend");
const STANDALONE = path.join(FRONTEND, ".next/standalone/frontend/server.js");
const WRITER = path.join(REPO, "electron/dist/sharing/limits-store.js");
const LIMITS_FILE = "sharing-limits.json";
export const KEYS = [
  "projectDeletion",
  "unlocking",
  "locking",
  "encryptionChanges",
  "permanentDeletion",
];

const isEntry =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// When imported (Task 27), the importer sets process.argv[2] before importing.
const mode = process.argv[2];
if (mode !== "standalone" && mode !== "dev") {
  console.error("usage: verify-limits.mjs <standalone|dev>");
  process.exit(2);
}

// ---------------------------------------------------------------- bookkeeping

export const counts = { measured: 0, setup: 0 };
export const checks = [];
export const started = []; // process-group leaders this script started

export function check(item, name, ok, detail = "") {
  checks.push({ item, name, ok });
  console.log(`CHECK [${item}] ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

export function port3000Busy() {
  try {
    return (
      execFileSync("lsof", ["-iTCP:3000", "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
      }).trim() !== ""
    );
  } catch {
    return false; // lsof exits 1 when nothing matches
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------- enumeration (count)

const APP_DIR = path.join(FRONTEND, "app");
const DUMMY = "dummy";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

async function walk(dir, name) {
  const found = [];
  for (const child of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, child.name);
    if (child.isDirectory()) found.push(...(await walk(full, name)));
    else if (child.name === name) found.push(full);
  }
  return found.sort();
}

function exportedMethods(source) {
  const names = new Set();
  const direct =
    /export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  for (const m of source.matchAll(direct)) names.add(m[1]);
  for (const list of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of list[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/).pop();
      if (HTTP_METHODS.includes(n)) names.add(n);
    }
  }
  return HTTP_METHODS.filter((m) => names.has(m));
}

/** Same walk and rules as frontend/scripts/sharing-refusal-smoke.mjs. */
async function enumerationCount() {
  const toUrl = (file) =>
    `/${path
      .relative(APP_DIR, path.dirname(file))
      .split(path.sep)
      .filter((s) => s !== "" && !(s.startsWith("(") && s.endsWith(")")))
      .map((s) => (s.startsWith("[") && s.endsWith("]") ? DUMMY : s))
      .join("/")}`;
  const entries = [];
  for (const file of await walk(path.join(APP_DIR, "api"), "route.ts")) {
    for (const method of exportedMethods(await readFile(file, "utf8"))) {
      entries.push(`${method} ${toUrl(file)}`);
    }
  }
  for (const file of await walk(APP_DIR, "page.tsx")) {
    entries.push(`GET ${toUrl(file)}`);
  }
  return entries;
}

// ----------------------------------------------------------------- processes

export function startServer(port, env) {
  const full = { ...process.env, PORT: String(port), ...env };
  for (const k of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GETWRITE_ENABLE_DEV_IDENTITY",
    "GETWRITE_BIND",
    "HOSTNAME",
    "GETWRITE_SHARING",
    "GETWRITE_WINDOW_SECRET",
    "GETWRITE_SHARING_DIR",
  ]) {
    if (!(k in env)) delete full[k];
  }
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
    child = spawn(
      "pnpm",
      ["exec", "next", "dev", "-p", String(port), "-H", "127.0.0.1"],
      { cwd: FRONTEND, env: full, stdio: "ignore", detached: true },
    );
  }
  started.push(child.pid);
  child.on("error", (e) => console.log(`spawn error: ${e.message}`));
  return child;
}

export function stopServer(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (e) {
    console.log(`stop pid ${child.pid}: ${e.code ?? e.message}`);
  }
}

export function groupMembers() {
  try {
    return execFileSync("ps", ["-A", "-o", "pid=,pgid="], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((x) => x.length === 2 && started.includes(Number(x[1])))
      .map((x) => x[0]);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------- server

/**
 * One running server plus the callers and helpers bound to it.
 * `window` is {} for a sharing-off server (there is no gate to present to).
 */
export function makeCtx({ base, window }) {
  return { base, window, cookie: null, passphrase: null };
}

export async function request(ctx, method, urlPath, headers, body, setup) {
  counts[setup ? "setup" : "measured"] += 1;
  const init = {
    method,
    redirect: "manual",
    headers: { ...headers },
    signal: AbortSignal.timeout(240000),
  };
  if (method !== "GET") {
    init.headers["content-type"] = "application/json";
    init.headers.origin = ctx.base;
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  const res = await fetch(`${ctx.base}${urlPath}`, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    status: res.status,
    gate: res.headers.get("x-getwrite-gate"),
    location: res.headers.get("location"),
    cacheControl: res.headers.get("cache-control"),
    json,
  };
}

const callerHeaders = (ctx, who) =>
  who === "window"
    ? ctx.window
    : who === "paired"
      ? { cookie: ctx.cookie }
      : who === "made-up-cookie"
        ? { cookie: `getwrite_device=${randomBytes(32).toString("base64url")}` }
        : {};

/** Measured request as `who`; prints one row. */
export async function as(ctx, who, item, label, method, urlPath, body, extraHeaders = {}) {
  const r = await request(
    ctx,
    method,
    urlPath,
    { ...callerHeaders(ctx, who), ...extraHeaders },
    body,
    false,
  );
  console.log(
    `ROW ${JSON.stringify({
      build: mode,
      item,
      request: label,
      caller: who,
      status: r.status,
      gate: r.gate ?? "-",
      limit: r.json && typeof r.json.limit === "string" ? r.json.limit : "-",
    })}`,
  );
  return r;
}

/** Setup request through the window (never limited). */
export const setupCall = (ctx, method, urlPath, body) =>
  request(ctx, method, urlPath, ctx.window, body, true);

export async function waitReady(ctx, child) {
  for (let i = 0; i < 400; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited before ready");
    try {
      const res = await fetch(`${ctx.base}/api/auth-status`, {
        headers: ctx.window,
        signal: AbortSignal.timeout(240000),
      });
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error("server did not become ready");
}

export async function pairDevice(ctx, sharingDir) {
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const salt = randomBytes(16);
  const now = Date.now();
  writeFileSync(
    path.join(sharingDir, "pairing-state.json"),
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
  const res = await fetch(`${ctx.base}/api/sharing/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ctx.base },
    body: JSON.stringify({ code }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  console.log(`pairing POST status: ${res.status}`);
  if (res.status !== 200 || !setCookie.startsWith("getwrite_device=")) {
    throw new Error("pairing did not yield a device cookie");
  }
  ctx.cookie = setCookie.split(";")[0]; // in memory only, never printed
}

// ----------------------------------------------------------------- fixtures

let seq = 0;

export async function newProject(ctx, type = "blank") {
  seq += 1;
  const before = new Set(readdirSync(ctx.projectsDir));
  const r = await setupCall(ctx, "POST", "/api/projects", {
    name: `verify-${seq}`,
    projectType: type,
  });
  // The API's projectId is the directory name, which is not project.id.
  const added = readdirSync(ctx.projectsDir).filter((d) => !before.has(d));
  if (r.status !== 200 || added.length !== 1) {
    throw new Error(`fixture project create failed (${r.status}, ${added.length} new dirs)`);
  }
  return { id: added[0], folders: r.json.folders ?? [] };
}

export async function newResource(ctx, pid, folderId) {
  seq += 1;
  const r = await setupCall(ctx, "POST", "/api/resource", {
    projectId: pid,
    resourceData: {
      name: `res-${seq}`,
      type: "text",
      folderId: folderId ?? null,
      text: { plainText: "some words to keep" },
    },
  });
  const id = r.json?.resource?.id;
  if (r.status !== 200 || typeof id !== "string") {
    throw new Error(`fixture resource create failed (${r.status})`);
  }
  return id;
}

export async function newRevision(ctx, pid, rid) {
  const r = await setupCall(ctx, "POST", `/api/resource/revision/${rid}`, {
    projectId: pid,
    content: "revision text",
    author: "verify",
    isCanonical: false,
  });
  if (r.status !== 201 || typeof r.json?.id !== "string") {
    throw new Error(`fixture revision create failed (${r.status})`);
  }
  return r.json.id;
}

export async function trashedResource(ctx, pid) {
  const rid = await newResource(ctx, pid);
  const r = await setupCall(ctx, "POST", `/api/resource/${rid}/delete`, {
    projectId: pid,
  });
  if (r.status !== 200) throw new Error(`fixture soft delete failed (${r.status})`);
  return rid;
}

export async function trashIds(ctx, pid) {
  const r = await setupCall(ctx, "GET", `/api/project/${pid}/trash`);
  if (r.status !== 200) throw new Error(`trash list failed (${r.status})`);
  return [...(r.json.resources ?? []), ...(r.json.folders ?? [])].map((x) => x.id);
}

export async function sessionUnlocked(ctx) {
  const r = await setupCall(ctx, "GET", "/api/encryption");
  if (r.status !== 200) throw new Error(`encryption status failed (${r.status})`);
  return r.json.isUnlocked === true;
}

/** Puts the workspace session in the wanted state through the window. */
export async function setSession(ctx, wantUnlocked) {
  if ((await sessionUnlocked(ctx)) === wantUnlocked) return;
  const r = await setupCall(
    ctx,
    "POST",
    "/api/encryption",
    wantUnlocked
      ? { action: "unlock", passphrase: ctx.passphrase }
      : { action: "lock" },
  );
  if (r.status !== 200) throw new Error(`session change failed (${r.status})`);
}

// ------------------------------------------------------------ limits file I/O

export function limitsPath(ctx) {
  return path.join(ctx.sharingDir, LIMITS_FILE);
}

export function clearLimitsFile(ctx) {
  try {
    chmodSync(limitsPath(ctx), 0o600);
  } catch {
    // absent or a directory
  }
  rmSync(limitsPath(ctx), { recursive: true, force: true });
}

/** Writes the file only through the main-side writer. */
export async function setLimits(ctx, wanted) {
  for (const key of KEYS) {
    const outcome = await ctx.writer.setLimit(ctx.sharingDir, key, wanted[key]);
    if (outcome.kind !== "ok") throw new Error(`setLimit ${key}: ${outcome.kind}`);
  }
}

export const all = (value) => Object.fromEntries(KEYS.map((k) => [k, value]));
export const onlyOff = (...off) => Object.fromEntries(KEYS.map((k) => [k, !off.includes(k)]));

export async function makeUnreadable(ctx, variant) {
  clearLimitsFile(ctx);
  if (variant === "chmod-0") {
    // contents say every limit is off, so a fall-back to contents would show
    writeFileSync(
      limitsPath(ctx),
      JSON.stringify({ version: 1, limits: all(false) }),
    );
    chmodSync(limitsPath(ctx), 0o000);
  } else {
    mkdirSync(limitsPath(ctx));
  }
}

// ------------------------------------------------------------------- actions

function buildActions(ctx) {
  const P = ctx.fixtures;
  const marker = (pid) =>
    existsSync(path.join(ctx.projectsDir, pid, ".encrypted.json"));
  const dirCount = () => readdirSync(ctx.projectsDir).length;
  return [
    {
      id: "project-delete",
      label: "POST /api/project/delete",
      key: "projectDeletion",
      prep: async () => ({ ...(await newProject(ctx)) }),
      send: (who, s) =>
        as(ctx, who, ctx.item, "POST /api/project/delete", "POST", "/api/project/delete", {
          projectId: s.id,
        }),
      applied: async (s) => !existsSync(path.join(ctx.projectsDir, s.id, "project.json")),
    },
    {
      id: "unlock",
      label: "POST /api/encryption unlock",
      key: "unlocking",
      prep: async () => {
        await setSession(ctx, false);
        return {};
      },
      send: (who) =>
        as(ctx, who, ctx.item, "POST /api/encryption unlock", "POST", "/api/encryption", {
          action: "unlock",
          passphrase: ctx.passphrase,
        }),
      applied: async () => (await sessionUnlocked(ctx)) === true,
    },
    {
      id: "resume",
      label: "POST /api/encryption resume",
      key: "unlocking",
      prep: async () => {
        await setSession(ctx, true);
        return {};
      },
      send: (who) =>
        as(ctx, who, ctx.item, "POST /api/encryption resume", "POST", "/api/encryption", {
          action: "resume",
        }),
      applied: null, // resume has no observable effect on a workspace with nothing interrupted
    },
    {
      id: "lock",
      label: "POST /api/encryption lock",
      key: "locking",
      prep: async () => {
        await setSession(ctx, true);
        return {};
      },
      send: (who) =>
        as(ctx, who, ctx.item, "POST /api/encryption lock", "POST", "/api/encryption", {
          action: "lock",
        }),
      applied: async () => (await sessionUnlocked(ctx)) === false,
    },
    {
      id: "enable-existing-key",
      label: "POST /api/encryption enable (passphrase null)",
      key: "encryptionChanges",
      prep: async () => {
        await setSession(ctx, true);
        return { ...(await newProject(ctx)) };
      },
      send: (who, s) =>
        as(ctx, who, ctx.item, "POST /api/encryption enable (null)", "POST", "/api/encryption", {
          action: "enable",
          projectId: s.id,
          projectName: "verify-enable",
          passphrase: null,
        }),
      applied: async (s) => marker(s.id),
    },
    {
      id: "export",
      label: "POST /api/encryption export",
      key: "encryptionChanges",
      prep: async () => {
        await setSession(ctx, true);
        return { before: dirCount() };
      },
      send: (who) =>
        as(ctx, who, ctx.item, "POST /api/encryption export", "POST", "/api/encryption", {
          action: "export",
          projectId: ctx.encryptedId,
        }),
      applied: async (s) => dirCount() === s.before + 1,
    },
    {
      id: "purge-ids",
      label: "POST /api/project/[id]/trash/purge ids",
      key: "permanentDeletion",
      prep: async () => ({ rid: await trashedResource(ctx, P.id) }),
      send: (who, s) =>
        as(ctx, who, ctx.item, "POST trash/purge {ids}", "POST", `/api/project/${P.id}/trash/purge`, {
          ids: [s.rid],
        }),
      applied: async (s) => !(await trashIds(ctx, P.id)).includes(s.rid),
    },
    {
      id: "purge-all",
      label: "POST /api/project/[id]/trash/purge all:true",
      key: "permanentDeletion",
      prep: async () => ({ rid: await trashedResource(ctx, P.id) }),
      send: (who) =>
        as(ctx, who, ctx.item, "POST trash/purge {all:true}", "POST", `/api/project/${P.id}/trash/purge`, {
          all: true,
        }),
      applied: async () => (await trashIds(ctx, P.id)).length === 0,
    },
    {
      id: "revision-delete",
      label: "DELETE /api/resource/revision/[id]",
      key: "permanentDeletion",
      prep: async () => {
        const rid = await newResource(ctx, P.id);
        return { rid, revId: await newRevision(ctx, P.id, rid) };
      },
      send: (who, s) =>
        as(ctx, who, ctx.item, "DELETE revision", "DELETE", `/api/resource/revision/${s.rid}`, {
          projectId: P.id,
          revisionId: s.revId,
        }),
      applied: async (s) => {
        const r = await setupCall(
          ctx,
          "GET",
          `/api/resource/revision/${s.rid}?projectId=${P.id}&revisionId=${s.revId}`,
        );
        return r.status === 404 || r.status === 500;
      },
    },
  ];
}

const isRefusalShape = (r, key) =>
  r.status === 403 &&
  r.gate === null &&
  r.location === null &&
  r.json !== undefined &&
  Object.keys(r.json).sort().join(",") === "error,limit" &&
  typeof r.json.error === "string" &&
  r.json.error.length > 0 &&
  r.json.limit === key;

const isAllowed = (r) =>
  r.status === 200 && r.gate === null && !(r.json && "limit" in r.json);

const isNotPaired = (r) =>
  r.status === 401 &&
  r.gate === "not-paired" &&
  !(r.json && "limit" in r.json);

// ----------------------------------------------------------------- sections

async function runAction(ctx, item, who, action, expectation) {
  ctx.item = item;
  const state = await action.prep();
  const r = await action.send(who, state);
  const applied = action.applied ? await action.applied(state) : null;
  const tag = `${action.id} as ${who}`;
  if (expectation === "refused") {
    check(item, `${tag}: 403 {error, limit:${action.key}}, no gate header`, isRefusalShape(r, action.key), `status ${r.status}`);
    if (applied !== null) check(item, `${tag}: action not applied`, applied === false);
  } else if (expectation === "allowed") {
    check(item, `${tag}: 200, no refusal`, isAllowed(r), `status ${r.status}`);
    if (applied !== null) check(item, `${tag}: action applied`, applied === true);
  } else {
    check(item, `${tag}: 401 not-paired, no limit`, isNotPaired(r), `status ${r.status} gate ${r.gate}`);
    if (applied !== null) check(item, `${tag}: action not applied`, applied === false);
  }
  return r;
}

async function sectionA(ctx, actions) {
  await setLimits(ctx, all(true));
  for (const a of actions) await runAction(ctx, "a", "paired", a, "refused");
  // forged classification headers from a paired device do not change the answer
  for (const forged of ["window", "off"]) {
    ctx.item = "a";
    const s = await newProject(ctx);
    const r = await as(ctx, "paired", "a", `POST /api/project/delete (forged x-getwrite-classification: ${forged})`, "POST", "/api/project/delete", { projectId: s.id }, { "x-getwrite-classification": forged });
    check("a", `paired + forged classification "${forged}": still 403 projectDeletion`, isRefusalShape(r, "projectDeletion"), `status ${r.status}`);
    check("a", `paired + forged "${forged}": project still on disk`, existsSync(path.join(ctx.projectsDir, s.id, "project.json")));
  }
}

async function sectionB(ctx, actions) {
  for (const key of KEYS) {
    await setLimits(ctx, onlyOff(key));
    for (const a of actions.filter((x) => x.key === key)) {
      await runAction(ctx, "b", "paired", a, "allowed");
    }
  }
  // limits are independent: one key off does not allow another key's action
  const byId = (id) => actions.find((a) => a.id === id);
  await setLimits(ctx, onlyOff("unlocking"));
  await runAction(ctx, "b", "paired", byId("lock"), "refused");
  await setLimits(ctx, onlyOff("permanentDeletion"));
  await runAction(ctx, "b", "paired", byId("project-delete"), "refused");

  // enable with a non-null passphrase: refused in every state, even all off
  await setLimits(ctx, all(false));
  for (const unlocked of [true, false]) {
    await setSession(ctx, unlocked);
    const s = await newProject(ctx);
    const r = await as(ctx, "paired", "b", `POST /api/encryption enable (non-null passphrase, session ${unlocked ? "unlocked" : "locked"}, all limits off)`, "POST", "/api/encryption", {
      action: "enable",
      projectId: s.id,
      projectName: "verify-enable-refused",
      passphrase: "not-the-real-throwaway-passphrase",
    });
    check("b", `enable non-null passphrase, all five off, session ${unlocked ? "unlocked" : "locked"}: 403 encryptionChanges`, isRefusalShape(r, "encryptionChanges"), `status ${r.status}`);
    check("b", `enable non-null passphrase refused: project not encrypted`, !existsSync(path.join(ctx.projectsDir, s.id, ".encrypted.json")));
  }
  // the throwaway keyring was not replaced: the real passphrase still opens it
  await setSession(ctx, false);
  await setSession(ctx, true);
  check("b", "after the refused non-null enables the original passphrase still unlocks", await sessionUnlocked(ctx));
}

async function sectionC(ctx, actions) {
  for (const condition of ["all-five-on", "unreadable-chmod-0", "unreadable-directory"]) {
    if (condition === "all-five-on") await setLimits(ctx, all(true));
    else await makeUnreadable(ctx, condition.replace("unreadable-", ""));
    for (const a of actions) {
      await runAction(ctx, `c:${condition}`, "window", a, "allowed");
    }
  }
  clearLimitsFile(ctx);
}

async function sectionD(ctx, actions) {
  for (const state of ["all-five-on", "all-five-off"]) {
    await setLimits(ctx, all(state === "all-five-off" ? false : true));
    for (const a of actions) await runAction(ctx, `d:${state}`, "unpaired", a, "unpaired");
    const r = await as(ctx, "unpaired", `d:${state}`, "GET /api/sharing/limits", "GET", "/api/sharing/limits");
    check(`d:${state}`, "GET /api/sharing/limits unpaired: 401 not-paired", isNotPaired(r), `status ${r.status} gate ${r.gate}`);
  }
  await setLimits(ctx, all(true));
  for (const [who, a] of [
    ["made-up-cookie", actions.find((x) => x.id === "project-delete")],
    ["made-up-cookie", actions.find((x) => x.id === "purge-all")],
  ]) {
    await runAction(ctx, "d:made-up-cookie", who, a, "unpaired");
  }
  const r = await as(ctx, "made-up-cookie", "d:made-up-cookie", "GET /api/sharing/limits", "GET", "/api/sharing/limits");
  check("d:made-up-cookie", "GET /api/sharing/limits with a made-up cookie: 401 not-paired", isNotPaired(r), `status ${r.status} gate ${r.gate}`);
}

async function sectionF(ctx, actions) {
  const byId = (id) => actions.find((a) => a.id === id);
  const readLimit = async () => {
    const r = await as(ctx, "paired", "f", "GET /api/sharing/limits", "GET", "/api/sharing/limits");
    return r.json?.limits?.unlocking;
  };
  const resume = byId("resume");
  ctx.item = "f";
  await setSession(ctx, true);
  const steps = [
    ["on", true, "refused"],
    ["off", false, "allowed"],
    ["on", true, "refused"],
    ["off", false, "allowed"],
  ];
  for (const [name, value, expectation] of steps) {
    await setLimits(ctx, { ...all(true), unlocking: value });
    const r = await resume.send("paired", {});
    const ok = expectation === "refused" ? isRefusalShape(r, "unlocking") : isAllowed(r);
    check("f", `resume, writer set unlocking ${name}, very next request: ${expectation}`, ok, `status ${r.status}`);
    check("f", `GET /api/sharing/limits, very next request, unlocking=${value}`, (await readLimit()) === value);
  }
  // a destructive action: same project, refused then allowed with no restart
  const s = await newProject(ctx);
  const del = (label) =>
    as(ctx, "paired", "f", label, "POST", "/api/project/delete", { projectId: s.id });
  await setLimits(ctx, { ...all(true), projectDeletion: true });
  let r = await del("POST /api/project/delete (projectDeletion on)");
  check("f", "project delete, projectDeletion on: 403 and project present", isRefusalShape(r, "projectDeletion") && existsSync(path.join(ctx.projectsDir, s.id, "project.json")));
  await ctx.writer.setLimit(ctx.sharingDir, "projectDeletion", false);
  r = await del("POST /api/project/delete (projectDeletion flipped off)");
  check("f", "project delete, writer flipped projectDeletion off: 200 and project gone", isAllowed(r) && !existsSync(path.join(ctx.projectsDir, s.id, "project.json")));
}

async function sectionG(ctx, actions) {
  const resume = actions.find((a) => a.id === "resume");
  const lock = actions.find((a) => a.id === "lock");
  const read = (who, state) =>
    as(ctx, who, `g:${state}`, "GET /api/sharing/limits", "GET", "/api/sharing/limits");
  const same = (json, expected) =>
    json && KEYS.every((k) => json.limits?.[k] === expected[k]);

  await setLimits(ctx, all(true));
  let r = await read("window", "window");
  check("g:window", "window: {role:'exempt'}, no limits field, no-store", r.status === 200 && r.json?.role === "exempt" && !("limits" in r.json) && /no-store/.test(r.cacheControl ?? ""));
  await makeUnreadable(ctx, "chmod-0");
  r = await read("window", "window, file unreadable");
  check("g:window-unreadable", "window with unreadable file: {role:'exempt'}", r.status === 200 && r.json?.role === "exempt");
  clearLimitsFile(ctx);

  await setLimits(ctx, all(true));
  r = await read("paired", "all on");
  check("g:all-on", "paired, all on: role paired, five true, no-store", r.status === 200 && r.json?.role === "paired" && same(r.json, all(true)) && /no-store/.test(r.cacheControl ?? ""));
  const mixed = { projectDeletion: false, unlocking: true, locking: false, encryptionChanges: true, permanentDeletion: false };
  await setLimits(ctx, mixed);
  r = await read("paired", "some off");
  check("g:some-off", "paired, some off: five booleans match the file", r.status === 200 && r.json?.role === "paired" && same(r.json, mixed));
  clearLimitsFile(ctx);
  r = await read("paired", "file missing");
  check("g:missing", "paired, file missing: role paired, all five true", r.status === 200 && r.json?.role === "paired" && same(r.json, all(true)));
  for (const variant of ["chmod-0", "directory"]) {
    await makeUnreadable(ctx, variant);
    r = await read("paired", `file unreadable (${variant})`);
    check(`g:unreadable-${variant}`, `paired, file unreadable (${variant}): role paired, all five true`, r.status === 200 && r.json?.role === "paired" && same(r.json, all(true)));
    for (const a of [resume, lock]) {
      await runAction(ctx, `g:unreadable-${variant}`, "paired", a, "refused");
    }
  }
  clearLimitsFile(ctx);
  r = await read("unpaired", "unpaired");
  check("g:unpaired", "unpaired: 401 not-paired", isNotPaired(r), `status ${r.status} gate ${r.gate}`);
}

async function sectionH(ctx) {
  const P = ctx.fixtures;
  await setLimits(ctx, all(true));
  const p = (label, method, urlPath, body) =>
    as(ctx, "paired", "h", label, method, urlPath, body);
  let r = await p("GET /api/encryption", "GET", "/api/encryption");
  check("h", "paired, all five on: GET /api/encryption 200", isAllowed(r), `status ${r.status}`);
  r = await p("GET /api/projects", "GET", "/api/projects");
  check("h", "paired, all five on: GET /api/projects 200", isAllowed(r), `status ${r.status}`);
  const rid = await trashedResource(ctx, P.id);
  r = await p("GET trash list", "GET", `/api/project/${P.id}/trash`);
  check("h", "paired, all five on: Trash list 200", isAllowed(r), `status ${r.status}`);
  r = await p("POST trash/restore", "POST", `/api/project/${P.id}/trash/restore`, { ids: [rid] });
  check("h", "paired, all five on: Trash restore 200 and item restored", isAllowed(r) && r.json?.results?.[0]?.ok === true && !(await trashIds(ctx, P.id)).includes(rid), `status ${r.status}`);
  const soft = await newResource(ctx, P.id);
  r = await p("POST resource delete (soft)", "POST", `/api/resource/${soft}/delete`, { projectId: P.id });
  check("h", "paired, all five on: resource soft delete 200 and item in Trash", isAllowed(r) && (await trashIds(ctx, P.id)).includes(soft), `status ${r.status}`);
  // Folder soft delete. A leaf folder is the check; the other folder deletes
  // are recorded observations (OBS lines), not pass/fail checks.
  const isLeaf = (f) => !P.folders.some((g) => g.parentId === f.id);
  const leaf = P.folders.find(isLeaf);
  const inner = P.folders.find((f) => !isLeaf(f));
  const why = (x) =>
    typeof x.json?.details === "string"
      ? x.json.details.split(ctx.projectsDir).join("<projects>")
      : "(no details)";
  if (leaf === undefined) {
    check("h", "fixture project has a leaf folder for the folder soft delete", false);
  } else {
    r = await p("POST folder delete (soft), leaf folder", "POST", `/api/folder/${leaf.id}/delete`, { projectId: P.id });
    check("h", "paired, all five on: leaf folder soft delete 200 and folder in Trash", isAllowed(r) && (await trashIds(ctx, P.id)).includes(leaf.id), `status ${r.status}${r.status === 200 ? "" : ` details: ${why(r)}`}`);
  }
  if (inner !== undefined) {
    r = await p("POST folder delete (soft), folder with children", "POST", `/api/folder/${inner.id}/delete`, { projectId: P.id });
    console.log(`OBS paired, all five on, folder with children: status ${r.status}, gate ${r.gate ?? "-"}, limit ${r.json?.limit ?? "-"}${r.status === 200 ? "" : ` details: ${why(r)}`}`);
    // first attempts on fresh projects, so no earlier attempt has changed anything
    const withChildren = (fs) => fs.find((f) => fs.some((g) => g.parentId === f.id));
    const fresh = await newProject(ctx, "novel");
    r = await as(ctx, "window", "h", "POST folder delete (soft), folder with children, fresh project", "POST", `/api/folder/${withChildren(fresh.folders).id}/delete`, { projectId: fresh.id });
    console.log(`OBS window, fresh project, folder with children, first attempt: status ${r.status}${r.status === 200 ? "" : ` details: ${why(r)}`}`);
    const pre = await newProject(ctx, "novel");
    mkdirSync(path.join(ctx.projectsDir, pre.id, ".trash", "folders"), { recursive: true });
    r = await as(ctx, "paired", "h", "POST folder delete (soft), folder with children, .trash/folders pre-created", "POST", `/api/folder/${withChildren(pre.folders).id}/delete`, { projectId: pre.id });
    console.log(`OBS paired, all five on, fresh project with .trash/folders created beforehand, first attempt: status ${r.status}${r.status === 200 ? "" : ` details: ${why(r)}`}`);
  }
  // revision GET and PATCH (preserve) are not limited (FR-12)
  const keep = await newResource(ctx, P.id);
  const revId = await newRevision(ctx, P.id, keep);
  r = await p("GET revision", "GET", `/api/resource/revision/${keep}?projectId=${P.id}&revisionId=${revId}`);
  check("h", "paired, all five on: GET revision 200", isAllowed(r), `status ${r.status}`);
  r = await p("PATCH revision {preserve:true}", "PATCH", `/api/resource/revision/${keep}`, { projectId: P.id, revisionId: revId, preserve: true });
  check("h", "paired, all five on: PATCH revision (preserve) 200", isAllowed(r), `status ${r.status}`);
}

async function sectionE(ctx, actions) {
  // sharing off: the classification is "off"; the limits file is present, all on
  await setLimits(ctx, all(true));
  let r = await as(ctx, "unpaired", "e", "GET /api/sharing/limits", "GET", "/api/sharing/limits");
  check("e", "sharing off: GET /api/sharing/limits is {role:'exempt'}", r.status === 200 && r.json?.role === "exempt" && !("limits" in r.json), `status ${r.status}`);
  for (const a of actions) await runAction(ctx, "e", "unpaired", a, "allowed");
  await makeUnreadable(ctx, "chmod-0");
  for (const a of actions.filter((x) => x.id === "lock" || x.id === "project-delete")) {
    await runAction(ctx, "e:unreadable", "unpaired", a, "allowed");
  }
  clearLimitsFile(ctx);
}

// --------------------------------------------------------------------- main

export function assertThrowaway(root) {
  const real = realpathSync(root);
  const tmp = realpathSync(tmpdir());
  const owner = path.join(homedir(), "Library", "Application Support", "getwrite-electron");
  if (!real.startsWith(tmp + path.sep) || real.startsWith(owner)) {
    throw new Error("throwaway root is not under os.tmpdir()");
  }
}

async function main() {
  if (port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const require = createRequire(import.meta.url);
  const writer = require(WRITER);
  const root = mkdtempSync(path.join(tmpdir(), "gw-limits-"));
  assertThrowaway(root);
  const projectsDir = path.join(root, "projects");
  const sharingDir = path.join(root, "sharing");
  mkdirSync(projectsDir);
  mkdirSync(sharingDir);
  assertThrowaway(projectsDir);
  assertThrowaway(sharingDir);
  const secret = randomBytes(32).toString("hex");
  const passphrase = randomBytes(18).toString("base64url");
  console.log(`mode=${mode} node=${process.version} throwaway root under os.tmpdir() (name withheld)`);
  console.log("hosted-auth variables (DATABASE_URL, BETTER_AUTH_SECRET): not set, hosted mode not run");

  const entries = await enumerationCount();
  console.log(`enumeration (smoke-script rules) entries: ${entries.length}; includes GET /api/sharing/limits: ${entries.includes("GET /api/sharing/limits")}`);

  let childA;
  let childB;
  try {
    // ---- server A: sharing on
    const portA = await freePort();
    const A = makeCtx({ base: `http://127.0.0.1:${portA}`, window: { "x-getwrite-window": secret } });
    Object.assign(A, { writer, sharingDir, projectsDir, passphrase });
    childA = startServer(portA, {
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_PROJECTS_DIR: projectsDir,
    });
    console.log(`server A (sharing on) pid=${childA.pid} port=${portA}`);
    await waitReady(A, childA);
    await pairDevice(A, sharingDir);

    // ---- fixtures
    A.fixtures = await newProject(A, "novel");
    const enc = await newProject(A);
    A.encryptedId = enc.id;
    const created = await setupCall(A, "POST", "/api/encryption", {
      action: "enable",
      projectId: enc.id,
      projectName: "verify-encrypted",
      passphrase,
    });
    check("setup", "throwaway encrypted project created through the window", created.status === 200 && existsSync(path.join(projectsDir, enc.id, ".encrypted.json")), `status ${created.status}`);
    check("setup", "fixture project has at least one folder", A.fixtures.folders.length > 0);

    const actions = buildActions(A);
    await sectionA(A, actions);
    await sectionB(A, actions);
    await sectionC(A, actions);
    await sectionD(A, actions);
    await sectionF(A, actions);
    await sectionG(A, actions);
    await sectionH(A);

    stopServer(childA);
    started.splice(started.indexOf(childA.pid), 1);
    await sleep(2000);

    // ---- server B: sharing off, same throwaway folders
    const portB = await freePort();
    const B = makeCtx({ base: `http://127.0.0.1:${portB}`, window: {} });
    Object.assign(B, { writer, sharingDir, projectsDir, passphrase, fixtures: A.fixtures, encryptedId: A.encryptedId });
    childB = startServer(portB, {
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_PROJECTS_DIR: projectsDir,
    });
    console.log(`server B (sharing off) pid=${childB.pid} port=${portB}`);
    await waitReady(B, childB);
    await sectionE(B, buildActions(B));
  } finally {
    for (const c of [childA, childB]) if (c && started.includes(c.pid)) stopServer(c);
    await sleep(2500);
    const left = groupMembers();
    console.log(`process-group members still alive after stop: ${left.length === 0 ? "none" : left.join(",")}`);
    rmSync(root, { recursive: true, force: true });
    console.log(`throwaway root removed: ${!existsSync(root)}`);
  }

  const failed = checks.filter((c) => !c.ok);
  const items = [...new Set(checks.map((c) => c.item))];
  for (const item of items) {
    const group = checks.filter((c) => c.item === item);
    console.log(`SUMMARY [${item}] ${group.filter((c) => c.ok).length}/${group.length} passed`);
  }
  console.log(`measured requests: ${counts.measured}; setup requests: ${counts.setup}; checks: ${checks.length}; failed: ${failed.length}`);
  for (const f of failed) console.log(`FAILED [${f.item}] ${f.name}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

if (isEntry) main().catch((e) => {
  console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`);
  for (const pid of started) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  process.exit(1);
});
