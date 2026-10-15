// Task 3, web build: project types rows P-03..P-16. Throwaway templates copy. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, closeProject, expandAll, treeRows, outline } from "./task3-lib.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n")[0]}`); } };
await withWeb("web", { copyTemplates: true }, async ({ h, page }) => {
  await step("P-03..11", async () => {
    for (const t of ["Article", "Blank", "Game Writing", "Novel", "Poetry and Lyrics", "Serial"]) {
      await createProject(page, h, "P " + t, t);
      await expandAll(page);
      say(`TYPE ${t} outline: ${J(outline(await treeRows(page)))}`);
      const m = (await bodyText(page)).match(/RECENT FILES[\s\S]*?METADATA/);
      say(`TYPE ${t} recent files: ${J(m ? m[0].split("\n").filter(Boolean) : null)}`);
      await closeProject(page);
    }
  });
  await step("P-12", async () => {
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open project settings menu"]');
    say(`P-12 gear menu items on Start Page: ${J(await page.$$eval("[role=menuitem]", (e) => e.map((x) => x.textContent.trim())))}`);
    await page.click("text=Project Type Manager");
    await page.waitForTimeout(1500);
    say(`P-12 manager header and list: ${J((await bodyText(page)).split("\n").filter(Boolean).filter((l) => /Project Type Management|View, create|TEMPLATES|\.json|NEW PROJECT TYPE/.test(l)))}`);
    say(`P-12 buttons: ${J(await page.$$eval("[role=dialog] button, dialog button", (els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)).filter(Boolean)))}`);
  });
  const tdir = h.templatesDir;
  const snap = () => Object.fromEntries(readdirSync(tdir).filter((f) => f.endsWith(".json")).map((f) => [f, statSync(path.join(tdir, f)).mtimeMs + ":" + statSync(path.join(tdir, f)).size]));
  const before = snap();
  await step("P-14", async () => {
    await page.click("button:has-text('Novel'):has-text('novel.json')");
    await page.waitForTimeout(600);
    const nameIn = page.locator('input[placeholder="Novel"]');
    say(`P-14 edit form: name value ${J(await nameIn.inputValue())}`);
    await nameIn.fill("Novel Edited");
    await page.waitForTimeout(500);
    say(`P-14 after typing: list entry text ${J((await bodyText(page)).split("\n").filter((l) => /Novel|UNSAVED|Unsaved/i.test(l)))}`);
    await nameIn.press("Enter");
    await page.waitForTimeout(800);
    say(`P-14 save-like controls (button texts matching save/apply/update/delete): ${J(await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim()).filter((t) => /save|apply|update|delete|publish|write/i.test(t))))}`);
    say(`P-14 right-click on list entry: ${J(await (async () => { await page.click("button:has-text('Blank'):has-text('blank.json')", { button: "right" }); await page.waitForTimeout(500); return page.$$eval("[role=menu] *, [role=menuitem]", (e) => e.map((x) => x.textContent.trim()).filter(Boolean)); })())}`);
  });
  await step("P-13", async () => {
    await page.click("button:has-text('New Project Type')");
    await page.waitForTimeout(500);
    await page.fill('input[placeholder="novel"]', "zz-test");
    await page.fill('input[placeholder="Novel"]', "ZZ Test Type");
    await page.waitForTimeout(500);
    say(`P-13 after filling new type: list ${J((await bodyText(page)).split("\n").filter((l) => /ZZ Test|UNSAVED|new draft/i.test(l)))}`);
  });
  await step("P-15", async () => {
    say(`P-15 default folder / default resource controls present: ${J(await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim()).filter((t) => /Add (Folder|Default Folder|Resource|Status)/i.test(t))))}`);
    await page.click("button:has-text('Add Default Folder')");
    await page.click("button:has-text('Add Resource')");
    await page.waitForTimeout(500);
    say(`P-15 after clicking Add Default Folder and Add Resource: remove buttons ${J(await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim()).filter((t) => /^Remove/i.test(t)).length))}`);
  });
  await step("P-14/16 persistence", async () => {
    const after = snap();
    say(`P-14/16 template files changed on disk (throwaway copy): ${J(Object.keys(after).filter((k) => after[k] !== before[k]))}; files now ${J(Object.keys(after))}`);
    await page.click("button:has-text('Close')");
    await page.waitForTimeout(500);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Project Type Manager");
    await page.waitForTimeout(1500);
    say(`P-14/16 reopened list: ${J((await bodyText(page)).split("\n").filter((l) => /\.json|ZZ Test|Edited/.test(l)))}`);
    await page.click("button:has-text('Close')");
    await page.click("button:has-text('Start a New Project')");
    await page.waitForTimeout(700);
    say(`P-14 New Project dialog types: ${J(await page.$$eval("select option", (os) => os.map((o) => o.textContent.slice(0, 40))))}`);
  });
  await step("P-16", async () => {
    // is there any control that deletes a project type?
    await page.keyboard.press("Escape");
    say(`P-16 files still on disk: ${J(readdirSync(tdir).filter((f) => f.endsWith(".json")))}`);
  });
});
