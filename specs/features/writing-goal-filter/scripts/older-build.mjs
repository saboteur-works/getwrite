// FR-38: an older build opening a project whose writing-log day file holds entries with `documentId`.
// Usage: node older-build.mjs <app-path> <today|old-file>. Throwaway userData and projects folder. The app appends to
// ~/Library/Logs/GetWrite/getwrite.log. Run OUTSIDE the sandbox.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, Recorder, cleanupRun, createRun, errLine, preflight, protectedPortsState, repoProjectsStatus, say, sleep } from "../../user-handbook/scripts/lib/safety.mjs";

const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const J = (x) => JSON.stringify(x);
const APP = path.resolve(process.argv[2]);
const EXE = path.join(APP, "Contents/MacOS/GetWrite");
const COND = process.argv[3];
say(`ports before: ${preflight([7340])}; app=${APP.replace(REPO, ".")}; condition=${COND}`);
const run = createRun("older-build");
const projectsDir = path.join(run.dir, "projects"); mkdirSync(projectsDir);
const userData = path.join(run.dir, "userdata"); mkdirSync(userData);
writeFileSync(path.join(userData, "workspace.json"), J({ projectsDir }));
const root = () => path.join(projectsDir, readdirSync(projectsDir)[0]);
const logDir = () => path.join(root(), "meta/writing-log");
const content = () => { const d = path.join(root(), "resources"); return readFileSync(path.join(d, readdirSync(d)[0], "content.txt"), "utf8").trim(); };
const docId = () => readdirSync(path.join(root(), "resources"))[0];
const days = () => Object.fromEntries(readdirSync(logDir()).map((f) => [f, JSON.parse(readFileSync(path.join(logDir(), f), "utf8")).entries]));
const launch = async () => {
  const app = await _electron.launch({ executablePath: EXE, args: [`--user-data-dir=${userData}`], timeout: 45000 });
  const rec = new Recorder(); rec.add(app.process().pid, "main");
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), packaged: a.isPackaged, version: a.getVersion() }));
  if (realpathSync(info.ud) !== realpathSync(userData) || !info.packaged) throw new Error(`unexpected app state ${J(info)}`);
  const dir = await app.evaluate(() => process.env.GETWRITE_PROJECTS_DIR ?? null);
  const page = await app.firstWindow();
  for (let i = 0; i < 60; i++) { if (page.url().startsWith("http://localhost:7340") && (await page.evaluate(() => document.readyState)) === "complete") break; await sleep(500); }
  await page.waitForTimeout(1500);
  rec.walk(process.pid);
  say(`launched: version ${info.version}; pid ${app.process().pid}; env dir ${dir}`);
  return { app, page, rec };
};
const stop = async (h) => { await Promise.race([h.app.close(), sleep(10000)]).catch(() => {}); await sleep(800); h.rec.walk(process.pid); await h.rec.stop(); };
const footer = async (page) => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter((l) => /^Today|^Words:|saved|incomplete|unavailable|not saved|could not|couldn/i.test(l));
const details = async (page) => { await page.click("button:has-text(\"Today's writing\")"); await page.waitForTimeout(700); const t = (await page.locator("[role=dialog]").first().innerText()).split("\n").filter(Boolean); await page.keyboard.press("Escape"); await page.waitForTimeout(300); return t; };
let h;
try {
  h = await launch();
  let { page } = h;
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Exp");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  await page.click('button[aria-label="Workspace options"]');
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text]").first().fill("Doc");
  await page.locator("[role=dialog] button:has-text('Create')").last().click(); await page.waitForTimeout(2500);
  await page.click("text=Doc >> nth=0"); await page.waitForTimeout(1500);
  await page.locator(".ProseMirror").first().click(); await page.keyboard.type("first words here"); await page.waitForTimeout(4500);
  say(`A before the new field: footer=${J(await footer(page))}; day files=${J(days())}`);
  await stop(h); h = null;

  // What a newer build would leave behind.
  for (const f of readdirSync(logDir())) {
    const p = path.join(logDir(), f);
    const d = JSON.parse(readFileSync(p, "utf8"));
    d.entries = d.entries.map((e) => ({ ...e, documentId: docId() }));
    if (COND === "old-file") {
      const old = new Date(Date.now() - 4 * 864e5).toISOString();
      d.entries = d.entries.map((e) => ({ ...e, timestamp: old }));
      writeFileSync(path.join(logDir(), `${old.slice(0, 10)}.json`), J(d));
      renameSync(p, `${p}.removed`);
    } else writeFileSync(p, J(d));
  }
  if (COND === "old-file") for (const f of readdirSync(logDir())) if (f.endsWith(".removed")) { const fs = await import("node:fs"); fs.rmSync(path.join(logDir(), f)); }
  say(`B files after adding documentId: ${J(days())}`);

  h = await launch(); page = h.page;
  await page.click('button[aria-label="Open Exp"]'); await page.waitForTimeout(2500);
  say(`C project opened: on project page=${(await page.locator(".resource-context-menu-item, button[aria-label='Workspace options']").count()) > 0}`);
  await page.click("text=Doc >> nth=0"); await page.waitForTimeout(1500);
  say(`D editor text=${J(await page.locator(".ProseMirror").first().innerText())}; footer=${J(await footer(page))}`);
  say(`E details window: ${J(await details(page))}`);
  await page.locator(".ProseMirror").first().click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(" second words");
  await page.waitForTimeout(3300);
  say(`F 3.3s after typing: footer=${J(await footer(page))}; toasts=${J(await page.locator("[role=alert],[role=status]").allInnerTexts())}`);
  await page.waitForTimeout(1500);
  say(`G content.txt=${J(content())}; day files=${J(days())}`);
  await stop(h); h = null;

  h = await launch(); page = h.page;
  await page.click('button[aria-label="Open Exp"]'); await page.waitForTimeout(2500);
  await page.click("text=Doc >> nth=0"); await page.waitForTimeout(1500);
  say(`H after restart: editor text=${J(await page.locator(".ProseMirror").first().innerText())}; footer=${J(await footer(page))}`);
  await stop(h); h = null;
} catch (e) {
  say(`ERROR ${errLine(e)}`);
  if (h) await stop(h).catch(() => {});
} finally {
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus()}`);
}
process.exit(0);
