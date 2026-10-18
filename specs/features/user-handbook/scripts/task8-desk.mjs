// Task 8, desktop (Electron dev, fake root): compiling.md rows C-05 and C-12 (what a compile does on desktop). Run OUTSIDE the sandbox.
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRun, cleanupRun, assertThrowaway, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startDesktop, stopDesktop, appLogLines } from "./desktop-dev.mjs";
import { createProject, createNode, treeClick, typeInto, tick, dlg } from "./task8-lib.mjs";
const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
const run = createRun("desktop");
let h;
try {
  h = await startDesktop(run);
  const page = h.page; page.setDefaultTimeout(15000);
  say(`electron pid ${h.app.process().pid}; isPackaged=${h.info.packaged}; userData is throwaway: ${h.sameUd}`);
  await tick(page, 2000);
  // Throwaway download folder, asserted like the rest of the run; setDownloadPath below means an unhooked save lands here too, never in ~/Downloads.
  const saveDir = path.join(run.dir, "downloads");
  mkdirSync(saveDir);
  assertThrowaway(saveDir);
  // No `require` here: it is undefined in the app.evaluate context (Feature 88 Task 11), so the path is joined by string concatenation.
  await h.app.evaluate(({ BrowserWindow }, dir) => {
    globalThis.__dl = [];
    const wins = BrowserWindow.getAllWindows();
    globalThis.__nwin = wins.length;
    for (const w of wins) {
      w.webContents.session.setDownloadPath(dir);
      w.webContents.session.on("will-download", (_e, item) => { const p = dir + "/" + item.getFilename(); globalThis.__dl.push({ name: item.getFilename(), p }); item.setSavePath(p); });
    }
  }, saveDir).catch((e) => say("hook failed " + String(e.message).slice(0, 200)));
  say("desktop windows hooked: " + J(await h.app.evaluate(() => globalThis.__nwin)));
  const cons = []; page.on("console", (m) => cons.push(m.type() + ": " + m.text().slice(0, 160)));
  const base = { baseUrl: "http://localhost:7340" };
  await step("compile", async () => {
    await createProject(page, base, "Desk Cmp", "Blank");
    await createNode(page, "Doc B", "text"); await createNode(page, "Doc A", "text");
    await typeInto(page, "Doc B", "Bee text."); await typeInto(page, "Doc A", "Ay text.");
    await page.click('button[aria-label="Open project menu"]'); await page.locator("text=Compile Project").first().click(); await tick(page, 900);
    say("desktop Compile Project dialog: " + J((await dlg(page)).split("\n").filter(Boolean)));
    await page.click("button:has-text('SELECT ALL')"); await tick(page, 300);
    await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click(); await tick(page, 4000);
    const dl = await h.app.evaluate(() => globalThis.__dl);
    say("desktop will-download events: " + J(dl.map((d) => d.name)));
    for (const d of dl) if (existsSync(d.p)) say("desktop compiled file " + d.name + ": " + J(readFileSync(d.p, "utf8").slice(0, 300)));
    say("desktop dialog after compile: " + J(await dlg(page)));
    say("desktop page text lines mentioning compile/download/saved: " + J((await page.evaluate(() => document.body.innerText)).split("\n").filter((l) => /compil|download|saved to|exported/i.test(l)).slice(0, 8)));
    say("desktop console messages: " + J(cons.filter((c) => !/Failed to load resource.*404/.test(c)).slice(-8)));
    say("desktop session is default session: " + J(await h.app.evaluate(({ BrowserWindow, session }) => BrowserWindow.getAllWindows()[0].webContents.session === session.defaultSession)));
    say("desktop app log lines (compile/download/error): " + J(appLogLines(h).filter((l) => /compil|download|error|fail/i.test(l)).slice(-6)));
  });
} catch (e) {
  say("SCRIPT ERROR(outer) " + errLine(e));
} finally {
  if (h) {
    const o = await stopDesktop(h);
    say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited after app.close"}`);
    say(`listener on 7340 after stop: ${o.listenersOnApp}; throwaway log folder removed: ${o.logDirRemoved}`);
  }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
