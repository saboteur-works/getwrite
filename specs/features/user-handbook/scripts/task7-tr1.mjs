// Task 7, web build: protect-and-finish/trash.md rows TR-01..TR-11. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, clickTab, typeAndSave, expandRevisions, revCards, projectDir, walkFiles, rel, tick, openSettings, closeSettings, sidebarText, pm, treeRows, outline, expandAll, reloadProject, step, sidecars, sidecarByName } from "./task7-lib.mjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const P = "Trash A";
const short = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 4));
const dialog = (page) => page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; });
async function del(page, name) {
  await expandAll(page);
  await page.click(`button[aria-label="${name} options"]`);
  await page.click(".resource-context-menu-item:has-text('Delete')");
  await tick(page, 700);
  const d = await dialog(page);
  await page.locator("[role=dialog] button:has-text('Delete'), dialog button:has-text('Delete')").last().click();
  await tick(page, 2000);
  return d;
}
const toEdit = async (page) => { await treeClick(page, "Solo"); const t = page.locator('[role=tab]:has-text("Edit")').first(); if (await t.count()) await t.click(); await page.waitForTimeout(800); };
const tree = async (page) => { await expandAll(page); return outline(await treeRows(page)); };
const trashView = (page) => page.evaluate(() => document.querySelector("[data-testid=trash-view]")?.innerText);
const trashRows = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=trash-row]")].map((r) => r.innerText.replace(/\n+/g, " / ")));
const trashDisk = (pd) => walkFiles(path.join(pd, ".trash")).map((p) => short(rel(path.join(pd, ".trash"), p)));
async function trashAct(page, names, action) {
  for (const n of names) await page.locator(`input[aria-label="Select ${n}"]`).check();
  await tick(page, 300);
  await page.locator(`[data-testid=${action}]`).click(); await tick(page, 700);
  const d = await dialog(page);
  await page.locator("[role=dialog] button, dialog button").filter({ hasText: /^(Restore|Delete permanently)$/i }).last().click();
  await tick(page, 2500);
  return d;
}
const notices = (page) => page.evaluate(() => ({ report: document.querySelector("[data-testid=trash-batch-report]")?.innerText ?? null, notices: [...document.querySelectorAll("[data-testid=trash-restore-notice]")].map((n) => n.innerText), error: document.querySelector("[data-testid=trash-batch-error]")?.innerText ?? null, empty: document.querySelector("[data-testid=trash-empty-state]")?.innerText ?? null }));
await withWeb("t7-tr1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, P, "Blank");
  const pd = projectDir(h);
  // ---- A: a resource with content, metadata, revisions
  await step("A", async () => {
    await createNode(page, "Solo", "text");
    await typeAndSave(page, "Solo", "Solo words here.", 5000);
    await expandRevisions(page);
    for (const n of ["S1", "S2"]) { const i = page.locator("#revision-control-content input[placeholder='Revision name']"); await i.fill(n); await page.locator("#revision-control-content button:has-text('Save')").click(); await tick(page, 1500); }
    const id = sidecarByName(h, "Solo").json.id;
    const before = walkFiles(pd).map((p) => short(rel(pd, p))).filter((p) => p.includes(id.slice(0, 4)) || p.includes(id));
    say("A before delete, files of Solo: " + J(before));
    say("A cards before: " + J((await revCards(page)).map((c) => c.name + " " + c.sub + (c.badges.length ? " [" + c.badges + "]" : ""))));
    say("A tree before: " + J(await tree(page)));
    const d = await del(page, "Solo");
    say("TR-01 confirm dialog: " + J(d));
    say("TR-01 tree after delete: " + J(await tree(page)));
    say("TR-01/02 files of Solo in the project outside .trash: " + J(walkFiles(pd).map((p) => short(rel(pd, p))).filter((p) => !p.startsWith(".trash") && p.includes(id.slice(0, 4)))));
    say("TR-01/02 .trash files: " + J(trashDisk(pd)));
    await clickTab(page, "Trash");
    say("TR-04 Trash tab: " + J(await trashView(page)));
    say("TR-04 rows: " + J(await trashRows(page)));
    const d2 = await trashAct(page, ["Solo"], "trash-restore-selected");
    say("TR-05 restore dialog: " + J(d2));
    say("TR-07 notices: " + J(await notices(page)));
    say("TR-07 tree after restore (no reload): " + J(await tree(page)));
    say("TR-02 .trash files after restore: " + J(trashDisk(pd)));
    say("TR-02 files of Solo restored: " + J(walkFiles(pd).map((p) => short(rel(pd, p))).filter((p) => !p.startsWith(".trash") && p.includes(id.slice(0, 4)))));
    await clickTab(page, "Edit"); await treeClick(page, "Solo"); await expandRevisions(page);
    say("TR-02 after restore: editor " + J(await pm(page).innerText()) + " ; cards " + J((await revCards(page)).map((c) => c.name + " " + c.sub + (c.badges.length ? " [" + c.badges + "]" : ""))));
  });
  // ---- B: position inside a folder
  await step("B", async () => {
    await createNode(page, "Fold", "folder", "Workspace");
    await reloadProject(page, P);
    for (const n of ["A1", "A2", "A3"]) await createNode(page, n, "text", "Fold");
    await reloadProject(page, P);
    say("B tree before: " + J(await tree(page)));
    await del(page, "A2");
    say("B tree after deleting A2: " + J(await tree(page)));
    await clickTab(page, "Trash");
    await trashAct(page, ["A2"], "trash-restore-selected");
    say("TR-07 B notices: " + J(await notices(page)));
    say("TR-07 B tree after restore (no reload): " + J(await tree(page)));
    await reloadProject(page, P);
    say("TR-07 B tree after restore + reload: " + J(await tree(page)));
  });
  // ---- C: folder cascade
  await step("C", async () => {
    await createNode(page, "Sub", "folder", "Fold");
    await reloadProject(page, P);
    await createNode(page, "Deep", "text", "Sub");
    await reloadProject(page, P);
    say("C tree before: " + J(await tree(page)));
    const d = await del(page, "Fold");
    say("TR-03 folder delete dialog: " + J(d));
    say("TR-03 tree after: " + J(await tree(page)));
    await clickTab(page, "Trash");
    say("TR-03/04 Trash tab: " + J(await trashView(page)));
    say("TR-03 .trash files: " + J(trashDisk(pd)));
    await trashAct(page, ["Fold"], "trash-restore-selected");
    say("TR-03 restore notices: " + J(await notices(page)));
    await reloadProject(page, P);
    say("TR-03 tree after restoring the folder + reload: " + J(await tree(page)));
  });
  // ---- D: original folder gone -> project root
  await step("D", async () => {
    await createNode(page, "Gone", "folder", "Workspace");
    await reloadProject(page, P);
    await createNode(page, "Orphan", "text", "Gone");
    await reloadProject(page, P);
    await del(page, "Orphan");
    await del(page, "Gone");
    await clickTab(page, "Trash");
    say("TR-08 Trash tab rows: " + J(await trashRows(page)));
    await trashAct(page, ["Orphan"], "trash-restore-selected");
    say("TR-08 notices: " + J(await notices(page)));
    await reloadProject(page, P);
    say("TR-08 tree after restoring Orphan only: " + J(await tree(page)));
    say("TR-08 Orphan sidecar folderId: " + J(sidecarByName(h, "Orphan").json.folderId ?? null));
    say("TR-08 Trash still holds: " + J(await trashRows(page)));
  });
  // ---- E: name collision
  await step("E", async () => {
    await toEdit(page);
    await createNode(page, "Dup", "text");
    await del(page, "Dup");
    await createNode(page, "Dup", "text");
    say("TR-09 tree with a new Dup: " + J(await tree(page)));
    await clickTab(page, "Trash");
    await trashAct(page, ["Dup"], "trash-restore-selected");
    say("TR-09 notices: " + J(await notices(page)));
    await reloadProject(page, P);
    say("TR-09 tree after restore: " + J(await tree(page)));
  });
  // ---- F: references re-linked on restore
  await step("F", async () => {
    await openSettings(page, "Metadata");
    for (const n of [/^Timeline/, /Point of View/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
    await closeSettings(page);
    await toEdit(page);
    await createNode(page, "Mara", "text"); await createNode(page, "Scene R", "text");
    await treeClick(page, "Scene R");
    await page.fill("input[aria-label=pov-input]", "Mar"); await tick(page, 900);
    await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 1800);
    const pov = () => J(sidecarByName(h, "Scene R").json.userMetadata?.pov ?? null);
    say("TR-10 Scene R pov before: " + pov() + " ; Mara id " + sidecarByName(h, "Mara").json.id);
    await del(page, "Mara");
    say("TR-10 pov after Mara deleted (disk): " + pov());
    await treeClick(page, "Scene R");
    say("TR-10 sidebar POV input after delete: " + J(await page.locator("input[aria-label=pov-input]").inputValue()));
    await clickTab(page, "Trash");
    say("TR-10 .trash files: " + J(trashDisk(pd).filter((x) => x.includes("refs"))));
    await trashAct(page, ["Mara"], "trash-restore-selected");
    say("TR-10 notices: " + J(await notices(page)));
    say("TR-10 pov after restore (disk): " + pov() + " ; Mara id " + sidecarByName(h, "Mara").json.id);
    await reloadProject(page, P); await treeClick(page, "Scene R");
    say("TR-10 sidebar POV input after restore and reload: " + J(await page.locator("input[aria-label=pov-input]").inputValue()));
  });
  // ---- G: batch restore, permanent delete, Empty trash
  await step("G", async () => {
    await toEdit(page);
    for (const n of ["G1", "G2", "G3"]) await createNode(page, n, "text");
    for (const n of ["G1", "G2", "G3"]) await del(page, n);
    await clickTab(page, "Trash");
    say("TR-05 Trash rows: " + J(await trashRows(page)));
    say("TR-05 toolbar: " + J(await page.$$eval("[data-testid=trash-batch-toolbar] button", (b) => b.map((x) => x.innerText + (x.disabled ? "(disabled)" : "")))));
    const d = await trashAct(page, ["G1", "G2"], "trash-restore-selected");
    say("TR-05 batch restore dialog: " + J(d) + " ; report " + J(await notices(page)));
    say("TR-05 Trash rows after: " + J(await trashRows(page)));
    const g3id = sidecars(h).find((s) => s.json.name === "G3") ? "present" : "n/a";
    const before = trashDisk(pd);
    const d3 = await trashAct(page, ["G3"], "trash-delete-selected");
    say("TR-11 permanent delete dialog: " + J(d3) + " ; report " + J(await notices(page)));
    say("TR-11 Trash rows after: " + J(await trashRows(page)));
    say("TR-11 .trash files before: " + J(before.length) + " after: " + J(trashDisk(pd).length) + " ; G3 files left anywhere: " + J(walkFiles(pd).map((p) => short(rel(pd, p))).filter((p) => /G3/.test(p))));
    say("TR-11 G3 sidecar anywhere: " + J(sidecars(h).filter((s) => s.json.name === "G3").length) + "; tree: " + J(await tree(page)));
    // Empty trash
    await toEdit(page);
    for (const n of ["G1", "G2"]) await del(page, n);
    await clickTab(page, "Trash");
    say("TR-06 Trash rows before Empty trash: " + J(await trashRows(page)));
    await page.locator("[data-testid=trash-empty-trash]").click(); await tick(page, 700);
    say("TR-06 Empty trash dialog: " + J(await dialog(page)));
    await page.locator("[role=dialog] button, dialog button").filter({ hasText: /^Delete permanently$/i }).last().click(); await tick(page, 2500);
    say("TR-06 after: " + J(await notices(page)) + " ; .trash files: " + J(trashDisk(pd)));
    say("TR-06 tree after: " + J(await tree(page)));
  });
});
