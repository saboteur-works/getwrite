// Task 8, web build: project-configuration.md rows PC-11 (timelineView edited by hand) and PC-13 (what the Organizer card shows for each card body setting). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeInto, step, openSettings, reloadProject, tick, dlg, projectDir, readPj, writePj, bodyText, closeDlg, sidebarText, expandAll } from "./task8-lib.mjs";
await withWeb("t8-p8", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await closeDlg(page); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  await createProject(page, h, "Cfg Four", "Blank");
  const pd = projectDir(h);
  await createNode(page, "Doc One", "text");
  await typeInto(page, "Doc One", "0123456789 ".repeat(30));
  await treeClick(page, "Doc One"); await page.selectOption("select[aria-label=status]", { label: "Published" }); await tick(page, 1800);
  await S("PC-11 by hand", async () => {
    const o = readPj(pd); o.config.features = { timelineView: true }; writePj(pd, o);
    await reloadProject(page, "Cfg Four"); await treeClick(page, "Doc One");
    const t = await sidebarText(page);
    say("PC-11 features.timelineView=true by hand (no timeline key): sidebar has TIMELINE group=" + J(/\nTIMELINE\n/.test(t)) + " ; Timeline tab: " + J(await page.$$eval("[role=tab]", (x) => x.filter((e) => /TIMELINE/i.test(e.innerText)).map((e) => ({ disabled: e.disabled || e.getAttribute("aria-disabled"), title: e.getAttribute("title") })))) + " ; config.features now " + J(readPj(pd).config.features));
    await openSettings(page, "Metadata");
    say("PC-11 Metadata tab Timeline switch checked=" + J(await page.getByRole("checkbox", { name: /^Timeline/ }).first().isChecked()));
  });
  await S("PC-13 card body", async () => {
    const o = readPj(pd); delete o.config.features; writePj(pd, o);
    await reloadProject(page, "Cfg Four");
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await tick(page, 1500);
    const card = async () => (await page.$$eval("[aria-labelledby^='res-']", (c) => c.map((x) => x.innerText.replace(/\n+/g, " | ")))).join(" || ");
    say("PC-13 default (no organizerCardBody): cards=" + J(await card()) + " ; config=" + J(readPj(pd).config.organizerCardBody));
    for (const label of ["None", "Text excerpt", "Status"]) {
      await openSettings(page, "Organizer"); await page.selectOption("#organizer-card-body-source", { label }); await tick(page, 1200); await closeDlg(page); await tick(page, 600);
      say(`PC-13 ${label}: config=${J(readPj(pd).config.organizerCardBody)} ; cards=${J(await card())}`);
    }
    await openSettings(page, "Organizer"); await page.selectOption("#organizer-card-body-source", { label: "Text excerpt" }); await page.fill("#organizer-card-body-excerpt-length", "40"); await page.locator("#organizer-card-body-excerpt-length").blur(); await tick(page, 1200); await closeDlg(page); await tick(page, 600);
    say(`PC-13 Text excerpt, length 40: config=${J(readPj(pd).config.organizerCardBody)} ; cards=${J(await card())}`);
  });
});
