// Task 8, web build: project-configuration.md rows PC-24..PC-26 (the example files), PC-29 (invalid config). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, step, reloadProject, tick, projectDir, readPj, writePj, bodyText, closeDlg } from "./task8-lib.mjs";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { assertThrowaway, LOG_DIR } from "./lib/safety.mjs";
import path from "node:path";
const U = (n) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
await withWeb("t8-p4", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await closeDlg(page); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  assertThrowaway(h.projectsDir);
  const mk = (n, json, folderId = U(n)) => { const d = path.join(h.projectsDir, folderId); mkdirSync(d); assertThrowaway(d); writeFileSync(path.join(d, "project.json"), JSON.stringify(json, null, 2)); return d; };
  const cards = async () => { await page.goto(h.baseUrl + "/"); await tick(page, 2500); return (await bodyText(page)).split("\n").filter((l) => /^V[A-D] |ACTIVE PROJECT/.test(l)); };
  await S("PC-24..26 loadability of the example files", async () => {
    mk(1, { name: "VA only name and maxRevisions", maxRevisions: 50 });
    say("PC-25 folder holding only {name, maxRevisions}: Start Page lines " + J(await cards()));
    mk(2, { id: U(2), name: "VB plus id", maxRevisions: 50 });
    say("PC-25 + id: " + J(await cards()));
    mk(3, { id: U(3), name: "VC plus id and createdAt", createdAt: "2026-10-14T10:00:00.000Z", maxRevisions: 50 });
    say("PC-25 + id + createdAt: " + J(await cards()));
    mk(4, { id: U(4), name: "VD id differs from folder", createdAt: "2026-10-14T10:00:00.000Z" }, "bbbbbbbb-0000-4000-8000-0000000000ff");
    say("PC-25 id different from the folder name, + createdAt: " + J(await cards()));
    await page.click('button[aria-label="Open VC plus id and createdAt"]').catch(() => say("no card VC")); await tick(page, 2500);
    const d = path.join(h.projectsDir, U(3));
    say("PC-25 after opening VC: folder " + J(readdirSync(d)) + " ; project.json " + J(readPj(d)));
  });
  await S("PC-24 examples merged into an app-created project", async () => {
    await createProject(page, h, "Example One", "Blank");
    const pd = projectDir(h, "x");
    const all = readdirSync(h.projectsDir).map((x) => path.join(h.projectsDir, x)).filter((x) => { try { return readPj(x).name === "Example One"; } catch { return false; } });
    const d = all[0];
    const base = readPj(d);
    say("PC-24 created project folder: " + J(readdirSync(d)) + " ; top-level keys " + J(Object.keys(base)));
    base.name = "My Novel"; base.maxRevisions = 100; base.config.statuses = ["Outline", "First Draft", "Revised", "Final"]; writePj(d, base);
    await reloadProject(page, "My Novel");
    await createNode(page, "Chapter 1", "text"); await treeClick(page, "Chapter 1");
    say("PC-24 Status options after merging the 'custom statuses' example: " + J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent))));
    const after = readPj(d); say("PC-24 project.json after the app wrote: top-level maxRevisions=" + J(after.maxRevisions) + " config.maxRevisions=" + J(after.config.maxRevisions) + " name=" + J(after.name) + " statuses=" + J(after.config.statuses));
    const b2 = readPj(d); b2.name = "Novel Draft"; b2.description = "Work-in-progress novel"; b2.maxRevisions = 200; b2.autoPrune = true; writePj(d, b2);
    await reloadProject(page, "Novel Draft");
    const a2 = readPj(d); say("PC-26 after merging the 'recommended' example and reopening: name=" + J(a2.name) + " description=" + J(a2.description) + " top-level maxRevisions/autoPrune=" + J([a2.maxRevisions, a2.autoPrune]) + " config.maxRevisions/autoPrune=" + J([a2.config.maxRevisions, a2.config.autoPrune]));
    // PC-29 invalid config
    const b3 = readPj(d); b3.config.maxRevisions = "abc"; b3.config.statuses = "oops"; b3.config.features = { timeline: "yes" }; writePj(d, b3);
    await page.goto(h.baseUrl + "/"); await tick(page, 2500);
    say("PC-29 Start Page with config.maxRevisions='abc', statuses='oops', features.timeline='yes': " + J((await bodyText(page)).split("\n").filter((l) => /Novel Draft|ACTIVE|error|invalid|could not|failed|valid/i.test(l))));
    const card = page.locator('button[aria-label="Open Novel Draft"]'); say("PC-29 Open button count: " + (await card.count()));
    if (await card.count()) { await card.click(); await tick(page, 3000); say("PC-29 after opening: " + J((await bodyText(page)).split("\n").slice(0, 12))); say("PC-29 project.json config after open: " + J(readPj(d).config)); }
    const log = path.join(LOG_DIR, `${h.run.runId}-server.log`);
    const lines = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => /valid|schema|zod|invalid|Error|issues/i.test(l)).slice(0, 8).map((l) => l.replaceAll(/\/(private\/)?tmp\/getwrite-handbook\/[^\s"]*/g, "<throwaway>").slice(0, 300)) : null;
    say("PC-29 server log lines matching valid|schema|zod|invalid|Error|issues: " + J(lines));
  });
});
