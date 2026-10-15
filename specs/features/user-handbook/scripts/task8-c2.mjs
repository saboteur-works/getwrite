// Task 8, web build: compiling.md row C-02 (Start Page Package with a resource at the project root; re-check of Task 3's D-3). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeInto, expandAll, step, tick, dlg, projectDir, sidecarByName, bodyText, closeProject, reloadProject } from "./task8-lib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
await withWeb("t8-c2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Cmp Two", "Blank");
  const pd = projectDir(h);
  await page.click("button:has-text('CREATE RESOURCE')");
  await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("Root Doc");
  await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click(); await tick(page, 2500);
  await createNode(page, "Inner Doc", "text", "Workspace");
  await reloadProject(page, "Cmp Two");
  const sc = (n) => sidecarByName(h, n).json;
  say("Root Doc folderId=" + J(sc("Root Doc").folderId ?? null) + " ; Inner Doc folderId=" + J(sc("Inner Doc").folderId ?? null));
  await typeInto(page, "Root Doc", "Root text here."); await typeInto(page, "Inner Doc", "Inner text here.");
  say("tree: " + J(await page.$$eval("[role=treeitem]", (e) => e.map((x) => x.getAttribute("aria-label")))));
  await page.click('button[aria-label="Open project menu"]'); await page.locator("text=Compile Project").first().click(); await tick(page, 900);
  say("C-02 in-project Compile Project list: " + J((await dlg(page)).split("\n").filter(Boolean)));
  await page.keyboard.press("Escape"); await tick(page, 500);
  await closeProject(page); await page.reload(); await tick(page, 2000);
  await page.click('button[aria-label="Manage Cmp Two"]'); await page.locator("text=Package").first().click(); await tick(page, 1000);
  say("C-02 Start Page Package list: " + J((await dlg(page)).split("\n").filter(Boolean)));
  await page.click("button:has-text('SELECT ALL')"); await tick(page, 300);
  const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
  await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click();
  const d = await dl; if (d) { const fp = path.join(h.run.dir, "x-" + d.suggestedFilename()); await d.saveAs(fp); say("C-02 Start Page compile " + d.suggestedFilename() + ": " + J(readFileSync(fp, "utf8"))); } else say("no download");
});
