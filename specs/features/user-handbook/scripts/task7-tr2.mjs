// Task 7, web build: trash.md TR-10 (references re-linked on restore) with a custom resource-reference field, and TR-12 web part. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, clickTab, projectDir, walkFiles, rel, tick, openSettings, closeSettings, sidebarText, addSidebarField, reloadProject, step, sidecarByName, expandAll } from "./task7-lib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
const P = "Trash B";
const dialog = (page) => page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; });
async function del(page, name) {
  await expandAll(page);
  await page.click(`button[aria-label="${name} options"]`);
  await page.click(".resource-context-menu-item:has-text('Delete')");
  await tick(page, 700);
  await page.locator("[role=dialog] button:has-text('Delete'), dialog button:has-text('Delete')").last().click();
  await tick(page, 2000);
}
const notices = (page) => page.evaluate(() => ({ report: document.querySelector("[data-testid=trash-batch-report]")?.innerText ?? null, notices: [...document.querySelectorAll("[data-testid=trash-restore-notice]")].map((n) => n.innerText) }));
await withWeb("t7-tr2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, P, "Blank");
  const pd = projectDir(h);
  for (const n of ["Target", "Other", "Linker", "Linker2", "Multi"]) await createNode(page, n, "text");
  await reloadProject(page, P);
  const addRef = async (res, name, label, type) => { await treeClick(page, res); await addSidebarField(page, name, label, type, "Document"); };
  await addRef("Linker", "friend", "Friend", "Ref");
  say("Linker controls: " + J(await page.evaluate(() => [...document.querySelectorAll("[aria-label=friend],[aria-label=mfriends]")].map((e) => e.tagName + "|" + e.getAttribute("aria-label") + "|" + e.type))));
  const pick = async (field, typed, name) => { await page.fill(`input[aria-label=${field}]`, typed); await tick(page, 900); await page.locator(`li:text-is('${name}')`).first().click(); await tick(page, 1800); };
  await treeClick(page, "Linker"); await pick("friend", "Tar", "Target");
  await treeClick(page, "Linker2"); await page.click('button[aria-label="add-metadata-field"]').catch(() => {});
  await page.keyboard.press("Escape");
  await treeClick(page, "Linker2");
  say("Linker2 has friend control: " + (await page.locator("input[aria-label=friend]").count()));
  if (await page.locator("input[aria-label=friend]").count()) await pick("friend", "Tar", "Target");
  const um = (n) => J(sidecarByName(h, n).json.userMetadata ?? null);
  say("before: Linker " + um("Linker") + " ; Linker2 " + um("Linker2") + " ; Target id " + sidecarByName(h, "Target").json.id);
  await del(page, "Target");
  say("TR-10 after Target deleted: Linker " + um("Linker") + " ; Linker2 " + um("Linker2"));
  await treeClick(page, "Linker");
  say("TR-10 Linker sidebar friend input: " + J(await page.locator("input[aria-label=friend]").inputValue()));
  const refsFile = walkFiles(path.join(pd, ".trash/meta")).find((p) => /refs-/.test(p));
  say("TR-10 refs record: " + J(refsFile ? JSON.parse(readFileSync(refsFile, "utf8")) : null));
  // Linker2 repointed to Other while Target is in Trash
  await treeClick(page, "Linker2"); if (await page.locator("input[aria-label=friend]").count()) await pick("friend", "Oth", "Other");
  say("TR-10 Linker2 repointed to Other: " + um("Linker2"));
  await clickTab(page, "Trash");
  await page.locator('input[aria-label="Select Target"]').check();
  await page.locator("[data-testid=trash-restore-selected]").click(); await tick(page, 600);
  await page.locator("[role=dialog] button, dialog button").filter({ hasText: /^Restore$/i }).last().click(); await tick(page, 2500);
  say("TR-10 notices: " + J(await notices(page)));
  say("TR-10 after restore: Linker " + um("Linker") + " ; Linker2 " + um("Linker2") + " ; Target id " + sidecarByName(h, "Target").json.id);
  await reloadProject(page, P); await treeClick(page, "Linker");
  say("TR-10 Linker sidebar friend input after restore + reload: " + J(await page.locator("input[aria-label=friend]").inputValue()));
});
