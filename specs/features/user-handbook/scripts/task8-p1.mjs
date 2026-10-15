// Task 8, web build: project-configuration.md rows PC-01..PC-12 (file, keys, defaults, features, subtypes, statuses). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeInto, expandAll, step, openSettings, closeSettings, reloadProject, tick, dlg, projectDir, readPj, writePj, bodyText, sidebarText, pm, sidecarByName, closeDlg } from "./task8-lib.mjs";
import { readdirSync } from "node:fs";
import path from "node:path";
const cfg = (pd) => readPj(pd).config;
await withWeb("t8-p1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await closeDlg(page); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  await page.goto(h.baseUrl + "/"); await tick(page, 1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await tick(page, 600);
  say("PC-04 New project dialog: " + J(await dlg(page)));
  say("PC-04 New project dialog inputs: " + J(await page.$$eval("[role=dialog] input, dialog input, [role=dialog] textarea, dialog textarea", (o) => o.map((x) => x.tagName + "|" + (x.getAttribute("aria-label") || x.name || x.id || x.placeholder || "") + "|" + x.type))));
  await page.keyboard.press("Escape");
  await createProject(page, h, "Cfg One", "Blank");
  const pd = projectDir(h);
  await S("PC-01/02/03 file", async () => {
    say("PC-01 projects folder entries: " + J(readdirSync(h.projectsDir)) + "; project folder entries: " + J(readdirSync(pd)));
    say("PC-01 project.json top-level keys: " + J(Object.keys(readPj(pd))) + "; name=" + J(readPj(pd).name));
    say("PC-05/06 config keys and defaults in a new Blank project: " + J(Object.fromEntries(Object.entries(cfg(pd)).filter(([k]) => k !== "editorConfig"))) + "; top-level maxRevisions/autoPrune present: " + J(["maxRevisions", "autoPrune", "description"].map((k) => [k, k in readPj(pd)])));
    say("PC-09 features key present in a new project: " + J("features" in cfg(pd)));
  });
  await S("PC-03 name by hand", async () => {
    const o = readPj(pd); o.name = "Cfg Renamed"; o.description = "A hand-written description"; writePj(pd, o);
    await page.reload(); await tick(page, 2000);
    say("PC-03/04 Start Page after editing name+description by hand and reloading: " + J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 25)));
    await page.click('button[aria-label="Open Cfg Renamed"]'); await tick(page, 2000);
    say("PC-04 after opening: project.json keys " + J(Object.keys(readPj(pd))) + " description=" + J(readPj(pd).description) + " name=" + J(readPj(pd).name));
    say("PC-03 header shows name: " + J((await bodyText(page)).split("\n").slice(0, 4)));
  });
  await S("PC-27 edit while open", async () => {
    const o = readPj(pd); o.name = "Cfg Edited While Open"; writePj(pd, o);
    await tick(page, 2500);
    say("PC-27 header 2.5 s after editing project.json with the project open: " + J((await bodyText(page)).split("\n").slice(0, 4)));
    await page.reload(); await tick(page, 2000);
    say("PC-27 Start Page after reload: " + J((await bodyText(page)).split("\n").filter((l) => /Cfg/.test(l))));
    await page.click('button[aria-label="Open Cfg Edited While Open"]'); await tick(page, 2000);
    say("PC-27 header after reopening: " + J((await bodyText(page)).split("\n").slice(0, 4)));
    const o2 = readPj(pd); o2.name = "Cfg One"; writePj(pd, o2);
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Cfg One"]'); await tick(page, 2000);
  });
  await S("PC-07 statuses", async () => {
    await createNode(page, "Doc One", "text"); await tick(page, 500);
    await treeClick(page, "Doc One");
    say("PC-07 sidebar Status options before: " + J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent))));
    const o = readPj(pd); o.config.statuses = ["Outline", "First Draft", "Revised", "Final"]; writePj(pd, o);
    await reloadProject(page, "Cfg One"); await treeClick(page, "Doc One");
    say("PC-07 sidebar Status options after config.statuses edited by hand + reopen: " + J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent))));
    await page.selectOption("select[aria-label=status]", { label: "Revised" }); await tick(page, 1800);
    say("PC-07 chosen status stored: " + J(sidecarByName(h, "Doc One").json.userMetadata?.status) + "; config.statuses after the app wrote: " + J(cfg(pd).statuses));
  });
  await S("PC-08 subtypes", async () => {
    await openSettings(page, "Metadata");
    for (const n of ["Scene", "Chapter", "Act"]) { await page.fill("input[aria-label=subtype-new]", n); await page.locator("[role=dialog] button:text-is('ADD'), dialog button:text-is('ADD'), [role=dialog] button:text-is('Add'), dialog button:text-is('Add')").first().click(); await tick(page, 900); }
    say("PC-08 config.subtypes after adding Scene, Chapter, Act in Metadata tab: " + J(cfg(pd).subtypes));
    say("PC-08 subtype controls: " + J(await page.$$eval("[role=dialog] button[aria-label], dialog button[aria-label]", (o) => o.map((x) => x.getAttribute("aria-label")).filter((l) => /subtype|Scene|Chapter|Act/i.test(l)))));
    const down = page.locator("[role=dialog] button[aria-label*='Move Scene down'], dialog button[aria-label*='Move Scene down'], [role=dialog] button[aria-label*='Move down'], dialog button[aria-label*='Move down']").first();
    if (await down.count()) { await down.click(); await tick(page, 900); }
    say("PC-08 config.subtypes after moving the first entry down: " + J(cfg(pd).subtypes));
    await closeDlg(page);
  });
  await S("PC-09..12 features", async () => {
    await openSettings(page, "Metadata");
    const toggle = async (n) => { await page.getByRole("checkbox", { name: new RegExp("^" + n) }).first().click(); await tick(page, 1200); };
    for (const n of ["Timeline", "Point of View", "Synopsis", "Notes"]) { await toggle(n); say(`PC-09 after switching ${n} on in Metadata tab: config.features=${J(cfg(pd).features)}`); }
    for (const n of ["Timeline", "Point of View", "Synopsis", "Notes"]) await toggle(n);
    say("PC-09 after switching all four back off: " + J(cfg(pd).features));
    await closeDlg(page);
    await openSettings(page, "Timeline");
    say("PC-10/11 Timeline tab: " + J((await dlg(page)).split("\n").slice(12, 20)));
    await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1200);
    say("PC-11 after Enable Timeline view only: config.features=" + J(cfg(pd).features));
    await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1200);
    say("PC-11 after switching Timeline view off again: config.features=" + J(cfg(pd).features));
    await closeDlg(page);
    await openSettings(page, "Entities");
    say("PC-12 Entities tab before enabling Entities: " + J((await dlg(page)).split("\n").slice(12, 24)) + " checkboxes=" + J(await page.$$eval("[role=dialog] input[type=checkbox], dialog input[type=checkbox]", (o) => o.map((x) => (x.id || x.getAttribute("aria-label") || "") + ":" + x.checked))));
    await page.getByRole("checkbox", { name: /^Entities/ }).first().click(); await tick(page, 1200);
    say("PC-12 after Entities on: config.features=" + J(cfg(pd).features) + " ; tab text: " + J((await dlg(page)).split("\n").slice(12, 26)));
    await page.getByRole("checkbox", { name: /Entity highlighting|Highlight/i }).first().click(); await tick(page, 1200);
    say("PC-12 after Entity highlighting on: config.features=" + J(cfg(pd).features));
    await closeDlg(page);
    // highlighting effect
    await treeClick(page, "Doc One"); await page.fill("input[aria-label=entity-kind-input]", "character"); await page.locator("input[aria-label=entity-kind-input]").blur(); await tick(page, 2500);
    await createNode(page, "Scene Text", "text"); await typeInto(page, "Scene Text", "Doc One walked in the rain.");
    const hl = async () => page.evaluate(() => document.querySelectorAll(".ProseMirror .entity-highlight").length);
    await reloadProject(page, "Cfg One"); await treeClick(page, "Scene Text"); await tick(page, 2000);
    say("PC-12 highlighted matches in Scene Text with entities + highlighting on: " + (await hl()));
    await openSettings(page, "Entities");
    await page.getByRole("checkbox", { name: /^Entities/ }).first().click(); await tick(page, 1200);
    say("PC-12 after switching Entities off: config.features=" + J(cfg(pd).features) + " ; tab text: " + J((await dlg(page)).split("\n").slice(12, 24)));
    await closeDlg(page);
    await reloadProject(page, "Cfg One"); await treeClick(page, "Scene Text"); await tick(page, 2000);
    say("PC-12 highlighted matches with entities off: " + (await hl()));
    const o = readPj(pd); o.config.features = { ...(o.config.features || {}), entities: false, entityHighlighting: true }; writePj(pd, o);
    await reloadProject(page, "Cfg One"); await treeClick(page, "Scene Text"); await tick(page, 2000);
    say("PC-12 with features.entities=false, entityHighlighting=true edited by hand: matches=" + (await hl()) + " config.features=" + J(cfg(pd).features));
    await openSettings(page, "Entities");
    say("PC-12 Entities tab with entities off and entityHighlighting true: " + J((await dlg(page)).split("\n").slice(12, 24)));
    await closeDlg(page);
  });
});
