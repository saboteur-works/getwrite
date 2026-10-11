#!/usr/bin/env node
/**
 * Feature 77, Task 29: the real Electron app toggling each limit switch.
 *
 * Usage: node electron-limits.mjs <dev|packaged>
 *
 * "dev" runs `electron dist/main.js` (isPackaged false) from a copy of
 * electron/dist placed in a throwaway fake repo root, because a development
 * build keeps its projects in `<repo root>/projects` and has no override; the
 * fake root holds a copy of electron/dist, electron/package.json, symlinks to
 * the real frontend/ and getwrite-config/, and an empty projects/. "packaged"
 * runs dist-electron/mac-arm64/GetWrite.app (built with
 * `pnpm exec electron-builder --config electron-builder.yml --dir` in
 * electron/) with `workspace.json` in the throwaway user-data folder pointing
 * at a throwaway projects folder.
 *
 * Needs: `pnpm build` in frontend/ with .next/static copied into
 * .next/standalone/frontend/.next/static (packaged build only needs it at
 * packaging time), `pnpm build && pnpm build:worker` in electron/,
 * @playwright/test (resolved from frontend/package.json). The Electron app and
 * its servers must be launched outside the command sandbox.
 *
 * Safety: refuses to run while anything listens on port 3000 (the app uses
 * 3000). Records the pid it started and the descendants it can attribute to it
 * by parent pid; stops only those. Everything lives under a throwaway root in
 * os.tmpdir(); the owner's ~/Library/Application Support/getwrite-electron is
 * never read or written (paths are asserted before anything is touched).
 *
 * Output: step labels, status codes, `limit` keys, key/boolean views of the
 * limits file, fixed copy strings. Never a cookie, window secret, pairing
 * code, passphrase or response body text. The paired device is paired through
 * the app's own flow: the code shown by "Show a pairing code" is read from the
 * window and typed into POST /api/sharing/pair from this script. Sharing is
 * switched on by seeding `sharingEnabled: true` in the throwaway
 * workspace.json before launch (the app's own switch needs a restart, which a
 * driven app cannot survive).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const MODE = process.argv[2];
if (MODE !== "dev" && MODE !== "packaged") {
  console.error("usage: electron-limits.mjs <dev|packaged>");
  process.exit(2);
}
// verify-limits.mjs reads its own mode from argv[2]; set it before importing.
process.argv[2] = "standalone";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V = await import(path.join(HERE, "verify-limits.mjs"));
const REPO = path.resolve(HERE, "../../../..");
const nodeRequire = createRequire(path.join(REPO, "frontend/package.json"));
const { _electron } = nodeRequire("@playwright/test");

const ELECTRON_BIN = path.join(
  REPO,
  "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
const PACKAGED_BIN = path.join(
  REPO,
  "dist-electron/mac-arm64/GetWrite.app/Contents/MacOS/GetWrite",
);
const BASE = "http://127.0.0.1:3000";
const KEYS = V.KEYS;
const LABEL = {
  projectDeletion: "Limit project deletion",
  unlocking: "Limit unlocking",
  locking: "Limit locking",
  encryptionChanges: "Limit encryption changes",
  permanentDeletion: "Limit permanent deletion",
};
// Copy strings, as in frontend/components/Sharing/sharing-copy.ts.
const COPY = {
  heading: "What paired devices may do",
  warnTyped: "The passphrase is typed on the paired device.",
  warnUnenc:
    "It is sent over the unencrypted connection, where others on the network could record it.",
  warnRecorded:
    "A recorded passphrase also unlocks the files at rest, such as a stolen disk or backup.",
  confirmTitle: "Turn off Limit unlocking?",
  confirm: "Turn off Limit unlocking",
  keep: "Keep Limit unlocking on",
  unreadable:
    "The file that holds these limits cannot be read, so every limit is on until it is repaired. A change here is refused while it cannot be read.",
  refused:
    "The change was not made: the limits file cannot be read, and it was left as it is.",
};
const say = (s) => console.log(s);
const check = V.check;
const sleep = V.sleep;

// ---------------------------------------------------------------- processes

function psTable() {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
}
const known = new Map(); // pid -> comm, only what descends from the pid we started
function recordTree(rootPid) {
  const table = psTable();
  const set = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of table) {
      if (set.has(p.ppid) && !set.has(p.pid)) {
        set.add(p.pid);
        grew = true;
      }
    }
  }
  for (const p of table) if (set.has(p.pid)) known.set(p.pid, p.comm);
  return set;
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
function listenerPids() {
  try {
    return execFileSync("lsof", ["-iTCP:3000", "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

// -------------------------------------------------------------- file helpers

let USERDATA;
let PROJECTS;
const limitsFile = () => path.join(USERDATA, "sharing-limits.json");

/** Keys and booleans only; any non-boolean is shown as its type. */
function snap() {
  const p = limitsFile();
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return "absent";
  }
  if (st.isDirectory()) return "a directory";
  let text;
  try {
    text = readFileSync(p, "utf8");
  } catch (e) {
    return `unreadable (${e.code}, mode ${(st.mode & 0o777).toString(8)})`;
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return "present, not JSON";
  }
  const show = (v) => (typeof v === "boolean" ? String(v) : typeof v === "number" ? String(v) : `<${typeof v}>`);
  const top = Object.keys(j).sort();
  const lim = j && typeof j.limits === "object" && j.limits ? j.limits : {};
  const lims = Object.keys(lim).sort().map((k) => `${k}=${show(lim[k])}`);
  return `top-level keys [${top.join(",")}]; version=${show(j.version)}; limits {${lims.join(", ")}}`;
}
function limitsOf(key) {
  try {
    const j = JSON.parse(readFileSync(limitsFile(), "utf8"));
    return j.limits?.[key];
  } catch {
    return undefined;
  }
}
const fileHash = () => {
  try {
    return createHash("sha256").update(readFileSync(limitsFile())).digest("hex");
  } catch {
    return "none";
  }
};
function clearFile() {
  try {
    chmodSync(limitsFile(), 0o600);
  } catch {
    // absent or a directory
  }
  rmSync(limitsFile(), { recursive: true, force: true });
}

// ---------------------------------------------------------------------- main

let app;
let page;
const ctx = { base: BASE, window: {}, cookie: null };

const callWin = (method, p, body) =>
  page.evaluate(
    async ({ method, p, body }) => {
      const res = await fetch(p, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json;
      try {
        json = await res.json();
      } catch {
        json = undefined;
      }
      return { status: res.status, gate: res.headers.get("x-getwrite-gate"), json };
    },
    { method, p, body },
  );
const callPaired = (method, p, body) =>
  V.request(ctx, method, p, { cookie: ctx.cookie }, body, false);

function row(step, label, who, r) {
  say(
    `ROW ${JSON.stringify({
      mode: MODE,
      step,
      request: label,
      caller: who,
      status: r.status,
      gate: r.gate ?? "-",
      limit: r.json && typeof r.json.limit === "string" ? r.json.limit : "-",
    })}`,
  );
}
const isRefusal = (r, key) =>
  r.status === 403 &&
  !r.gate &&
  r.json &&
  Object.keys(r.json).sort().join(",") === "error,limit" &&
  r.json.limit === key;
const isAllowed = (r) => r.status === 200 && !r.gate && !(r.json && "limit" in r.json);

const dirs = () => readdirSync(PROJECTS).filter((d) => !d.startsWith("."));
async function newProject() {
  const before = new Set(dirs());
  const r = await callWin("POST", "/api/projects", { name: `limits-${before.size}`, projectType: "blank" });
  const added = dirs().filter((d) => !before.has(d));
  if (r.status !== 200 || added.length !== 1) throw new Error(`fixture project failed (${r.status})`);
  return added[0];
}
async function unlocked() {
  const r = await callWin("GET", "/api/encryption");
  if (r.status !== 200) throw new Error(`encryption status ${r.status}`);
  return r.json.isUnlocked === true;
}
let passphrase;
async function ensureSession(want) {
  if ((await unlocked()) === want) return;
  const r = await callWin("POST", "/api/encryption", want ? { action: "unlock", passphrase } : { action: "lock" });
  if (r.status !== 200) throw new Error(`session change ${r.status}`);
}
let FX; // fixture project for the trash
async function trashed() {
  const c = await callWin("POST", "/api/resource", {
    projectId: FX,
    resourceData: { name: "res", type: "text", folderId: null, text: { plainText: "words to keep" } },
  });
  const rid = c.json?.resource?.id;
  if (c.status !== 200 || typeof rid !== "string") throw new Error(`fixture resource ${c.status}`);
  const d = await callWin("POST", `/api/resource/${rid}/delete`, { projectId: FX });
  if (d.status !== 200) throw new Error(`fixture soft delete ${d.status}`);
  return rid;
}

const ACTIONS = {
  projectDeletion: {
    label: "POST /api/project/delete",
    prep: async () => ({ id: await newProject() }),
    send: (s, call) => call("POST", "/api/project/delete", { projectId: s.id }),
    applied: async (s) => !existsSync(path.join(PROJECTS, s.id, "project.json")),
  },
  unlocking: {
    label: "POST /api/encryption unlock",
    prep: async () => (await ensureSession(false), {}),
    send: (s, call) => call("POST", "/api/encryption", { action: "unlock", passphrase }),
    applied: async () => (await unlocked()) === true,
  },
  locking: {
    label: "POST /api/encryption lock",
    prep: async () => (await ensureSession(true), {}),
    send: (s, call) => call("POST", "/api/encryption", { action: "lock" }),
    applied: async () => (await unlocked()) === false,
  },
  encryptionChanges: {
    label: "POST /api/encryption enable (passphrase null)",
    prep: async () => (await ensureSession(true), { id: await newProject() }),
    send: (s, call) =>
      call("POST", "/api/encryption", { action: "enable", projectId: s.id, projectName: "x", passphrase: null }),
    applied: async (s) => existsSync(path.join(PROJECTS, s.id, ".encrypted.json")),
  },
  permanentDeletion: {
    label: "POST trash/purge {ids}",
    prep: async () => ({ rid: await trashed() }),
    send: (s, call) => call("POST", `/api/project/${FX}/trash/purge`, { ids: [s.rid] }),
    applied: async (s) => {
      const r = await callWin("GET", `/api/project/${FX}/trash`);
      return ![...(r.json?.resources ?? []), ...(r.json?.folders ?? [])].map((x) => x.id).includes(s.rid);
    },
  },
};

/** One action by `who` ("paired" or "window"); expectation "refused" | "allowed". */
async function exercise(item, step, key, who, expectation) {
  const a = ACTIONS[key];
  const s = await a.prep();
  const r = await a.send(s, who === "paired" ? callPaired : callWin);
  row(step, a.label, who, r);
  const applied = await a.applied(s);
  if (expectation === "refused") {
    check(item, `${step}: ${who} ${a.label}: 403 {error, limit:${key}}, no gate header`, isRefusal(r, key), `status ${r.status}`);
    check(item, `${step}: ${who} ${a.label}: action not applied`, applied === false);
  } else {
    check(item, `${step}: ${who} ${a.label}: 200, no refusal`, isAllowed(r), `status ${r.status}`);
    check(item, `${step}: ${who} ${a.label}: action applied`, applied === true);
  }
}

// ---------------------------------------------------------------- UI helpers

const sw = (key) => page.getByRole("switch", { name: LABEL[key], exact: true });
const visibleCount = (text) =>
  page.getByText(text, { exact: true }).evaluateAll((els) =>
    els.filter((e) => e.getClientRects().length > 0).length,
  );

async function settleOverlays() {
  const skip = page.getByRole("button", { name: "Continue without unlocking" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    say("dismissed the unlock dialog with 'Continue without unlocking'");
  }
}
async function openSettings() {
  await settleOverlays();
  await page.getByRole("button", { name: "App Settings", exact: true }).click();
  await page.getByText(COPY.heading, { exact: true }).waitFor({ timeout: 60000 });
  await page.getByLabel("Home network sharing").getByText("Sharing is on", { exact: true }).waitFor({ timeout: 60000 });
  // either the switches or the unreadable text is shown once the read returns
  await page
    .getByText(/A switch that is on stops paired devices/)
    .waitFor({ timeout: 60000 });
}
async function closeSettings() {
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "App Settings" }).waitFor({ state: "hidden", timeout: 30000 });
}
async function reopenSettings() {
  await closeSettings();
  await openSettings();
}
const stateText = (key, on) => `${LABEL[key]} is now ${on ? "on" : "off"}.`;
async function allChecked() {
  const out = {};
  for (const k of KEYS) out[k] = await sw(k).isChecked();
  return out;
}

async function pairedLimits() {
  const r = await callPaired("GET", "/api/sharing/limits");
  return r.status === 200 && r.json?.role === "paired" ? r.json.limits : null;
}

// ------------------------------------------------------------- per-key section

async function toggleKey(key) {
  const item = `switch:${key}`;
  const pidBefore = listenerPids().join(",");
  const appPid = app.process().pid;
  say(`--- ${key}: file before: ${snap()}; UI checked=${await sw(key).isChecked()}`);
  const pre = await pairedLimits();
  check(item, "paired GET /api/sharing/limits reports this limit on before the toggle", pre !== null && pre[key] === true);
  await exercise(item, "on, before", key, "paired", "refused");

  if (key === "unlocking") {
    check(item, "warning: three statements visible with Limit unlocking on", (await visibleCount(COPY.warnTyped)) === 1 && (await visibleCount(COPY.warnUnenc)) === 1 && (await visibleCount(COPY.warnRecorded)) === 1);
    // cancel path
    const h = fileHash();
    await sw(key).click();
    await page.getByText(COPY.confirmTitle, { exact: true }).waitFor({ timeout: 15000 });
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    say(`confirmation dialog open; element holding focus has text: ${JSON.stringify(focused)}`);
    check(item, "confirmation shows the three warning statements", (await visibleCount(COPY.warnTyped)) === 2 && (await visibleCount(COPY.warnUnenc)) === 2 && (await visibleCount(COPY.warnRecorded)) === 2);
    await page.getByRole("button", { name: COPY.keep, exact: true }).click();
    await page.getByText(COPY.confirmTitle, { exact: true }).waitFor({ state: "hidden", timeout: 15000 });
    await sleep(1500);
    check(item, "cancel ('Keep Limit unlocking on'): dialog closed, switch still on", await sw(key).isChecked());
    check(item, "cancel: limits file byte-identical (sha256 equal)", fileHash() === h);
    say(`file after cancel: ${snap()}`);
    await exercise(item, "after cancel", key, "paired", "refused");
  }

  // off through the UI
  await sw(key).click();
  if (key === "unlocking") {
    await page.getByText(COPY.confirmTitle, { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: COPY.confirm, exact: true }).click();
  }
  await page.getByText(stateText(key, false), { exact: true }).waitFor({ timeout: 30000 });
  check(item, key === "unlocking" ? "confirmation appeared for Limit unlocking OFF" : "no confirmation dialog for this switch OFF", key === "unlocking" ? true : (await visibleCount(COPY.confirmTitle)) === 0);
  say(`file after OFF: ${snap()}`);
  check(item, "file: this key false after OFF", limitsOf(key) === false);
  check(item, "file: the other four unchanged (true)", KEYS.filter((k) => k !== key).every((k) => limitsOf(k) === true));
  check(item, "UI switch shows off", (await sw(key).isChecked()) === false);
  const mid = await pairedLimits();
  check(item, "paired GET /api/sharing/limits reports this limit off, no restart", mid !== null && mid[key] === false);
  await exercise(item, "off", key, "paired", "allowed");
  if (key === "unlocking") {
    check(item, "warning: three statements visible with Limit unlocking off", (await visibleCount(COPY.warnTyped)) === 1 && (await visibleCount(COPY.warnUnenc)) === 1 && (await visibleCount(COPY.warnRecorded)) === 1);
  }

  // on through the UI
  await sw(key).click();
  await page.getByText(stateText(key, true), { exact: true }).waitFor({ timeout: 30000 });
  check(item, "no confirmation dialog for switching ON", (await visibleCount(COPY.confirmTitle)) === 0);
  say(`file after ON: ${snap()}`);
  check(item, "file: all five true after ON", KEYS.every((k) => limitsOf(k) === true));
  check(item, "UI switch shows on", await sw(key).isChecked());
  await exercise(item, "on, again", key, "paired", "refused");
  const pidAfter = listenerPids().join(",");
  check(item, "same app pid alive and same listener on 3000 throughout (no restart)", pidBefore === pidAfter && alive(appPid), `listener ${pidBefore || "none"} -> ${pidAfter || "none"}`);
}

// ------------------------------------------------------------ file-state section

async function expectAllOnInUi(item, tag) {
  const st = await allChecked();
  check(item, `${tag}: all five switches show on`, KEYS.every((k) => st[k] === true));
}

async function unreadableSection(variant) {
  const item = `unreadable:${variant}`;
  clearFile();
  if (variant === "chmod-0") {
    // contents say every limit is off, so a fall-back to contents would show
    writeFileSync(limitsFile(), JSON.stringify({ version: 1, limits: Object.fromEntries(KEYS.map((k) => [k, false])) }));
    chmodSync(limitsFile(), 0o000);
  } else {
    mkdirSync(limitsFile());
  }
  say(`--- ${item}: file made unreadable by the script: ${snap()}`);
  await reopenSettings();
  check(item, "unreadable message shown", (await visibleCount(COPY.unreadable)) === 1);
  const loc = await page.getByText(/^The file is in .*\.$/).allInnerTexts();
  check(item, "location sentence names the throwaway user-data folder", loc.some((t) => t === `The file is in ${USERDATA}.`), `${loc.length} location sentence(s) on screen`);
  await expectAllOnInUi(item, "unreadable file");
  const lim = await pairedLimits();
  check(item, "paired GET /api/sharing/limits: all five true", lim !== null && KEYS.every((k) => lim[k] === true));
  await exercise(item, "unreadable", "locking", "paired", "refused");
  await exercise(item, "unreadable", "projectDeletion", "paired", "refused");
  const stBefore = lstatSync(limitsFile());
  await sw("locking").click();
  await page.getByText(COPY.refused, { exact: true }).waitFor({ timeout: 30000 });
  check(item, "change refused with a visible message", true);
  check(item, "switch still shows on after the refused change", await sw("locking").isChecked());
  const stAfter = lstatSync(limitsFile());
  check(item, "file untouched (same inode, mtime, size and kind)", stAfter.ino === stBefore.ino && stAfter.mtimeMs === stBefore.mtimeMs && stAfter.size === stBefore.size && stAfter.isDirectory() === stBefore.isDirectory(), snap());
  await exercise(item, "unreadable", "locking", "window", "allowed");
  await exercise(item, "unreadable", "projectDeletion", "window", "allowed");
  const w = await callWin("GET", "/api/sharing/limits");
  row(item, "GET /api/sharing/limits", "window", w);
  check(item, "window reads {role:'exempt'} while the file is unreadable", w.status === 200 && w.json?.role === "exempt");
}

async function overwriteSection(item, prepare) {
  clearFile();
  prepare();
  say(`--- ${item}: file made by the script: ${snap()}`);
  await reopenSettings();
  check(item, "unreadable message NOT shown", (await visibleCount(COPY.unreadable)) === 0);
  await expectAllOnInUi(item, item);
  const lim = await pairedLimits();
  check(item, "paired GET /api/sharing/limits: all five true", lim !== null && KEYS.every((k) => lim[k] === true));
  await exercise(item, "before the change", "locking", "paired", "refused");
  await sw("locking").click();
  await page.getByText(stateText("locking", false), { exact: true }).waitFor({ timeout: 30000 });
  say(`file after the change: ${snap()}`);
  check(item, "file now valid, locking false, the other four true", limitsOf("locking") === false && KEYS.filter((k) => k !== "locking").every((k) => limitsOf(k) === true));
  await exercise(item, "after the change", "locking", "paired", "allowed");
  await sw("locking").click();
  await page.getByText(stateText("locking", true), { exact: true }).waitFor({ timeout: 30000 });
  check(item, "switched back on: file all five true", KEYS.every((k) => limitsOf(k) === true));
}

// ---------------------------------------------------------------------- run

async function main() {
  if (V.port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const root = mkdtempSync(path.join(tmpdir(), "gw-electron-"));
  V.assertThrowaway(root);
  const realRoot = realpathSync(root);
  USERDATA = path.join(realRoot, "userdata");
  mkdirSync(USERDATA);
  const ownerDir = path.join(homedir(), "Library", "Application Support", "getwrite-electron");
  let bin;
  let args;
  let seed;
  if (MODE === "dev") {
    const fake = path.join(realRoot, "repo");
    PROJECTS = path.join(fake, "projects");
    mkdirSync(path.join(fake, "electron"), { recursive: true });
    mkdirSync(PROJECTS);
    cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
    cpSync(path.join(REPO, "electron/package.json"), path.join(fake, "electron/package.json"));
    symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
    symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
    bin = ELECTRON_BIN;
    args = [path.join(fake, "electron"), `--user-data-dir=${USERDATA}`];
    seed = { sharingEnabled: true };
  } else {
    PROJECTS = path.join(realRoot, "projects");
    mkdirSync(PROJECTS);
    bin = PACKAGED_BIN;
    args = [`--user-data-dir=${USERDATA}`];
    seed = { sharingEnabled: true, projectsDir: PROJECTS };
    const bundled = path.join(path.dirname(PACKAGED_BIN), "..", "Resources", "projects");
    if (existsSync(bundled)) throw new Error("legacy in-bundle projects folder exists; refusing");
  }
  for (const p of [USERDATA, PROJECTS]) {
    V.assertThrowaway(p);
    if (realpathSync(p).startsWith(ownerDir)) throw new Error("path inside the owner's userData");
  }
  if (!existsSync(bin)) throw new Error(`executable missing: ${path.relative(REPO, bin)}`);
  writeFileSync(path.join(USERDATA, "workspace.json"), `${JSON.stringify(seed, null, 2)}\n`);
  passphrase = randomBytes(18).toString("base64url");
  say(`mode=${MODE} node=${process.version} throwaway root under os.tmpdir() (name withheld)`);
  say(`seeded workspace.json keys: ${Object.keys(seed).join(",")} (sharingEnabled=true)`);

  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE"]) delete env[k];

  let startedPid;
  try {
    app = await _electron.launch({ executablePath: bin, args, env, timeout: 300000 });
    startedPid = app.process().pid;
    known.set(startedPid, "electron-main");
    say(`started pid=${startedPid}`);
    const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), packaged: a.isPackaged }));
    if (realpathSync(info.ud) !== USERDATA || info.ud.startsWith(ownerDir)) {
      throw new Error("app.getPath('userData') is not the throwaway folder; stopping");
    }
    check("setup", "app.getPath('userData') equals the throwaway folder (asserted before anything else)", true);
    check("setup", `isPackaged is ${MODE === "packaged"}`, info.packaged === (MODE === "packaged"));

    page = await app.firstWindow();
    await page.waitForURL(/^http:\/\/localhost:3000\//, { timeout: 300000 });
    await page.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 300000 });
    recordTree(startedPid);
    const lis = listenerPids();
    check("setup", "the listener on 3000 descends from the pid this script started", lis.length > 0 && lis.every((p) => known.has(p)), `listener(s) ${lis.join(",")}`);
    say(`window url origin: ${new URL(page.url()).origin}`);

    // fixtures through the window (never limited)
    const enc = await newProject();
    const made = await callWin("POST", "/api/encryption", { action: "enable", projectId: enc, projectName: "limits-encrypted", passphrase });
    check("setup", "throwaway encrypted project created through the window", made.status === 200 && existsSync(path.join(PROJECTS, enc, ".encrypted.json")), `status ${made.status}`);
    FX = await newProject();
    const wl = await callWin("GET", "/api/sharing/limits");
    row("setup", "GET /api/sharing/limits", "window", wl);
    check("setup", "window reads {role:'exempt'}", wl.status === 200 && wl.json?.role === "exempt");
    const np = await V.request(ctx, "POST", "/api/project/delete", {}, { projectId: "none" }, true);
    row("setup", "POST /api/project/delete (no cookie)", "unpaired", np);
    check("setup", "no cookie: 401 with x-getwrite-gate not-paired (the gate is on)", np.status === 401 && np.gate === "not-paired");

    await openSettings();
    say(`file at start: ${snap()}`);
    check("setup", "App Settings, Home network sharing section, says 'Sharing is on'", (await page.getByLabel("Home network sharing").getByText("Sharing is on", { exact: true }).count()) === 1);

    // pair through the app's own flow
    await page.getByRole("button", { name: "Show a pairing code", exact: true }).click();
    const codeEl = page.locator("p.font-mono").first();
    await codeEl.waitFor({ timeout: 15000 });
    const code = (await codeEl.innerText()).trim();
    if (!/^\d{6}$/.test(code)) throw new Error("window did not show a 6-digit code");
    const res = await fetch(`${BASE}/api/sharing/pair`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ code }),
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    say(`pairing POST status: ${res.status}`);
    if (res.status !== 200 || !setCookie.startsWith("getwrite_device=")) throw new Error("pairing did not yield a device cookie");
    ctx.cookie = setCookie.split(";")[0];
    check("setup", "device paired through the app's pairing-code flow (code read from the window)", true);
    const pl = await pairedLimits();
    check("setup", "paired GET /api/sharing/limits: role paired, all five true (no file yet)", pl !== null && KEYS.every((k) => pl[k] === true));
    await reopenSettings();
    const deviceRows = await page.getByRole("button", { name: /^Revoke / }).count();
    check("setup", "App Settings lists the paired device", deviceRows === 1, `${deviceRows} Revoke button(s)`);

    // window never refused, all five on (no file yet)
    for (const k of KEYS) await exercise("window-all-on", "no file, all on", k, "window", "allowed");

    for (const k of KEYS) await toggleKey(k);

    await unreadableSection("chmod-0");
    await unreadableSection("directory");
    await overwriteSection("missing-file", () => {});
    await overwriteSection("invalid-text", () => writeFileSync(limitsFile(), "not json"));
    await overwriteSection("invalid-types", () => writeFileSync(limitsFile(), JSON.stringify({ version: 1, limits: { projectDeletion: "no", unlocking: 0 } })));
    clearFile();
    await closeSettings();
    check("window", "window page still on the local origin, never sent to the pairing screen", new URL(page.url()).pathname !== "/pair", new URL(page.url()).pathname);
  } finally {
    if (startedPid !== undefined) {
      try {
        recordTree(startedPid);
        await Promise.race([app.close(), sleep(20000)]);
      } catch (e) {
        say(`app.close: ${e instanceof Error ? e.message.split("\n")[0] : "error"}`);
      }
      await sleep(5000);
      let left = [...known.keys()].filter(alive);
      say(`pids recorded under the started pid: ${known.size}; still alive 5 s after close: ${left.length === 0 ? "none" : left.map((p) => `${p}(${known.get(p)})`).join(",")}`);
      for (const sig of ["SIGTERM", "SIGKILL"]) {
        if (left.length === 0) break;
        for (const p of left) {
          try {
            process.kill(p, sig);
          } catch {
            // gone
          }
        }
        await sleep(3000);
        left = left.filter(alive);
        say(`after ${sig} to those recorded pids: ${left.length === 0 ? "none alive" : left.join(",")}`);
      }
      say(`listener on 3000 after stop: ${listenerPids().join(",") || "none"}`);
    }
    try {
      chmodSync(limitsFile(), 0o600);
    } catch {
      // not there
    }
    rmSync(root, { recursive: true, force: true });
    say(`throwaway root removed: ${!existsSync(root)}`);
  }
  const failed = V.checks.filter((c) => !c.ok);
  for (const item of [...new Set(V.checks.map((c) => c.item))]) {
    const g = V.checks.filter((c) => c.item === item);
    say(`SUMMARY [${item}] ${g.filter((c) => c.ok).length}/${g.length} passed`);
  }
  say(`mode ${MODE}: measured requests from this script's node client: ${V.counts.measured}; checks: ${V.checks.length}; failed: ${failed.length}`);
  for (const f of failed) say(`FAILED [${f.item}] ${f.name}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`);
  process.exit(1);
});
