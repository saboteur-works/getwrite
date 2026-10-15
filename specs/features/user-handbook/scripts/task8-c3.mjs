// Task 8, web build: compiling.md label spelling (textContent versus displayed text) in the compile dialog. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, tick } from "./task8-lib.mjs";
await withWeb("t8-c3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Cmp Three", "Blank");
  await createNode(page, "One Doc", "text");
  await page.click('button[aria-label="Open project menu"]'); await page.locator("text=Compile Project").first().click(); await tick(page, 900);
  say("dialog buttons textContent: " + J(await page.$$eval("[role=dialog] button, dialog button", (b) => b.map((x) => x.textContent.trim()))));
  say("dialog labels textContent: " + J(await page.$$eval("[role=dialog] label, dialog label", (b) => b.map((x) => x.textContent.trim()))));
  say("dialog headings textContent: " + J(await page.$$eval("[role=dialog] h1,[role=dialog] h2,[role=dialog] h3, dialog h2", (b) => b.map((x) => x.textContent.trim()))));
  await page.keyboard.press("Escape"); await tick(page, 400);
  await page.click('button[aria-label="Open project menu"]');
  say("project menu items textContent: " + J(await page.$$eval("[role=menuitem], .resource-context-menu-item, [role=menu] button", (b) => b.map((x) => x.textContent.trim()))));
});
