// Handbook re-run, group 2 (OQ-8), desktop: typing then opening another document or closing the project within the
// autosave wait. Run OUTSIDE the sandbox.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { expandAll } from "./task3-lib.mjs";

const J = (x) => JSON.stringify(x);
const pm = (page) => page.locator(".ProseMirror").first();
say(`ports before: ${preflight([7340])}`);
const run = createRun("g2-desk3");
let h;
try {
  h = await startDesktop(run);
  const page = h.page;
  await page.waitForTimeout(1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Desk Test");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  const create = async (title) => {
    await page.click('button[aria-label="Workspace options"]');
    await page.click(".resource-context-menu-item:has-text('Create')");
    await page.locator("[role=dialog] input[type=text]").first().fill(title);
    await page.locator("[role=dialog] button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
  };
  const open = async (t) => { await expandAll(page); await page.click(`text=${t} >> nth=0`); await page.waitForTimeout(1500); };
  const texts = () => { const d = path.join(h.projectsDir, readdirSync(h.projectsDir)[0], "resources"); return readdirSync(d).map((id) => { const p = path.join(d, id, "content.txt"); return existsSync(p) ? readFileSync(p, "utf8").trim() : ""; }); };
  await create("Doc One"); await create("Doc Two"); await open("Doc One");
  for (let i = 1; i <= 3; i++) {
    await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` switch${i}`);
    await page.waitForTimeout(100);
    await open("Doc Two"); await page.waitForTimeout(2000);
    say(`typed then opened another document 100ms later, trial ${i}: saved=${texts().some((t) => t.includes(`switch${i}`))}`);
    await open("Doc One");
  }
  for (let i = 1; i <= 3; i++) {
    await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` proj${i}`);
    await page.waitForTimeout(100);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')"); await page.waitForTimeout(2500);
    say(`typed then closed the project 100ms later, trial ${i}: saved=${texts().some((t) => t.includes(`proj${i}`))}`);
    await page.click('button[aria-label="Open Desk Test"]'); await page.waitForTimeout(2500);
    await open("Doc One");
  }
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  if (h) { const o = await stopDesktop(h).catch(() => null); say(`stop: listener on 7340 after: ${o?.listenersOnApp}`); }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
