// Handbook re-run, group 1 (OQ-8), desktop: the full Import from Word dialog after choosing a document. Run OUTSIDE the sandbox.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { REPO, createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
say(`ports before: ${preflight([7340])}`);
const run = createRun("g1-desk-word");
const fx = path.join(run.dir, "fixtures"); mkdirSync(fx);
cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "one.docx"));
let h;
try {
  h = await startDesktop(run);
  const page = h.page;
  await page.waitForTimeout(1500);
  await h.app.evaluate(({ dialog }, pp) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pp] }); }, path.join(fx, "one.docx"));
  await page.click("button:has-text('Import Word Document')"); await page.waitForTimeout(600);
  await page.click("button:has-text('CHOOSE DOCUMENT')"); await page.waitForTimeout(1500);
  say(`W dialog: ${JSON.stringify(await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}`);
  say(`W labels and inputs: ${JSON.stringify(await page.$$eval("[role=dialog] label, [role=dialog] input, [role=dialog] select", (e) => e.map((x) => `${x.tagName}:${(x.textContent || x.value || "").trim().slice(0, 40)}`)))}`);
} catch (e) { say(`SCRIPT ERROR ${errLine(e)}`); } finally {
  if (h) { const o = await stopDesktop(h); say(`stop: recorded ${o.stop.recorded}; listener on 7340 after: ${o.listenersOnApp}`); }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
