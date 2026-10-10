#!/usr/bin/env node
/**
 * Feature 77, Task 27: real-browser checks of the paired-device limits.
 *
 * Usage: node browser-limits.mjs
 *
 * Needs the same builds as verify-limits.mjs standalone (a finished
 * `pnpm build` in frontend/ with `.next/static` copied into
 * `.next/standalone/frontend/.next/static`, and `pnpm build` in electron/ for
 * `electron/dist/sharing/limits-store.js`), and Playwright's Chromium
 * (`@playwright/test`, resolved from frontend/package.json). Playwright
 * Chromium and the servers must be launched outside the command sandbox.
 *
 * It reuses the server, pairing, fixture and limits-file helpers of
 * verify-limits.mjs by importing them. Everything runs against a throwaway
 * root under os.tmpdir(): its own GETWRITE_PROJECTS_DIR and
 * GETWRITE_SHARING_DIR, a throwaway encrypted project and a random throwaway
 * passphrase. It refuses to run while anything listens on port 3000, picks a
 * free port, records the process group it starts and stops only that. Every
 * change to the limits file goes through the main-side writer `setLimit`.
 *
 * The browser is a paired device (the device cookie is added to the browser
 * context in memory). Every step opens a fresh browser context. A MutationObserver
 * and a requestAnimationFrame loop installed before any page script record
 * every `input[type=password]` that is ever in the document.
 *
 * Output is step labels, DOM facts (counts, booleans, fixed copy strings),
 * status codes and limit keys. It never prints a cookie value, window secret,
 * pairing code, passphrase or response body text.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// verify-limits.mjs reads its mode from argv[2]; set it before importing.
process.argv[2] = "standalone";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V = await import(path.join(HERE, "verify-limits.mjs"));
const REPO = path.resolve(HERE, "../../../..");
const nodeRequire = createRequire(path.join(REPO, "frontend/package.json"));
const { chromium } = nodeRequire("@playwright/test");
const WRITER = path.join(REPO, "electron/dist/sharing/limits-store.js");

// Fixed copy strings, as in frontend/components/Sharing/sharing-copy.ts.
const COPY = {
  unlockAtDesktop:
    "This workspace is locked. It has to be unlocked on the computer where GetWrite is installed.",
  lockedCard:
    "Unlock this workspace on the computer where GetWrite is installed to see this project's name and open it.",
  creationAtDesktop:
    "The passphrase for this workspace has to be created on the computer where GetWrite is installed.",
  encryptLimited:
    "Encrypting a project has to be done on the computer where GetWrite is installed.",
  lockLimited:
    "Locking the workspace has to be done on the computer where GetWrite is installed.",
  permanentDeletion:
    "Deleting permanently has to be done on the computer where GetWrite is installed.",
  projectDeletion:
    "Deleting a project has to be done on the computer where GetWrite is installed.",
  projectNotDeleted: "The project was not deleted.",
};
const DELAY_MS = 6000;
const BLOCK_WAIT_MS = 7000;

// ------------------------------------------------------------------ bookkeeping

const steps = { run: 0, threw: 0 };
let browser;
let current = "";

const say = (line) => console.log(line);
const uuidless = (p) =>
  p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>");

/** Installs the password-input recorder before any page script. */
const RECORDER = () => {
  const q = 'input[type="password" i]';
  window.__pwSeen = 0;
  window.__pwMax = 0;
  const tally = () => {
    const n = document.querySelectorAll(q).length;
    if (n > window.__pwMax) window.__pwMax = n;
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches(q) || n.querySelector(q))) window.__pwSeen += 1;
      }
      if (m.type === "attributes" && m.target.matches && m.target.matches(q)) window.__pwSeen += 1;
    }
    tally();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["type"] });
  (function loop() {
    tally();
    requestAnimationFrame(loop);
  })();
};

/** One DOM inspection: password inputs now and ever seen, open dialogs. */
async function dom(page, label) {
  const f = await page.evaluate(() => ({
    now: document.querySelectorAll('input[type="password" i]').length,
    seen: window.__pwSeen,
    max: window.__pwMax,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    iframes: document.querySelectorAll("iframe").length,
  }));
  say(`DOM [${current}] ${label}: passwordInputsNow=${f.now} insertedEver=${f.seen} maxConcurrent=${f.max} openDialogs=${f.dialogs} iframes=${f.iframes}`);
  return f;
}

const noPassword = (f) => f.now === 0 && f.seen === 0 && f.max === 0;

const text = (page, sel) =>
  page.locator(sel).first().innerText().catch(() => null);

const hasText = async (page, s) =>
  (await page.getByText(s, { exact: true }).count()) > 0;

const PAIRED = (limits) => ({ role: "paired", limits });

/**
 * One step: a fresh browser context holding the device cookie. `read` is how
 * the page's reads of GET /api/sharing/limits are treated: "normal", "delay"
 * (held for DELAY_MS, then passed on), "block" (aborted), or an object, which
 * is answered from the browser as {role:"paired", limits: object} without
 * reaching the server (a stale answer; the server's own limits are unchanged).
 */
async function step(A, id, desc, opts, fn) {
  steps.run += 1;
  current = id;
  say(`STEP ${id}: ${desc}`);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: opts.window ? A.window : undefined,
  });
  await ctx.addInitScript(RECORDER);
  if (!opts.window) {
    const [name, value] = A.cookie.split("=");
    await ctx.addCookies([{ name, value, url: A.base }]);
  }
  const read = opts.read ?? "normal";
  let limitsRequests = 0;
  const stats = { limitsRequests: 0, limitsAborted: 0, limitsDelayed: 0, limitsStubbed: 0 };
  await ctx.route("**/api/sharing/limits", async (route) => {
    limitsRequests += 1;
    stats.limitsRequests = limitsRequests;
    if (read === "block") {
      stats.limitsAborted += 1;
      await route.abort("failed");
    } else if (read === "delay") {
      stats.limitsDelayed += 1;
      await V.sleep(DELAY_MS);
      await route.continue();
    } else if (typeof read === "object") {
      stats.limitsStubbed += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(PAIRED(read)),
      });
    } else {
      await route.continue();
    }
  });
  const page = await ctx.newPage();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.pathname !== "/api/sharing/limits") {
      say(`RESP [${id}] ${r.request().method()} ${uuidless(u.pathname)} -> ${r.status()}`);
    }
  });
  try {
    await fn(page, ctx, stats);
  } catch (e) {
    steps.threw += 1;
    V.check(id, "step completed without a script error", false, String(e.message ?? e).split("\n")[0].slice(0, 160));
  } finally {
    say(`STAT [${id}] limits reads attempted by the page: ${stats.limitsRequests} (aborted ${stats.limitsAborted}, delayed ${stats.limitsDelayed}, stubbed ${stats.limitsStubbed})`);
    await ctx.close();
  }
}

// ------------------------------------------------------------- page navigation

async function toStart(page, A, waitFor = "alpha") {
  await page.goto(`${A.base}/`);
  await page.getByRole("button", { name: `Open ${waitFor}`, exact: true }).waitFor({ timeout: 45000 });
}

async function openProject(page, A, name = "alpha") {
  await toStart(page, A, name);
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Trash" }).waitFor({ timeout: 45000 });
}

async function openEncryptionTab(page) {
  await page.getByRole("button", { name: "Open project settings menu" }).click();
  await page.getByRole("menuitem", { name: "Project Settings" }).click();
  await page.getByRole("tab", { name: /Project Encryption/ }).click();
  await page.waitForTimeout(800);
}

const opener = (page) => page.getByRole("button", { name: /Encrypt this project/ });

async function describedBy(loc) {
  return loc.evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent ?? null);
  });
}

// ------------------------------------------------------------------ Phase A..D

/** Fetch from the page itself (device cookie, same origin); status and limit key only. */
function pageEnable(page, projectId) {
  return page.evaluate(async (pid) => {
    const r = await fetch("/api/encryption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "enable",
        projectId: pid,
        projectName: "browser-enable-refused",
        passphrase: "not-the-real-throwaway-passphrase",
      }),
    });
    let limit = "-";
    try {
      const j = await r.json();
      if (typeof j.limit === "string") limit = j.limit;
    } catch {
      // no JSON body
    }
    return { status: r.status, limit };
  }, projectId);
}

async function creationStep(A, id, read, limitsLabel) {
  await step(A, id, `workspace with no passphrase yet (lock state "absent"), ${limitsLabel}, limits read: ${typeof read === "string" ? read : "stale"}`, { read }, async (page) => {
    await openProject(page, A);
    if (read === "delay") {
      // the very first moments: the read is still held
      await dom(page, "project open, limits read still held");
    }
    await openEncryptionTab(page);
    const during = await dom(page, "Project Encryption tab opened");
    V.check(id, "no password input in the document at any time so far", noPassword(during));
    const op = opener(page);
    const stateAtOpen = await op.isDisabled();
    say(`FACT [${id}] opener "Encrypt this project…" disabled right after tab open: ${stateAtOpen}`);
    if (read === "delay") {
      await page.waitForTimeout(DELAY_MS + 1500);
      await dom(page, `after the held read completed (${DELAY_MS} ms hold)`);
    } else if (read === "block") {
      await page.waitForTimeout(BLOCK_WAIT_MS);
      await dom(page, `after ${BLOCK_WAIT_MS} ms with the read aborted`);
    }
    V.check(id, "opener is disabled", await op.isDisabled());
    const reasons = await describedBy(op);
    V.check(id, "opener's aria-describedby text is the 'created on the computer where GetWrite is installed' reason, visible", reasons.length === 1 && reasons[0] === COPY.creationAtDesktop && (await page.getByText(COPY.creationAtDesktop, { exact: true }).isVisible()));
    await op.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const afterClick = await dom(page, "after a forced click on the disabled opener");
    V.check(id, "no encryption setup dialog opened and still no password input ever", afterClick.dialogs === 1 /* only Project Settings */ && noPassword(afterClick));
    V.check(id, "no 'Choose a passphrase for this workspace' text in the document", (await page.getByText(/Choose a passphrase for this workspace/).count()) === 0);
    const r = await pageEnable(page, A.fixtures.alphaId);
    V.check(id, "enable with a passphrase sent by the paired browser: 403 encryptionChanges", r.status === 403 && r.limit === "encryptionChanges", `status ${r.status} limit ${r.limit}`);
    const finalDom = await dom(page, "end of step");
    V.check(id, "password inputs: none at any time during the step", noPassword(finalDom));
  });
}

async function lockedStartStep(A, id, read) {
  await step(A, id, `locked workspace, Limit unlocking ON (all five on), Start page, limits read: ${read}`, { read }, async (page) => {
    await page.goto(`${A.base}/`);
    await page.waitForTimeout(1500);
    await dom(page, "1.5 s after navigation");
    await page.waitForTimeout(1500);
    await dom(page, "3 s after navigation");
    await page.getByRole("button", { name: "Open alpha", exact: true }).waitFor({ timeout: 45000 });
    if (read === "delay") await page.waitForTimeout(DELAY_MS + 1500);
    if (read === "block") await page.waitForTimeout(BLOCK_WAIT_MS);
    if (read === "normal") await page.waitForTimeout(2000);
    // cover at least two 5-second poll periods in every read mode
    await page.waitForTimeout(read === "normal" ? 8000 : 4000);
    const f = await dom(page, "after waiting out the read and at least two 5 s periods");
    V.check(id, "no password input in the document at any time", noPassword(f));
    V.check(id, "no dialog is open", f.dialogs === 0);
    const message = await hasText(page, COPY.unlockAtDesktop);
    const card = await hasText(page, COPY.lockedCard);
    say(`FACT [${id}] "unlock at the desktop" message in the document: ${message}; locked project card says the unlock-at-desktop text: ${card}`);
    if (read === "normal" || read === "delay") {
      V.check(id, "Start page shows the 'unlocked on the computer where GetWrite is installed' message", message);
      V.check(id, "locked project card shows the unlock-at-desktop text", card);
    } else {
      say(`FACT [${id}] with the read aborted the page cannot tell the caller is paired: message ${message}, card text ${card}`);
    }
  });
}

async function lockedSettingsStep(A, id, read) {
  await step(A, id, `locked workspace, Limit unlocking ON, Project Settings > Project Encryption tab of an unencrypted project, limits read: ${read}`, { read }, async (page) => {
    await openProject(page, A);
    await openEncryptionTab(page);
    if (read === "delay") await page.waitForTimeout(DELAY_MS + 1500);
    if (read === "block") await page.waitForTimeout(BLOCK_WAIT_MS);
    const f = await dom(page, "Project Encryption tab");
    V.check(id, "no password input in the document at any time", noPassword(f));
    const lockedText = await page.getByText(/Unlock the workspace to encrypt this project/).count();
    const openerCount = await opener(page).count();
    say(`FACT [${id}] tab shows "Unlock the workspace to encrypt this project": ${lockedText > 0}; "Encrypt this project…" buttons in the document: ${openerCount}`);
    V.check(id, "locked workspace: no encryption setup opener in the document (tab says to unlock first)", openerCount === 0 && lockedText > 0);
  });
}

async function unlockedSettingsStep(A, id, read, limitsLabel, expectOpenerDisabled) {
  await step(A, id, `unlocked workspace, ${limitsLabel}, Project Encryption tab, limits read: ${typeof read === "string" ? read : "stale"}`, { read }, async (page) => {
    await openProject(page, A);
    await openEncryptionTab(page);
    const op = opener(page);
    if (read === "delay") {
      say(`FACT [${id}] opener disabled while the read is held: ${await op.isDisabled()}`);
      await dom(page, "while the read is held");
      await page.waitForTimeout(DELAY_MS + 1500);
    }
    if (read === "block") await page.waitForTimeout(BLOCK_WAIT_MS);
    const f1 = await dom(page, "Project Encryption tab");
    V.check(id, "no password input in the document at any time", noPassword(f1));
    const disabled = await op.isDisabled();
    say(`FACT [${id}] opener disabled: ${disabled}`);
    if (expectOpenerDisabled === true) {
      V.check(id, "opener disabled with the 'encrypting a project has to be done on the computer…' reason visible", disabled && (await describedBy(op))[0] === COPY.encryptLimited && (await page.getByText(COPY.encryptLimited, { exact: true }).isVisible()));
      await op.click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      const f2 = await dom(page, "after a forced click on the disabled opener");
      V.check(id, "forced click opened no dialog (only Project Settings is open) and still no password input", f2.dialogs === 1 && noPassword(f2));
    } else {
      // opener enabled in this state: open the setup dialog and inspect it
      V.check(id, "opener enabled in this state (not claimed to be limited)", !disabled);
      await op.click();
      await page.getByRole("dialog", { name: /Encrypt/ }).waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      const f2 = await dom(page, "encryption setup dialog open");
      V.check(id, "encryption setup dialog: no password input at any time", noPassword(f2));
      const existing = await page.getByText(/encrypted with your existing workspace passphrase/).count();
      V.check(id, "dialog is the 'existing workspace passphrase' variant (no field)", existing > 0);
      await page.getByRole("dialog", { name: /Encrypt/ }).getByRole("button", { name: /Cancel/ }).click();
      await page.waitForTimeout(400);
      const f3 = await dom(page, "after cancelling the dialog");
      V.check(id, "after cancel: still no password input at any time", noPassword(f3));
    }
  });
}

// --------------------------------------------------------------------- main

async function main() {
  if (V.port3000Busy()) {
    console.error("refusing to run: something is listening on port 3000");
    process.exit(3);
  }
  const writer = nodeRequire(WRITER);
  const root = mkdtempSync(path.join(tmpdir(), "gw-browser-"));
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
  try {
    const port = await V.freePort();
    const A = V.makeCtx({ base: `http://127.0.0.1:${port}`, window: { "x-getwrite-window": secret } });
    Object.assign(A, { writer, sharingDir, projectsDir, passphrase });
    child = V.startServer(port, {
      GETWRITE_SHARING: "1",
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_PROJECTS_DIR: projectsDir,
    });
    say(`server (sharing on) pid=${child.pid} port=${port}`);
    await V.waitReady(A, child);
    await V.pairDevice(A, sharingDir);

    // ---- fixtures, all through the window
    const makeProject = async (name, type = "blank") => {
      const before = new Set(readdirSync(projectsDir));
      const r = await V.setupCall(A, "POST", "/api/projects", { name, projectType: type });
      const added = readdirSync(projectsDir).filter((d) => !before.has(d));
      if (r.status !== 200 || added.length !== 1) throw new Error(`fixture project ${name} failed (${r.status})`);
      return added[0];
    };
    const alphaId = await makeProject("alpha");
    A.fixtures = { id: alphaId, alphaId, folders: [] };
    const keepRid = await V.newResource(A, alphaId);
    const revId = await V.newRevision(A, alphaId, keepRid);
    const trashed1 = await V.trashedResource(A, alphaId);
    const delId = await makeProject("beta");
    say("fixtures: projects alpha (1 resource, 1 non-canonical revision, 1 trashed item) and beta (delete target)");
    const status0 = await V.setupCall(A, "GET", "/api/encryption");
    V.check("setup", "workspace has no keyring yet (status absent) before Phase A", status0.status === 200 && status0.json.isUnlocked === false && (status0.json.encryptedProjectIds ?? []).length === 0, `status ${status0.status}`);

    browser = await chromium.launch();
    say(`chromium ${browser.version()} launched`);

    // ===== Phase A: creating the workspace passphrase (lock state absent)
    await V.setLimits(A, V.all(true));
    await step(A, "A0", "positive control: the window (exempt caller, window secret header, no cookie) on the same state: the opener is enabled and the setup dialog has password inputs", { window: true }, async (page) => {
      await openProject(page, A);
      await openEncryptionTab(page);
      const op = opener(page);
      V.check("A0", "exempt caller: opener enabled", !(await op.isDisabled()));
      await op.click();
      await page.getByRole("dialog", { name: /Encrypt/ }).waitFor({ timeout: 10000 });
      const f = await dom(page, "setup dialog open (exempt caller)");
      V.check("A0", "the inspection detects password inputs when they exist (exempt caller's dialog has 2)", f.now === 2, `now ${f.now}`);
      await page.getByRole("dialog", { name: /Encrypt/ }).getByRole("button", { name: /Cancel/ }).click();
    });
    await creationStep(A, "A1", "normal", "all five limits on");
    await creationStep(A, "A2", "delay", "all five limits on");
    await creationStep(A, "A3", "block", "all five limits on");
    await V.setLimits(A, V.all(false));
    await creationStep(A, "A4", "normal", "all five limits OFF");
    const keyringAfterA = await V.setupCall(A, "GET", "/api/encryption");
    V.check("A", "after Phase A the workspace still has no keyring (no passphrase was created by the paired browser)", (keyringAfterA.json.encryptedProjectIds ?? []).length === 0 && !existsSync(path.join(projectsDir, alphaId, ".encrypted.json")));

    // ===== Phase B: locked workspace
    await V.setLimits(A, V.all(true));
    const enc = await makeProject("gamma-encrypted");
    const created = await V.setupCall(A, "POST", "/api/encryption", { action: "enable", projectId: enc, projectName: "gamma-encrypted", passphrase });
    V.check("setup", "throwaway encrypted project and workspace passphrase created through the window", created.status === 200 && existsSync(path.join(projectsDir, enc, ".encrypted.json")), `status ${created.status}`);
    A.encryptedId = enc;
    await V.setSession(A, false);
    V.check("setup", "workspace is locked", (await V.sessionUnlocked(A)) === false);
    for (const [i, read] of ["normal", "delay", "block"].entries()) {
      await lockedStartStep(A, `B${i + 1}`, read);
    }
    for (const [i, read] of ["normal", "delay", "block"].entries()) {
      await lockedSettingsStep(A, `B${i + 4}`, read);
    }

    // Limit unlocking OFF (the other four on): the prompt is shown and unlocks.
    await V.setLimits(A, { ...V.all(true), unlocking: false });
    await step(A, "B7", "locked workspace, Limit unlocking OFF (other four on), Start page: dialog shown, unlocks", { read: "normal" }, async (page) => {
      await page.goto(`${A.base}/`);
      await page.getByRole("dialog", { name: /Unlock your encrypted projects/ }).waitFor({ timeout: 45000 });
      await page.waitForTimeout(800);
      const f = await dom(page, "unlock dialog shown");
      V.check("B7", "dialog is shown with exactly 1 password input", f.now === 1 && f.dialogs === 1, `now ${f.now}`);
      V.check("B7", "the 'unlocked on the computer' message is not shown", !(await hasText(page, COPY.unlockAtDesktop)));
      await page.getByRole("dialog").getByLabel("Passphrase").fill(passphrase);
      await page.getByRole("dialog").getByRole("button", { name: "Unlock", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      V.check("B7", "workspace is unlocked on the server after the dialog's submit", (await V.sessionUnlocked(A)) === true);
      const after = await dom(page, "after unlock");
      V.check("B7", "after unlock: dialog gone", after.dialogs === 0);
      V.check("B7", "after unlock: the locked-project card text is gone from the Start page", (await page.getByText(COPY.lockedCard, { exact: true }).count()) === 0 && (await page.getByText("Encrypted project", { exact: true }).count()) === 0);
    });
    await V.setSession(A, true);

    // ===== Phase C: unlocked workspace, Limit unlocking ON
    await V.setLimits(A, V.all(true));
    await unlockedSettingsStep(A, "C1", "normal", "Limit unlocking ON and Limit encryption changes ON (all five on)", true);
    await unlockedSettingsStep(A, "C2", "delay", "all five on", true);
    await unlockedSettingsStep(A, "C3", "block", "all five on", false);
    await V.setLimits(A, { ...V.all(true), encryptionChanges: false });
    await unlockedSettingsStep(A, "C4", "normal", "Limit unlocking ON, Limit encryption changes OFF (other four on)", false);

    // ===== Phase D: refusals are visible (workspace unlocked, all five on)
    await V.setLimits(A, V.all(true));
    await refusalSteps(A, { alphaId, keepRid, revId, trashed1, delId });
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
  say(`steps run: ${steps.run}; steps that threw: ${steps.threw}; checks: ${V.checks.length}; failed: ${failed.length}; window requests: measured ${V.counts.measured}, setup ${V.counts.setup}`);
  for (const f of failed) say(`FAILED [${f.item}] ${f.name}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

// ------------------------------------------------------------------ Phase D

async function refusalSteps(A, F) {
  const ALL_OFF = V.all(false);
  const manage = (page, name) => page.getByRole("button", { name: `Manage ${name}`, exact: true });

  // D1: project delete, limit on, loaded with the answer in hand
  await step(A, "D1", "project delete with Limit project deletion ON: the control is disabled and the reason is shown; project still listed", { read: "normal" }, async (page) => {
    await toStart(page, A, "beta");
    await page.waitForTimeout(1500);
    await manage(page, "beta").click();
    const del = page.getByRole("menuitem", { name: /Delete/ });
    V.check("D1", "Delete is disabled", await del.isDisabled());
    V.check("D1", "the reason (deleting a project has to be done on the computer…) is visible and is the control's description", (await describedBy(del))[0] === COPY.projectDeletion && (await page.getByText(COPY.projectDeletion, { exact: true }).isVisible()));
    await del.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    V.check("D1", "forced click opened no confirmation dialog", (await page.getByRole("dialog").count()) === 0);
    V.check("D1", "'Project deleted' is not in the document", (await page.getByText("Project deleted").count()) === 0);
    V.check("D1", "beta is still listed", (await page.getByRole("button", { name: "Open beta", exact: true }).count()) === 1);
  });

  // D2: the server refuses a delete the page offered on a stale answer
  await step(A, "D2", "project delete when the page holds a stale 'allowed' answer (limits read answered from the browser, all off; the server's Limit project deletion is ON)", { read: ALL_OFF }, async (page) => {
    await toStart(page, A, "beta");
    await page.waitForTimeout(1500);
    await manage(page, "beta").click();
    const del = page.getByRole("menuitem", { name: /Delete/ });
    V.check("D2", "Delete is enabled on the stale answer", !(await del.isDisabled()));
    await del.click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor({ timeout: 10000 });
    await dlg.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(2500);
    const dialogText = (await dlg.innerText().catch(() => "")) ?? "";
    V.check("D2", "dialog still open and shows 'The project was not deleted.'", (await dlg.count()) === 1 && dialogText.includes(COPY.projectNotDeleted));
    const reasonLine = dialogText.split("\n").find((l) => l.includes(COPY.projectNotDeleted)) ?? "";
    say(`FACT [D2] failure line in the dialog: ${JSON.stringify(reasonLine)}`);
    V.check("D2", "the failure line carries a reason after the lead sentence", reasonLine.length > COPY.projectNotDeleted.length + 3);
    V.check("D2", "'Project deleted' is not in the document", (await page.getByText("Project deleted").count()) === 0);
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(500);
    V.check("D2", "beta is still listed", (await page.getByRole("button", { name: "Open beta", exact: true }).count()) === 1);
    V.check("D2", "beta is still on disk", existsSync(path.join(A.projectsDir, F.delId, "project.json")));
  });

  // D3: lock
  await step(A, "D3a", "lock with Limit locking ON: control disabled, reason shown, session still unlocked", { read: "normal" }, async (page) => {
    await openProject(page, A);
    await openEncryptionTab(page);
    const lock = page.getByRole("button", { name: "Lock workspace" });
    V.check("D3a", "Lock workspace is disabled", await lock.isDisabled());
    V.check("D3a", "reason (locking has to be done on the computer…) visible and is the description", (await describedBy(lock))[0] === COPY.lockLimited && (await page.getByText(COPY.lockLimited, { exact: true }).isVisible()));
    await lock.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    V.check("D3a", "workspace still unlocked on the server", (await V.sessionUnlocked(A)) === true);
  });
  await step(A, "D3b", "lock on a stale 'allowed' answer (read answered from the browser, all off; server's Limit locking ON)", { read: ALL_OFF }, async (page, ctx) => {
    await openProject(page, A);
    await openEncryptionTab(page);
    const lock = page.getByRole("button", { name: "Lock workspace" });
    V.check("D3b", "Lock workspace is enabled on the stale answer", !(await lock.isDisabled()));
    await lock.click();
    await page.waitForTimeout(2500);
    V.check("D3b", "workspace still unlocked on the server (lock refused)", (await V.sessionUnlocked(A)) === true);
    const para = await page.locator("section p.font-mono").allInnerTexts();
    say(`FACT [D3b] mono-text lines in the Encryption section after the click: ${JSON.stringify(para)}`);
    const visible = para.some((t) => t.trim().length > 0 && !/^(Encryption|Not encrypted|Encrypted)$/i.test(t.trim()));
    V.check("D3b", "a refusal line is visible in the Encryption section", visible);
    // after the refusal, give the page the real answer
    await ctx.unroute("**/api/sharing/limits");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(1500);
    V.check("D3b", "after a real re-read the Lock workspace control is disabled with its reason", (await lock.isDisabled()) && (await page.getByText(COPY.lockLimited, { exact: true }).isVisible()));
  });

  // D4: Trash purge
  await step(A, "D4a", "Trash purge with Limit permanent deletion ON: controls disabled, reason shown, item still listed", { read: "normal" }, async (page) => {
    await openProject(page, A);
    await page.getByRole("tab", { name: "Trash" }).click();
    await page.getByTestId("trash-list").waitFor({ timeout: 15000 });
    const del = page.getByTestId("trash-delete-selected");
    const empty = page.getByTestId("trash-empty-trash");
    V.check("D4a", "'Delete selected permanently' and 'Empty trash' are disabled", (await del.isDisabled()) && (await empty.isDisabled()));
    V.check("D4a", "reason visible and is both controls' description", (await describedBy(del))[0] === COPY.permanentDeletion && (await describedBy(empty))[0] === COPY.permanentDeletion && (await page.getByTestId("trash-purge-limit-reason").isVisible()));
    await empty.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    V.check("D4a", "forced click on Empty trash opened no dialog", (await page.getByRole("dialog").count()) === 0);
    V.check("D4a", "item still in the Trash list", (await page.getByTestId("trash-row").count()) === 1 && (await V.trashIds(A, F.alphaId)).includes(F.trashed1));
  });
  await step(A, "D4b", "Trash purge on a stale 'allowed' answer (read answered from the browser, all off; server's Limit permanent deletion ON)", { read: ALL_OFF }, async (page, ctx) => {
    await openProject(page, A);
    await page.getByRole("tab", { name: "Trash" }).click();
    await page.getByTestId("trash-list").waitFor({ timeout: 15000 });
    const empty = page.getByTestId("trash-empty-trash");
    V.check("D4b", "Empty trash is enabled on the stale answer", !(await empty.isDisabled()));
    await empty.click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor({ timeout: 10000 });
    await dlg.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForTimeout(2500);
    const refusalEl = page.getByTestId("trash-batch-refusal");
    const refusalLine = (await refusalEl.count()) === 1 ? (await refusalEl.innerText()).trim() : "";
    say(`FACT [D4b] trash-batch-refusal line: ${JSON.stringify(refusalLine)}`);
    V.check("D4b", "a refusal reason is visible after the click", refusalLine.length > 0);
    V.check("D4b", "item still in the Trash list and on the server", (await page.getByTestId("trash-row").count()) === 1 && (await V.trashIds(A, F.alphaId)).includes(F.trashed1));
    await ctx.unroute("**/api/sharing/limits");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(1500);
    V.check("D4b", "after a real re-read Empty trash is disabled with its reason", (await empty.isDisabled()) && (await page.getByTestId("trash-purge-limit-reason").isVisible()));
  });

  // D5: revision delete
  const openRevisions = async (page) => {
    await openProject(page, A);
    await page.getByText("res-1", { exact: true }).first().click();
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    try {
      await page.getByRole("button", { name: "Delete Revision" }).first().waitFor({ timeout: 20000 });
    } catch (e) {
      const panel = await page.locator("#revision-control-content").innerText().catch(() => "(panel not in the document)");
      say(`FACT revision panel text when no Delete Revision button appeared: ${JSON.stringify(panel.slice(0, 400))}`);
      throw e;
    }
  };
  await step(A, "D5a", "revision delete with Limit permanent deletion ON: control disabled, reason shown", { read: "normal" }, async (page) => {
    await openRevisions(page);
    const del = page.getByRole("button", { name: "Delete Revision" }).first();
    V.check("D5a", "Delete Revision is disabled", await del.isDisabled());
    const reasons = await describedBy(del);
    V.check("D5a", "reason visible and is the control's description", reasons.length === 1 && reasons[0] === COPY.permanentDeletion && (await page.getByText(COPY.permanentDeletion, { exact: true }).first().isVisible()));
    await del.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    const r = await V.setupCall(A, "GET", `/api/resource/revision/${F.keepRid}?projectId=${F.alphaId}&revisionId=${F.revId}`);
    V.check("D5a", "revision still readable on the server", r.status === 200, `status ${r.status}`);
  });
  await step(A, "D5b", "revision delete on a stale 'allowed' answer (read answered from the browser, all off; server's Limit permanent deletion ON)", { read: ALL_OFF }, async (page, ctx) => {
    await openRevisions(page);
    const del = page.getByRole("button", { name: "Delete Revision" }).first();
    V.check("D5b", "Delete Revision is enabled on the stale answer", !(await del.isDisabled()));
    await del.click();
    await page.waitForTimeout(2500);
    const refusal = page.getByTestId("revision-delete-refusal");
    const shown = (await refusal.count()) === 1 ? (await refusal.innerText()).trim() : "";
    say(`FACT [D5b] revision-delete-refusal line: ${JSON.stringify(shown)}`);
    V.check("D5b", "a refusal reason is visible after the click", shown.length > 0);
    const r = await V.setupCall(A, "GET", `/api/resource/revision/${F.keepRid}?projectId=${F.alphaId}&revisionId=${F.revId}`);
    V.check("D5b", "revision still readable on the server", r.status === 200, `status ${r.status}`);
    await ctx.unroute("**/api/sharing/limits");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(1500);
    V.check("D5b", "after a real re-read Delete Revision is disabled with its reason", (await del.isDisabled()) && (await page.getByText(COPY.permanentDeletion, { exact: true }).first().isVisible()));
  });

  // D6: keyboard, once
  await step(A, "D6", "keyboard: Tab order across the Trash toolbar with Limit permanent deletion ON; the disabled controls and the reason text", { read: "normal" }, async (page) => {
    await openProject(page, A);
    await page.getByRole("tab", { name: "Trash" }).click();
    await page.getByTestId("trash-list").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    await page.getByTestId("trash-row-select").first().click(); // selects the row, which enables Restore selected
    await page.waitForTimeout(300);
    const label = () =>
      page.evaluate(() => {
        const e = document.activeElement;
        if (!e) return "(none)";
        return (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 40);
      });
    await page.getByRole("tab", { name: "Trash" }).focus();
    const seq = [await label()];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      seq.push(await label());
    }
    say(`FACT [D6] focus order from the Trash tab, then five Tab presses: ${JSON.stringify(seq)}`);
    const del = page.getByTestId("trash-delete-selected");
    const empty = page.getByTestId("trash-empty-trash");
    V.check("D6", "both limited controls are disabled while a row is selected", (await del.isDisabled()) && (await empty.isDisabled()));
    V.check("D6", "Tab order reaches 'Restore selected' and the row checkbox and skips 'Delete selected permanently' and 'Empty trash'", seq.some((s) => /restore selected/i.test(s)) && seq.some((s) => /^Select res-/.test(s)) && !seq.some((s) => /delete selected permanently|empty trash/i.test(s)));
    const d1 = await describedBy(del);
    const d2 = await describedBy(empty);
    say(`FACT [D6] accessible description of the disabled controls (aria-describedby text): ${JSON.stringify([d1, d2])}`);
    V.check("D6", "each disabled control's description is the visible reason text", d1[0] === COPY.permanentDeletion && d2[0] === COPY.permanentDeletion && (await page.getByTestId("trash-purge-limit-reason").isVisible()));
  });
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
