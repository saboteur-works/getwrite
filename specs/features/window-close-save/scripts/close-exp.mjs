// Window-close save loss: on the packaged app, what happens to a save waiting out the autosave debounce when the
// window closes or the app quits. Each trial types a unique word, waits, acts, and reads the file; every trial runs
// in its own app launch. Throwaway userData and projects folder; the app appends to ~/Library/Logs/GetWrite/getwrite.log.
// Usage: node close-exp.mjs <app-path> <condition>[:n] ... Run OUTSIDE the sandbox.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { REPO, Recorder, cleanupRun, createRun, errLine, listeners, preflight, protectedPortsState, repoProjectsStatus, say, sleep } from "../../user-handbook/scripts/lib/safety.mjs";

const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const J = (x) => JSON.stringify(x);
const APP = path.resolve(process.argv[2]);
const EXE = path.join(APP, "Contents/MacOS/GetWrite");
const DELAY = Number(process.env.DELAY_MS ?? 100);
const conditions = process.argv.slice(3).flatMap((a) => { const [c, n = "1"] = a.split(":"); return Array.from({ length: Number(n) }, () => c); });

const instrument = (app) => app.evaluate(({ app: a, BrowserWindow, session }) => {
  const mark = (e) => console.log(`EXP|${Date.now()}|${e}`);
  for (const e of ["window-all-closed", "before-quit", "will-quit", "quit"]) a.prependListener(e, () => mark(e));
  for (const w of BrowserWindow.getAllWindows()) {
    w.on("close", () => mark("win-close"));
    w.on("closed", () => mark("win-closed"));
    w.webContents.on("destroyed", () => mark("wc-destroyed"));
    w.webContents.on("render-process-gone", (_e, d) => mark(`render-gone:${d.reason}`));
  }
  const f = { urls: ["*://*/api/resource/revision/*"] };
  const s = session.defaultSession;
  s.webRequest.onBeforeRequest(f, (d, cb) => { mark(`req-start:${d.method}`); cb({}); });
  s.webRequest.onCompleted(f, (d) => mark(`req-done:${d.statusCode}`));
  s.webRequest.onErrorOccurred(f, (d) => mark(`req-error:${d.error}`));
});

const acts = {
  async close(app) { await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); }); },
  async appquit(app) { await app.evaluate(({ app: a }) => { a.quit(); }); },
  async quitevent() { execFileSync("osascript", ["-e", 'tell application id "works.saboteur.getwrite" to quit']); },
  async delayedquit(app) {
    // Discriminator: the window closes as usual but the quit, and so the server kill, comes 2 s later.
    await app.evaluate(({ app: a, BrowserWindow }) => {
      a.removeAllListeners("window-all-closed");
      a.on("window-all-closed", () => { console.log(`EXP|${Date.now()}|window-all-closed-delayed`); setTimeout(() => a.quit(), 2000); });
      BrowserWindow.getAllWindows()[0].close();
    });
  },
  async realclose() { const r = spawnSync("osascript", ["-e", 'tell application "System Events" to tell process "GetWrite" to click (first button of window 1 whose subrole is "AXCloseButton")'], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr.trim()); },
  async realquit() { const r = spawnSync("osascript", ["-e", 'tell application "System Events" to tell process "GetWrite" to click menu item "Quit GetWrite" of menu "GetWrite" of menu bar item "GetWrite" of menu bar 1'], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr.trim()); },
};

const stubDialog = (app, response) => app.evaluate(({ dialog }, r) => {
  dialog.showMessageBox = async (_win, o) => { console.log(`EXP|${Date.now()}|dialog:${o.message}:${o.buttons.join("/")}:answer=${o.buttons[r]}`); return { response: r }; };
}, response);
const abortWrites = (page) => page.route("**/api/resource/revision/**", (route) => (route.request().method() !== "GET" ? route.abort() : route.continue()));
const closeWin = (app) => app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
const windows = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
// Conditions added for the fix. prep runs before typing; each acts after typing.
const prep = {
  async failkeep({ app, page }) { await stubDialog(app, 0); await abortWrites(page); },
  async failclose({ app, page }) { await stubDialog(app, 1); await abortWrites(page); },
  async failquit({ app, page }) { await stubDialog(app, 0); await abortWrites(page); },
  async hung({ app, page }) { await stubDialog(app, 1); await page.evaluate(() => { window.getwriteDesktop.setBeforeCloseHandler(() => new Promise(() => {})); }); },
  async inflight({ page }) { await page.route("**/api/resource/revision/**", async (route) => { if (route.request().method() !== "GET") await sleep(1500); await route.continue(); }); },
  async markdown({ page }) {
    await page.locator('button[aria-label="Edit as Markdown"]').first().evaluate((b) => b.click()); await page.waitForTimeout(800);
    const d = page.locator("[role=dialog],[role=alertdialog]").first();
    if (await d.isVisible().catch(() => false)) { await d.locator("button").last().click(); await page.waitForTimeout(800); }
    await page.locator("textarea:visible").first().click(); await page.keyboard.press("Meta+ArrowDown");
  },
  async keeprun({ page }) { await page.evaluate(() => window.getwriteDesktop.setKeepRunningSetting(true)); },
};
Object.assign(acts, {
  async failkeep(app, page) {
    await closeWin(app); await sleep(1500);
    say(`  after Keep Editing: windows=${await windows(app)}`);
    await page.unroute("**/api/resource/revision/**");
    await closeWin(app);
  },
  async failclose(app) { await closeWin(app); },
  async failquit(app, page) {
    await app.evaluate(({ app: a }) => { a.quit(); }); await sleep(1500);
    say(`  after Keep Editing on a quit: windows=${await windows(app)}`);
    await page.unroute("**/api/resource/revision/**");
    await closeWin(app);
    await sleep(1500);
    say(`  the later close didn't carry the old quit: exited=${app.process().exitCode !== null || app.process().signalCode !== null}`);
  },
  async hung(app) { await closeWin(app); },
  async inflight(app, page) { await page.waitForTimeout(2600); await closeWin(app); },
  async markdown(app) { await closeWin(app); },
  async keeprun(app, page) {
    await closeWin(app); await sleep(1500);
    say(`  keep running on: windows=${await windows(app)}; exited=${app.process().exitCode !== null}; port listening=${listeners(7340).length > 0}`);
    void page;
  },
});
const afterCheck = {
  async keeprun(app) {
    const t = readKeep(); await app.evaluate(({ app: a }) => { a.quit(); }); return t;
  },
};
const readKeep = () => readFileSync(path.join(userData, "workspace.json"), "utf8").includes("true");

say(`ports before: ${preflight([7340])}; app=${path.relative(REPO, APP)}; delay=${DELAY}ms`);
const run = createRun("close-exp");
const projectsDir = path.join(run.dir, "projects"); mkdirSync(projectsDir);
const userData = path.join(run.dir, "userdata"); mkdirSync(userData);
writeFileSync(path.join(userData, "workspace.json"), J({ projectsDir }));
const file = () => { const d = path.join(projectsDir, readdirSync(projectsDir)[0], "resources"); return readFileSync(path.join(d, readdirSync(d)[0], "content.txt"), "utf8"); };
let first = true;
const tally = {};
const launch = async () => {
  const lines = [];
  const app = await _electron.launch({ executablePath: EXE, args: [`--user-data-dir=${userData}`], timeout: 60000 });
  const proc = app.process();
  const rec = new Recorder(); rec.add(proc.pid, "main");
  proc.stdout.on("data", (d) => { for (const l of String(d).split("\n")) if (l.startsWith("EXP|")) lines.push(l); });
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), packaged: a.isPackaged }));
  if (realpathSync(info.ud) !== realpathSync(userData) || !info.packaged) throw new Error(`unexpected app state ${J(info)}`);
  const page = await app.firstWindow();
  for (let i = 0; i < 60; i++) { if (page.url().startsWith("http://localhost:7340") && (await page.evaluate(() => document.readyState)) === "complete") break; await sleep(500); }
  await page.waitForTimeout(1500);
  rec.walk(process.pid);
  return { app, page, proc, rec, lines };
};
try {
  for (const [i, cond] of conditions.entries()) {
    let h;
    try {
      h = await launch();
      const { app, page, proc, rec, lines } = h;
      if (first) {
        await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
        await page.fill('input:not([aria-label="Filter project types"])', "Exp");
        const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
        await page.selectOption("select", { label: blank });
        await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
        await page.click('button[aria-label="Workspace options"]');
        await page.click(".resource-context-menu-item:has-text('Create')");
        await page.locator("[role=dialog] input[type=text]").first().fill("Doc");
        await page.locator("[role=dialog] button:has-text('Create')").last().click(); await page.waitForTimeout(2500);
        first = false;
      } else {
        await page.click('button[aria-label="Open Exp"]'); await page.waitForTimeout(2000);
      }
      await page.click("text=Doc >> nth=0"); await page.waitForTimeout(1500);
      const pm = page.locator(".ProseMirror").first();
      await pm.click(); await page.keyboard.press("Meta+ArrowDown"); await page.waitForTimeout(3200);
      await instrument(app);
      await prep[cond]?.(h);
      const word = `w${i}x`;
      await page.keyboard.type(` ${word}`);
      await page.waitForTimeout(DELAY);
      const t0 = Date.now();
      let portGone = null; let probing = true;
      const probe = (async () => { while (probing) { await new Promise((res) => { const s = net.connect(7340, "127.0.0.1"); s.once("connect", () => { s.destroy(); res(); }); s.once("error", () => { if (portGone === null) portGone = Date.now() - t0; res(); }); }); await sleep(10); } })();
      await acts[cond](app, page);
      const tAct = Date.now() - t0;
      await sleep(cond === "delayedquit" || cond === "hung" ? 7000 : 4000);
      probing = false; await probe;
      const savedBeforeAfter = file().includes(word);
      if (afterCheck[cond]) { await afterCheck[cond](app); await sleep(1500); }
      const exited = proc.exitCode !== null || proc.signalCode !== null;
      const saved = savedBeforeAfter;
      (tally[cond] ??= { saved: 0, lost: 0 })[saved ? "saved" : "lost"]++;
      const ev = lines.map((l) => { const [, ts, e] = l.split("|"); return `${e}@${Number(ts) - t0}`; }).join(" ");
      say(`${cond} #${i}: saved=${saved}; exited=${exited}; act returned @${tAct}; port gone @${portGone}; ${ev}`);
      if (!exited) { await Promise.race([app.close(), sleep(8000)]).catch(() => {}); }
      await sleep(800); rec.walk(process.pid); await rec.stop();
    } catch (e) {
      say(`${cond} #${i}: ERROR ${errLine(e)}`);
      if (h) { h.rec.walk(process.pid); await h.rec.stop(); }
    }
  }
  say(`tally: ${J(tally)}`);
} finally {
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus()}`);
}
process.exit(0);
