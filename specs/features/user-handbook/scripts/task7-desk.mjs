// Task 7, desktop (Electron dev, fake root): Trash tab on desktop (TR-12), and the Revision Control panel. Run OUTSIDE the sandbox.
import { readdirSync } from "node:fs";
import path from "node:path";
import { createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { createProject, createNode, treeClick, clickTab, typeAndSave, expandRevisions, revCards, walkFiles, rel, tick, treeRows, outline, expandAll } from "./task7-lib.mjs";
const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
const run = createRun("desktop");
let h;
try {
  h = await startDesktop(run);
  const page = h.page;
  page.setDefaultTimeout(15000);
  say(`electron pid ${h.app.process().pid}; isPackaged=${h.info.packaged}; userData is throwaway: ${h.sameUd}`);
  await tick(page, 2000);
  const base = { baseUrl: "http://localhost:7340" };
  await step("trash", async () => {
    await createProject(page, base, "Desk Trash", "Blank");
    await createNode(page, "Desk Doc", "text");
    await typeAndSave(page, "Desk Doc", "Desktop words.", 5000);
    await expandRevisions(page);
    say("desktop Revision Control cards: " + J((await revCards(page)).map((c) => c.name + " " + c.sub + (c.badges.length ? " [" + c.badges + "]" : ""))));
    await expandAll(page);
    say("desktop tabs: " + J(await page.$$eval("[role=tab]", (t) => t.map((x) => x.innerText))));
    await page.click('button[aria-label="Desk Doc options"]');
    await page.click(".resource-context-menu-item:has-text('Delete')"); await tick(page, 700);
    say("desktop delete dialog: " + J(await page.evaluate(() => (document.querySelector("[role=dialog], dialog")?.innerText))));
    await page.locator("[role=dialog] button:has-text('Delete'), dialog button:has-text('Delete')").last().click(); await tick(page, 2000);
    const pd = path.join(h.projectsDir, readdirSync(h.projectsDir)[0]);
    say("desktop tree after delete: " + J(outline(await treeRows(page))));
    say("desktop .trash files: " + J(walkFiles(path.join(pd, ".trash")).map((p) => rel(path.join(pd, ".trash"), p).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (m) => m.slice(0, 4)))));
    await clickTab(page, "Trash");
    say("desktop Trash tab: " + J(await page.evaluate(() => document.querySelector("[data-testid=trash-view]")?.innerText)));
    await page.locator('input[aria-label="Select Desk Doc"]').check();
    await page.locator("[data-testid=trash-restore-selected]").click(); await tick(page, 600);
    await page.locator("[role=dialog] button, dialog button").filter({ hasText: /^Restore$/i }).last().click(); await tick(page, 2500);
    say("desktop after restore: report " + J(await page.evaluate(() => document.querySelector("[data-testid=trash-batch-report]")?.innerText)) + "; tree " + J(outline(await treeRows(page))));
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
