// Handbook re-run, group 1 (OQ-8), desktop (Electron dev, fake root): Scrivener import, App Settings
// (noise words, "When the window closes"), saved project types, Word import with a deleted saved type.
// Run OUTSIDE the sandbox.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { REPO, createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine, sleep } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { expandAll, treeRows, outline } from "./task3-lib.mjs";

const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const body = (page) => page.evaluate(() => document.body.innerText);
const lines = async (page) => (await body(page)).split("\n").map((l) => l.trim()).filter(Boolean);
const dialogs = (page) => page.$$eval("[role=dialog],[role=alertdialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean)));
const gear = async (page) => { await page.click('button[aria-label="Open project settings menu"]'); await page.waitForTimeout(400); };
const openAppSettings = async (page) => { await gear(page); await page.click("[role=menuitem]:has-text('App Settings')"); await page.waitForTimeout(1000); };
const closeDialog = async (page) => { await page.click("[role=dialog] button:has-text('Close')"); await page.waitForTimeout(500); };
const keepRunning = (page) => page.locator("[role=dialog] section:has-text('When the window closes') input[type=checkbox], [role=dialog] section:has-text('When the window closes') [role=switch]").first();
const alive = (h) => h.app.process().exitCode === null && h.app.process().signalCode === null;
const closeWindow = (h) => h.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); });
const windowCount = (h) => h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length).catch(() => "app gone");
const electronProcs = () => { try { return execFileSync("pgrep", ["-fl", "Electron.app/Contents/MacOS/Electron"], { encoding: "utf8" }).trim().split("\n").filter(Boolean); } catch { return []; } };

say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
say(`Electron processes before (other apps would make the reopen check ambiguous): ${electronProcs().length}`);
const run = createRun("g1-desk");
const fx = path.join(run.dir, "fixtures"); mkdirSync(fx);
cpSync(path.join(REPO, "frontend/tests/fixtures/scrivener/sample.scriv"), path.join(fx, "sample.scriv"), { recursive: true });
cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "one.docx"));
let h;
const stop = async () => {
  if (!h) return;
  const o = await stopDesktop(h);
  say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited"}; listener on 7340 after: ${o.listenersOnApp}`);
  h = null;
};
try {
  // ------------------------------------------------ session A: fresh userData
  h = await startDesktop(run);
  let page = h.page;
  say(`A electron pid ${h.app.process().pid}; isPackaged=${h.info.packaged}; userData throwaway=${h.sameUd}`);
  const stubPicker = (p) => h.app.evaluate(({ dialog }, pp) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pp] }); }, p);
  await step("A-scrivener", async () => {
    await page.waitForTimeout(1500);
    await stubPicker(path.join(fx, "sample.scriv"));
    await page.click("button:has-text('Import Scrivener 3 Project')"); await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE SCRIVENER PROJECT')"); await page.waitForTimeout(1500);
    say(`A Scrivener dialog after choosing: ${J((await dialogs(page)).map((d) => d.map((l) => l.replace(run.dir, "<run-dir>"))))}`);
    await page.click("[role=dialog] button[type=submit]"); await page.waitForTimeout(8000);
    say(`A Scrivener result: ${J((await dialogs(page)).map((d) => d.slice(0, 12)))}`);
    await page.getByRole("button", { name: /open project/i }).first().click(); await page.waitForTimeout(3000);
    await expandAll(page);
    say(`A Scrivener project tree: ${J(outline(await treeRows(page)))}`);
    await gear(page); await page.click("[role=menuitem]:has-text('Close Project')"); await page.waitForTimeout(1500);
  });
  await step("A-settings", async () => {
    await openAppSettings(page);
    say(`A App Settings dialog: ${J(await dialogs(page))}`);
    say(`A keep-running switch default: checked=${await keepRunning(page).isChecked()}`);
    await page.locator("[role=dialog] input[type=text]").first().fill("desktopword");
    await page.click("[role=dialog] button:has-text('Add'):not(:has-text('Word'))"); await page.waitForTimeout(800);
    say(`A noise-word list after adding "desktopword": ${J((await lines(page)).filter((l) => /desktopword|No noise words|Could not save/i.test(l)))}`);
    await closeDialog(page);
  });
  await step("A-saved-types", async () => {
    await gear(page); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500);
    say(`A manager top: ${J((await dialogs(page)).map((d) => d.slice(0, 5)))}`);
    await page.locator("[role=dialog] button:has-text('Blank')").first().click(); await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Save as copy", exact: true }).click(); await page.waitForTimeout(1500);
    const dir = path.join(h.userData, "project-types");
    say(`A after Save as copy: <userData>/project-types exists=${existsSync(dir)} files=${J(existsSync(dir) ? readdirSync(dir) : [])}; repo getwrite-config untouched: ${J(execFileSync("git", ["-C", REPO, "status", "--short", "getwrite-config"], { encoding: "utf8" }).trim())}`);
    await closeDialog(page);
  });
  await step("A-word-deleted-type", async () => {
    await stubPicker(path.join(fx, "one.docx"));
    await page.click("button:has-text('Import Word Document')"); await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE DOCUMENT')"); await page.waitForTimeout(1200);
    const opts = await page.$$eval("[role=dialog] select", (ss) => ss.map((s) => [...s.options].map((o) => o.value + "=" + o.textContent)));
    say(`A Word import selects: ${J(opts)}`);
    const saved = opts[1].map((o) => o.split("=")[0]).find((v) => !["article", "blank", "game_writing", "novel", "poetry_and_lyrics", "serial"].includes(v));
    await page.locator("[role=dialog] select").nth(1).selectOption(saved);
    const dir = path.join(h.userData, "project-types");
    for (const f of readdirSync(dir)) rmSync(path.join(dir, f));
    const before = readdirSync(h.projectsDir).length;
    await page.click("[role=dialog] button[type=submit]"); await page.waitForTimeout(5000);
    say(`A Word import with saved type "${saved}" deleted after the dialog loaded: ${J((await dialogs(page)).map((d) => d.slice(0, 8)))}; projects before ${before} after ${readdirSync(h.projectsDir).length}`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  });
  await step("A-keep-on-close", async () => {
    await openAppSettings(page);
    await keepRunning(page).click({ force: true }); await page.waitForTimeout(800);
    say(`A keep-running switch after clicking: checked=${await keepRunning(page).isChecked()}`);
    await closeDialog(page);
    await closeWindow(h); await sleep(4000);
    say(`A after closing the window with the switch on: app process alive=${alive(h)}; windows=${await windowCount(h)}`);
    execFileSync("osascript", ["-e", 'tell application id "com.github.Electron" to reopen']); await sleep(4000);
    say(`A after a reopen Apple event (what a Dock click sends): windows=${await windowCount(h)}`);
    const w = h.app.windows();
    if (w.length) { page = w[w.length - 1]; await page.waitForTimeout(2000); say(`A reopened window shows: ${J((await lines(page)).slice(0, 4))}`); }
  });
  await stop();
  // ------------------------------------------------ session B: same userData after a restart
  h = await startDesktop(run, { reuse: true });
  page = h.page;
  say(`B restarted with the same userData: pid ${h.app.process().pid}`);
  await step("B-persist", async () => {
    await page.waitForTimeout(1500);
    await openAppSettings(page);
    say(`B noise-word list after restart: ${J((await lines(page)).filter((l) => /desktopword|No noise words/i.test(l)))}`);
    say(`B keep-running switch after restart: checked=${await keepRunning(page).isChecked()}`);
    await keepRunning(page).click({ force: true }); await page.waitForTimeout(800);
    say(`B keep-running switch after clicking: checked=${await keepRunning(page).isChecked()}`);
    await closeDialog(page);
    const proc = h.app.process();
    await closeWindow(h); await sleep(6000);
    say(`B after closing the window with the switch off: app process alive=${proc.exitCode === null && proc.signalCode === null} (exitCode ${proc.exitCode})`);
  });
  await stop().catch((e) => say(`B stop: ${errLine(e)}`));
  // ------------------------------------------------ session C: quit with Cmd+Q equivalent while the window is closed
  h = await startDesktop(run, { reuse: true });
  page = h.page;
  await step("C-quit", async () => {
    await page.waitForTimeout(1500);
    await openAppSettings(page);
    if (!(await keepRunning(page).isChecked())) await keepRunning(page).click({ force: true });
    await page.waitForTimeout(600);
    await closeDialog(page);
    await closeWindow(h); await sleep(3000);
    say(`C window closed with the switch on: alive=${alive(h)}`);
    const proc = h.app.process();
    execFileSync("osascript", ["-e", 'tell application id "com.github.Electron" to quit']); await sleep(6000);
    say(`C after a quit Apple event (the app menu's Quit, Cmd+Q): alive=${proc.exitCode === null && proc.signalCode === null} (exitCode ${proc.exitCode})`);
  });
  await stop().catch((e) => say(`C stop: ${errLine(e)}`));
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  await stop().catch(() => {});
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
  say(`Electron processes after: ${electronProcs().length}`);
}
process.exit(0);
