// Task 8, web build: project-configuration.md label spelling (textContent versus displayed text) for the goal controls. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, openSettings, tick, dlg, closeDlg, sidebarText } from "./task8-lib.mjs";
await withWeb("t8-p10", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Cfg Six", "Blank");
  await createNode(page, "Doc One", "text"); await treeClick(page, "Doc One");
  say("sidebar goal section labels textContent: " + J(await page.$$eval("label, h3, h4, h2", (e) => e.map((x) => x.textContent.trim()).filter((t) => /goal/i.test(t)))));
  await openSettings(page, "Writing Goals");
  say("Writing Goals buttons textContent: " + J(await page.$$eval("[role=dialog] button, dialog button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /save/i.test(t)))));
  say("Writing Goals labels/headings: " + J(await page.$$eval("[role=dialog] label, [role=dialog] h3, dialog label, dialog h3", (e) => e.map((x) => x.textContent.trim()))));
  await closeDlg(page);
  await openSettings(page, "Metadata");
  say("Metadata tab subtype buttons textContent: " + J(await page.$$eval("[role=dialog] button, dialog button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /^add$/i.test(t) || /Move|Remove/.test(t)))));
  await closeDlg(page);
  await openSettings(page, "Noise Words");
  say("Noise Words buttons/labels: " + J(await page.$$eval("[role=dialog] button, [role=dialog] label, dialog button, dialog label", (b) => b.map((x) => x.textContent.trim()).filter((t) => /add|exclude/i.test(t)))));
  await closeDlg(page);
  await page.click('button[aria-label="Open project menu"]');
  await page.click('button[aria-label="Open project menu"]').catch(() => {});
});
