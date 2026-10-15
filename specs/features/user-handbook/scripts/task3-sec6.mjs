// Task 3, web build: Resource Tree "move" row R-05. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, expandAll, treeRows, outline } from "./task3-lib.mjs";
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
await withWeb("web", {}, async ({ h, page }) => {
  const mk = async (title, type) => {
    await page.click("button:has-text('CREATE RESOURCE')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
    if (type !== "text") await page.selectOption("select", type);
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
  };
  await createProject(page, h, "Move Test", "Blank");
  await mk("Target Folder", "folder");
  await mk("Mover Doc", "text");
  await page.reload(); await page.waitForTimeout(2000);
  await page.click('button[aria-label="Open Move Test"]'); await page.waitForTimeout(2000);
  await expandAll(page);
  say(`R-05 before move: ${J(outline(await treeRows(page)))}`);
  await step("R-05", async () => {
    await page.click('button[aria-label="Mover Doc options"]');
    await page.click(".resource-context-menu-item:has-text('Move to')");
    await page.waitForTimeout(600);
    await page.click("[role=dialog] button:has-text('Project Root'), dialog button:has-text('Project Root')");
    await page.waitForTimeout(500);
    say(`R-05 destination choices: ${J(await page.$$eval("[role=option], [role=menuitem], [role=listbox] *, [role=tree] *, [role=treeitem]", (els) => els.map((e) => (e.textContent || "").trim().slice(0, 30)).filter(Boolean)))}`);
    await page.locator("[role=dialog] >> text=Target Folder").last().click();
    await page.waitForTimeout(300);
    await page.click("[role=dialog] button:has-text('Move'):not(:has-text('Cancel')), dialog button:has-text('Move'):not(:has-text('Cancel'))");
    await page.waitForTimeout(2000);
    await expandAll(page);
    say(`R-05 after move: ${J(outline(await treeRows(page)))}`);
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Move Test"]'); await page.waitForTimeout(2000);
    await expandAll(page);
    say(`R-05 after reload: ${J(outline(await treeRows(page)))}`);
  });
});
