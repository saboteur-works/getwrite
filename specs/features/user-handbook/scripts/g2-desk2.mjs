// Handbook re-run, group 2 (OQ-8), desktop: clean formatting trials, then typing followed within 100ms by closing
// the window or quitting, repeated, with each restart reading the document back. Run OUTSIDE the sandbox.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine, sleep } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { expandAll } from "./task3-lib.mjs";

const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const pm = (page) => page.locator(".ProseMirror").first();
say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
const run = createRun("g2-desk2");
let h;
const stop = async () => { if (!h) return; const o = await stopDesktop(h); say(`stop: ${o.stop.stages.join("; ") || "all exited"}; listener on 7340 after: ${o.listenersOnApp}`); h = null; };
const file = () => { const dir = path.join(h.projectsDir, readdirSync(h.projectsDir)[0]); const id = readdirSync(path.join(dir, "resources"))[0]; const p = path.join(dir, "resources", id, "content.txt"); return existsSync(p) ? readFileSync(p, "utf8").trim() : null; };
const openDoc = async (page) => { await expandAll(page); await page.click("text=Doc One >> nth=0"); await page.waitForTimeout(1500); };
try {
  h = await startDesktop(run);
  let page = h.page;
  await page.waitForTimeout(1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Desk Test");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  await page.click('button[aria-label="Workspace options"]');
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text]").first().fill("Doc One");
  await page.locator("[role=dialog] button:has-text('Create')").last().click();
  await page.waitForTimeout(2500);
  await openDoc(page);
  const closeOnly = process.argv[2] === "close-only";
  if (!closeOnly) await step("format", async () => {
    await pm(page).click();
    let n = 0;
    const trial = async (name, act) => {
      n += 1;
      await page.keyboard.press("Meta+End").catch(() => {});
      await pm(page).click(); await page.keyboard.press("Meta+ArrowDown");
      if (n > 1) await page.keyboard.press("Enter");
      await page.keyboard.type(`line ${n} text`);
      await page.waitForTimeout(100);
      const para = pm(page).locator("p").last();
      await para.click({ clickCount: 3 });
      const sel = await page.evaluate(() => window.getSelection().toString().trim());
      await act(); await page.waitForTimeout(250);
      say(`${name}, selection=${J(sel)}: ${(await para.evaluate((p) => p.innerHTML))}`);
      await page.keyboard.press("Meta+ArrowDown");
      await page.waitForTimeout(100);
    };
    for (const k of ["B", "I", "U"]) { await trial(`Cmd+${k}`, () => page.keyboard.press(`Meta+${k}`)); await trial(`Cmd+${k} again`, () => page.keyboard.press(`Meta+${k}`)); await trial(`Ctrl+${k}`, () => page.keyboard.press(`Control+${k}`)); }
    for (const label of ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"]) await trial(`${label} button`, () => page.click(`button[aria-label="${label}"]`));
  });
  await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.press("Enter"); await page.keyboard.type("tail"); await page.waitForTimeout(4500);
  const ways = closeOnly
    ? [["close", 1], ["close", 2], ["close", 3], ["close", 4], ["close", 5], ["close", 6], ["quit-event", 1], ["quit-event", 2], ["app.quit", 1], ["app.quit", 2]]
    : [["close", 1], ["quit-event", 1], ["close", 2], ["quit-event", 2], ["close", 3], ["quit-event", 3], ["app.quit", 1], ["app.quit", 2]];
  for (const [way, i] of ways) {
    const word = `${way.replace(/\W/g, "")}${i}word`;
    await step(`${way}-${i}`, async () => {
      await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` ${word}`);
      await page.waitForTimeout(100);
      const proc = h.app.process();
      if (way === "close") await h.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); });
      else if (way === "quit-event") execFileSync("osascript", ["-e", 'tell application id "com.github.Electron" to quit']);
      else await h.app.evaluate(({ app }) => { app.quit(); });
      await sleep(6000);
      const onDisk = file();
      say(`${way} trial ${i}, 100ms after typing: exited=${proc.exitCode !== null || proc.signalCode !== null}; word in content.txt=${(onDisk || "").includes(word)}`);
    });
    await stop().catch((e) => say(`stop: ${errLine(e)}`));
    h = await startDesktop(run, { reuse: true });
    page = h.page;
    await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open Desk Test"]'); await page.waitForTimeout(2500);
    await openDoc(page);
    say(`  after restart: word in the editor=${(await pm(page).innerText()).includes(word)}`);
  }
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  await stop().catch(() => {});
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
