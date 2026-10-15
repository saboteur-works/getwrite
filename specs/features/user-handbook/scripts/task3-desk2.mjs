// Task 3, desktop: App Settings noise word add (investigation of S-16). Run OUTSIDE the sandbox.
import { createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startDesktop, stopDesktop, appLogLines } from "./desktop-dev.mjs";
import { readdirSync } from "node:fs";
import path from "node:path";
const J = (x) => JSON.stringify(x);
say(`ports before: ${preflight([7340])}`);
const run = createRun("desktop");
let h;
try {
  h = await startDesktop(run);
  const page = h.page;
  const body = () => page.evaluate(() => document.body.innerText);
  await page.waitForTimeout(2000);
  await page.click('button[aria-label="App Settings"]');
  await page.waitForTimeout(800);
  const inp = page.locator("[role=dialog] input[type=text], dialog input[type=text]").first();
  await inp.fill("desktopword");
  say(`D add button state: ${J(await page.$$eval("[role=dialog] button, dialog button", (e) => e.map((x) => (x.textContent || "").trim() + ":" + (x.disabled ? "disabled" : "enabled"))))}`);
  await page.click("[role=dialog] button:text-is('Add'), dialog button:text-is('Add')");
  await page.waitForTimeout(3000);
  say(`D after add + 3 s: ${J((await body()).split("\\n").filter(Boolean).slice(-8).map((l)=>l.slice(0,60)))}; input value now ${J(await inp.inputValue())}`);
  say(`D app log lines mentioning noise/error/workspace: ${J(appLogLines(h).filter((l) => /noise|error|workspace|EACCES|ENOENT|fail/i.test(l)).map((l) => l.replace(run.dir, "<run-dir>").slice(0, 300)))}`);
  say(`D userData folder entries (throwaway): ${J(readdirSync(h.userData).filter((n) => /workspace|json/i.test(n)))}`);
  await page.click("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')");
  await page.waitForTimeout(500);
  await page.click('button[aria-label="App Settings"]');
  await page.waitForTimeout(1000);
  say(`D reopened: ${J((await body()).split("\\n").filter(Boolean).slice(-8).map((l)=>l.slice(0,60)))}`);
  await page.reload();
  await page.waitForTimeout(2500);
  await page.click('button[aria-label="App Settings"]');
  await page.waitForTimeout(1000);
  say(`D after window reload, reopened: ${J((await body()).split("\\n").filter(Boolean).slice(-8).map((l)=>l.slice(0,60)))}`);
  await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t3-desk-as.png" });
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  if (h) {
    const o = await stopDesktop(h);
    say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited"}; listener 7340 after: ${o.listenersOnApp}; log folder removed: ${o.logDirRemoved}`);
  }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
