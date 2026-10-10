#!/usr/bin/env node
/**
 * Feature 77, Task 28: two paired clients across an unlock and a lock.
 *
 * Usage: node two-clients.mjs
 *
 * Needs the same builds as verify-limits.mjs standalone and Playwright's
 * Chromium. The server and Chromium must be launched outside the command
 * sandbox. Everything runs against a throwaway root under os.tmpdir() with a
 * throwaway encrypted project and a random throwaway passphrase. It refuses to
 * run while anything listens on port 3000, uses a free port, records the
 * process group it starts and stops only that.
 *
 * Two devices are paired (two cookies, two browser contexts, A and B). Phase 1
 * runs with all five limits OFF and client A makes the unlock and the lock from
 * its own page. Phase 2 runs with all five limits ON and the desktop window
 * (window secret header, from this script) makes the unlock and the lock.
 * Editor behaviour of client B is recorded, not asserted.
 *
 * Output is step labels, status codes, path shapes with ids replaced, fixed
 * copy strings and counts. It never prints a cookie value, window secret,
 * pairing code or passphrase. Response bodies of failed requests are printed
 * with ids and the throwaway root path replaced.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

process.argv[2] = "standalone";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V = await import(path.join(HERE, "verify-limits.mjs"));
const REPO = path.resolve(HERE, "../../../..");
const nodeRequire = createRequire(path.join(REPO, "frontend/package.json"));
const { chromium } = nodeRequire("@playwright/test");
const WRITER = path.join(REPO, "electron/dist/sharing/limits-store.js");

const LOCKED_CARD =
  "Unlock this workspace on the computer where GetWrite is installed to see this project's name and open it.";
const UNLOCK_AT_DESKTOP =
  "This workspace is locked. It has to be unlocked on the computer where GetWrite is installed.";
const ENC_NAME = "gamma-encrypted";
const SETTLE_MS = 7000;

const say = (line) => console.log(line);
const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
let rootForRedaction = "";
const redact = (s) => {
  let out = s.replace(ID_RE, "<id>");
  if (rootForRedaction) out = out.split(rootForRedaction).join("<root>");
  return out;
};

let browser;

/** A client: a fresh context holding one device cookie, one page, a request log. */
async function openClient(base, name, cookie) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [cname, cvalue] = cookie.split("=");
  await ctx.addCookies([{ name: cname, value: cvalue, url: base }]);
  const page = await ctx.newPage();
  const client = { name, ctx, page, log: [], mark: 0 };
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/_next/") || u.pathname === "/favicon.ico") return;
    const entry = {
      t: Date.now(),
      method: r.request().method(),
      path: redact(u.pathname),
      status: r.status(),
      body: null,
    };
    if (r.status() >= 400) {
      try {
        entry.body = redact((await r.text()).slice(0, 400));
      } catch {
        entry.body = "(unreadable)";
      }
    }
    client.log.push(entry);
  });
  return client;
}

/** Requests the page made since the last call, one line each. */
function drainLog(client, label) {
  const entries = client.log.splice(0);
  say(`LOG [${client.name}] ${label}: ${entries.length} requests`);
  for (const e of entries) {
    say(`  REQ [${client.name}] ${e.method} ${e.path} -> ${e.status}${e.body !== null ? ` body=${e.body}` : ""}`);
  }
  return entries;
}

const pageStatus = (client) =>
  client.page.evaluate(async () => {
    const r = await fetch("/api/encryption");
    const j = await r.json().catch(() => ({}));
    return { status: r.status, isUnlocked: j.isUnlocked === true };
  });

const pageAction = (client, body) =>
  client.page.evaluate(async (b) => {
    const r = await fetch("/api/encryption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    });
    let limit = "-";
    try {
      const j = await r.json();
      if (typeof j.limit === "string") limit = j.limit;
    } catch {
      // no JSON
    }
    return { status: r.status, limit };
  }, body);

async function screen(client) {
  const p = client.page;
  const f = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return {
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      dialogHeading: dlg ? (dlg.querySelector("h1,h2,h3")?.textContent ?? "").trim().slice(0, 60) : null,
      password: document.querySelectorAll('input[type="password" i]').length,
    };
  });
  const s = {
    openEncrypted: await p.getByRole("button", { name: `Open ${ENC_NAME}`, exact: true }).count(),
    lockedCard: (await p.getByText(LOCKED_CARD, { exact: true }).count()) > 0,
    unlockAtDesktop: (await p.getByText(UNLOCK_AT_DESKTOP, { exact: true }).count()) > 0,
    ...f,
  };
  return s;
}

const showScreen = async (client, label) => {
  const s = await screen(client);
  say(`SCREEN [${client.name}] ${label}: openButtonForEncryptedProject=${s.openEncrypted} lockedCardText=${s.lockedCard} unlockAtDesktopMessage=${s.unlockAtDesktop} dialogs=${s.dialogs} dialogHeading=${JSON.stringify(s.dialogHeading)} passwordInputs=${s.password}`);
  return s;
};

/** Start page is ready: the project list, the unlock dialog, or the locked-workspace text. */
const startReady = (page) =>
  page
    .getByRole("button", { name: "Open alpha", exact: true })
    .or(page.getByRole("dialog"))
    .or(page.getByText(UNLOCK_AT_DESKTOP, { exact: true }))
    .first()
    .waitFor({ timeout: 45000 });

const toStart = async (client, base) => {
  await client.page.goto(`${base}/`);
  await startReady(client.page);
  await client.page.waitForTimeout(1500);
};

async function reload(client) {
  await client.page.reload();
  await startReady(client.page);
  await client.page.waitForTimeout(1500);
}

/** After a state change by someone else: the client's next request and screen. */
async function observe(client, tag, expectUnlocked) {
  await client.page.waitForTimeout(SETTLE_MS);
  drainLog(client, `${tag}: requests the page made on its own while waiting`);
  const s1 = await showScreen(client, `${tag}, no reload, after ${SETTLE_MS} ms`);
  const st = await pageStatus(client);
  say(`NEXT [${client.name}] ${tag}: GET /api/encryption sent by the page -> ${st.status}, isUnlocked=${st.isUnlocked}`);
  V.check(tag, `${client.name}'s next request reports ${expectUnlocked ? "unlocked" : "locked"}`, st.status === 200 && st.isUnlocked === expectUnlocked);
  drainLog(client, `${tag}: after the next request`);
  await reload(client);
  const s2 = await showScreen(client, `${tag}, after a reload`);
  V.check(tag, `${client.name}'s screen after reload shows ${expectUnlocked ? "unlocked (Open button for the encrypted project)" : "locked (no Open button for it)"}`, expectUnlocked ? s2.openEncrypted === 1 : s2.openEncrypted === 0);
  drainLog(client, `${tag}: reload`);
  return { s1, s2, st };
}

async function main() {
  if (V.port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const writer = nodeRequire(WRITER);
  const root = mkdtempSync(path.join(tmpdir(), "gw-two-"));
  rootForRedaction = root;
  V.assertThrowaway(root);
  const projectsDir = path.join(root, "projects");
  const sharingDir = path.join(root, "sharing");
  mkdirSync(projectsDir);
  mkdirSync(sharingDir);
  V.assertThrowaway(projectsDir);
  V.assertThrowaway(sharingDir);
  const secret = randomBytes(32).toString("hex");
  const passphrase = randomBytes(18).toString("base64url");
  say(`node=${process.version} throwaway root under os.tmpdir() (name withheld)`);

  let child;
  const clients = [];
  try {
    const port = await V.freePort();
    const base = `http://127.0.0.1:${port}`;
    const W = V.makeCtx({ base, window: { "x-getwrite-window": secret } });
    Object.assign(W, { writer, sharingDir, projectsDir, passphrase });
    child = V.startServer(port, {
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_PROJECTS_DIR: projectsDir,
    });
    say(`server (sharing on) pid=${child.pid} port=${port}`);
    await V.waitReady(W, child);

    // two devices: pairDevice stores the cookie in ctx.cookie, in memory only
    await V.pairDevice(W, sharingDir);
    const cookieA = W.cookie;
    await V.pairDevice(W, sharingDir);
    const cookieB = W.cookie;
    W.cookie = null;
    V.check("setup", "two different device cookies were issued", cookieA !== cookieB);

    // fixtures through the window: alpha (plain), an encrypted project with one text resource
    const makeProject = async (name) => {
      const before = new Set(readdirSync(projectsDir));
      const r = await V.setupCall(W, "POST", "/api/projects", { name, projectType: "blank" });
      const added = readdirSync(projectsDir).filter((d) => !before.has(d));
      if (r.status !== 200 || added.length !== 1) throw new Error(`fixture project ${name} failed (${r.status})`);
      return added[0];
    };
    await makeProject("alpha");
    const encId = await makeProject(ENC_NAME);
    const created = await V.setupCall(W, "POST", "/api/encryption", { action: "enable", projectId: encId, projectName: ENC_NAME, passphrase });
    V.check("setup", "throwaway encrypted project created through the window", created.status === 200 && existsSync(path.join(projectsDir, encId, ".encrypted.json")), `status ${created.status}`);
    await V.newResource(W, encId);
    say("fixtures: project alpha (plain) and an encrypted project with one text resource");

    browser = await chromium.launch();
    say(`chromium ${browser.version()} launched`);

    const A = await openClient(base, "A", cookieA);
    const B = await openClient(base, "B", cookieB);
    clients.push(A, B);
    for (const c of [A, B]) {
      const r = await c.ctx.request.get(`${base}/api/sharing/limits`);
      const j = await r.json();
      V.check("setup", `client ${c.name} is a paired device (limits read role paired)`, r.status() === 200 && j.role === "paired");
    }

    // ================= Phase 1: all five limits OFF, client A unlocks and locks
    await V.setLimits(W, V.all(false));
    say("PHASE 1: Limit unlocking and Limit locking OFF (all five off). A makes the unlock and the lock from its own page.");
    await V.setSession(W, false);
    V.check("P1", "workspace locked before the phase (through the window)", (await V.sessionUnlocked(W)) === false);
    await toStart(A, base);
    await toStart(B, base);
    drainLog(A, "P1 start");
    drainLog(B, "P1 start");
    await showScreen(A, "P1 locked, A open");
    await showScreen(B, "P1 locked, B open");

    const unlockRes = await pageAction(A, { action: "unlock", passphrase });
    say(`ACTION [A] unlock sent by A's page -> ${unlockRes.status} limit=${unlockRes.limit}`);
    for (const c of [A, B]) c.log.splice(0);
    V.check("P1-unlock", "A's unlock was allowed (200)", unlockRes.status === 200);
    V.check("P1-unlock", "the server reports unlocked", (await V.sessionUnlocked(W)) === true);
    await observe(B, "P1-unlock", true);
    await observe(A, "P1-unlock", true);

    const lockRes = await pageAction(A, { action: "lock" });
    say(`ACTION [A] lock sent by A's page -> ${lockRes.status} limit=${lockRes.limit}`);
    for (const c of [A, B]) c.log.splice(0);
    V.check("P1-lock", "A's lock was allowed (200)", lockRes.status === 200);
    V.check("P1-lock", "the server reports locked", (await V.sessionUnlocked(W)) === false);
    await observe(B, "P1-lock", false);
    await observe(A, "P1-lock", false);

    // ---- B's open editor across A's lock
    await V.setSession(W, true);
    say("PHASE 1 editor: workspace unlocked through the window; B opens the encrypted project's resource; A then locks; B is left alone, then types");
    const C = await openClient(base, "B-editor", cookieB);
    clients.push(C);
    await toStart(C, base);
    await C.page.getByRole("button", { name: `Open ${ENC_NAME}`, exact: true }).click();
    await C.page.getByRole("tab", { name: "Trash" }).waitFor({ timeout: 45000 });
    const treeRes = C.page.getByText(/^res-\d+$/).first();
    await treeRes.waitFor({ timeout: 20000 });
    await treeRes.click();
    const editor = C.page.locator(".ProseMirror").first();
    await editor.waitFor({ timeout: 30000 });
    await C.page.waitForTimeout(3000);
    drainLog(C, "editor open (before the lock)");
    const footer = async (label) => {
      const t = await C.page.evaluate(() => {
        const nodes = [...document.querySelectorAll("footer, [role='contentinfo']")].map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
        return nodes;
      });
      const autosave = await C.page.getByText(/autosave/i).allInnerTexts();
      const live = await C.page.evaluate(() => ({
        toasts: document.querySelectorAll('[role="status"], [role="alert"], [data-sonner-toast], [data-toast]').length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        password: document.querySelectorAll('input[type="password" i]').length,
        editorText: (document.querySelector(".ProseMirror")?.textContent ?? "").length,
      }));
      say(`EDITOR [B] ${label}: footers=${JSON.stringify(t.map((x) => x.slice(0, 160)))} autosaveTexts=${JSON.stringify(autosave.map((x) => x.trim().slice(0, 80)))} toastsOrAlerts=${live.toasts} dialogs=${live.dialogs} passwordInputs=${live.password} editorTextLength=${live.editorText}`);
    };
    await footer("before the lock");
    const lock2 = await pageAction(A, { action: "lock" });
    say(`ACTION [A] lock sent by A's page -> ${lock2.status} limit=${lock2.limit}`);
    V.check("P1-editor", "A's lock was allowed (200)", lock2.status === 200 && (await V.sessionUnlocked(W)) === false);
    await C.page.waitForTimeout(20000);
    await footer("20 s after A's lock, no typing");
    const idle = drainLog(C, "20 s after A's lock, no typing");
    await editor.click();
    await C.page.keyboard.type(" typed after the lock");
    await C.page.waitForTimeout(15000);
    await footer("15 s after typing following the lock");
    const afterTyping = drainLog(C, "15 s after typing following the lock");
    const bad = [...idle.map((e) => ({ ...e, phase: "idle" })), ...afterTyping.map((e) => ({ ...e, phase: "after typing" }))].filter((e) => e.status === 404);
    say(`FACT [B-editor] requests that returned 404 in this run: ${bad.length}`);
    for (const e of bad) say(`FACT [B-editor] 404: ${e.method} ${e.path} (${e.phase}) body=${e.body}`);
    await C.page.screenshot({ path: path.join(root, "b-editor.png") }).catch(() => {});

    // ================= Phase 2: all five limits ON, the window unlocks and locks
    say("PHASE 2: all five limits ON. The desktop window (window secret header) makes the unlock and the lock.");
    await V.setLimits(W, V.all(true));
    await V.setSession(W, false);
    V.check("P2", "workspace locked before the phase (through the window)", (await V.sessionUnlocked(W)) === false);
    await reload(A);
    await reload(B);
    await showScreen(A, "P2 locked, A open");
    await showScreen(B, "P2 locked, B open");
    for (const c of [A, B]) {
      const r = await pageAction(c, { action: "unlock", passphrase });
      say(`ACTION [${c.name}] unlock sent by the client's page with the limit on -> ${r.status} limit=${r.limit}`);
      V.check("P2", `${c.name}'s own unlock is refused (403 unlocking)`, r.status === 403 && r.limit === "unlocking");
    }
    await V.setSession(W, true);
    say("ACTION [window] unlock");
    for (const c of [A, B]) c.log.splice(0);
    V.check("P2-unlock", "the server reports unlocked", (await V.sessionUnlocked(W)) === true);
    await observe(A, "P2-unlock", true);
    await observe(B, "P2-unlock", true);
    await V.setSession(W, false);
    say("ACTION [window] lock");
    for (const c of [A, B]) c.log.splice(0);
    V.check("P2-lock", "the server reports locked", (await V.sessionUnlocked(W)) === false);
    await observe(A, "P2-lock", false);
    await observe(B, "P2-lock", false);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child && V.started.includes(child.pid)) V.stopServer(child);
    await V.sleep(2500);
    const left = V.groupMembers();
    say(`process-group members still alive after stop: ${left.length === 0 ? "none" : left.join(",")}`);
    rmSync(root, { recursive: true, force: true });
    say(`throwaway root removed: ${!existsSync(root)}`);
  }

  const failed = V.checks.filter((c) => !c.ok);
  for (const item of [...new Set(V.checks.map((c) => c.item))]) {
    const g = V.checks.filter((c) => c.item === item);
    say(`SUMMARY [${item}] ${g.filter((c) => c.ok).length}/${g.length} passed`);
  }
  say(`checks: ${V.checks.length}; failed: ${failed.length}; window requests: measured ${V.counts.measured}, setup ${V.counts.setup}`);
  for (const f of failed) say(`FAILED [${f.item}] ${f.name}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`script error: ${e instanceof Error ? e.message : "unknown"}`);
  for (const pid of V.started) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  process.exit(1);
});
