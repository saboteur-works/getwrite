// Task 7, web build: revisions.md RV-11 (revision without a name). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, typeAndSave, expandRevisions, revCards, projectDir, walkFiles, tick, openSettings, closeSettings, dialogText, pm } from "./task7-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
await withWeb("t7-rv3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Name A", "Blank");
  await openSettings(page, "Default Revision Name");
  say("dialog: " + J(await dialogText(page)));
  say("controls: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input,[role=dialog] button, dialog input, dialog button")].map((b) => b.tagName + "|" + (b.getAttribute("aria-label") || "") + "|" + (b.innerText || b.value || "").trim() + "|" + (b.disabled ? "disabled" : "")))));
  const inp = page.locator("input:visible").first();
  say("input value: " + J(await inp.inputValue()));
  await inp.fill("");
  await tick(page, 400);
  say("controls after clearing: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button, dialog button")].map((b) => (b.innerText || "").trim() + (b.disabled ? "(disabled)" : "")))));
  const save = page.locator("button:visible:has-text('Save Changes')").first();
  if (await save.count()) { await save.click().catch((e) => say("save click: " + e.message.split("\n")[0])); await tick(page, 1500); }
  say("after save attempt dialog: " + J(await dialogText(page)));
  const pj = () => JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config;
  say("project.json defaultRevisionName: " + J(pj().defaultRevisionName) + "; keys: " + J(Object.keys(pj())));
  await closeSettings(page).catch(() => {});
  await page.keyboard.press("Escape");
  await createNode(page, "Blank Name", "text");
  await typeAndSave(page, "Blank Name", "Some words.");
  await expandRevisions(page);
  say("new doc cards after blank default name: " + J(await revCards(page)));
  // hand edit: remove the name from a revision's metadata.json in the throwaway folder
  const pd = projectDir(h);
  const mf = walkFiles(path.join(pd, "revisions")).filter((p) => p.endsWith("metadata.json"));
  for (const f of mf) { const m = JSON.parse(readFileSync(f, "utf8")); say(`before edit ${path.basename(path.dirname(f))}: metadata=${J(m.metadata)}`); delete m.metadata.name; writeFileSync(f, JSON.stringify(m, null, 2)); }
  await page.reload(); await tick(page, 2000);
  await page.click('button[aria-label="Open Name A"]'); await tick(page, 2000);
  await treeClick(page, "Blank Name"); await expandRevisions(page);
  say("after removing metadata.name by hand and reloading, cards: " + J(await revCards(page)));
  // second revision unnamed too: save a named one, remove, reload
});
