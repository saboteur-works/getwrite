// Task 8, web build: project-configuration.md rows PC-08, PC-13..PC-23, PC-30, PC-32..PC-34. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeInto, expandAll, step, openSettings, closeSettings, reloadProject, tick, dlg, projectDir, readPj, writePj, bodyText, sidebarText, sidecarByName, closeDlg, clickTab, walkFiles } from "./task8-lib.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const cfg = (pd) => readPj(pd).config;
await withWeb("t8-p2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await closeDlg(page); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  await createProject(page, h, "Cfg Two", "Blank");
  const pd = projectDir(h);
  await createNode(page, "Doc One", "text"); await typeInto(page, "Doc One", "Some words for the card and the goal. ".repeat(6));
  await S("PC-08 subtypes", async () => {
    await openSettings(page, "Metadata");
    for (const n of ["Scene", "Chapter", "Act"]) { await page.fill("#subtype-new", n); await page.locator("[role=dialog] button:text-is('ADD'), dialog button:text-is('ADD'), [role=dialog] button:text-is('Add'), dialog button:text-is('Add')").first().click(); await tick(page, 900); }
    say("PC-08 config.subtypes after adding Scene, Chapter, Act in the Metadata tab: " + J(cfg(pd).subtypes));
    await page.locator("[role=dialog] button[aria-label='Move Scene down'], dialog button[aria-label='Move Scene down']").first().click(); await tick(page, 900);
    say("PC-08 config.subtypes after Move Scene down: " + J(cfg(pd).subtypes));
    await closeDlg(page);
    await treeClick(page, "Doc One");
    say("PC-08 sidebar Subtype choices: " + J(await page.$$eval("select", (s) => s.map((x) => [...x.options].map((o) => o.textContent)).filter((o) => o.includes("No subtype")))));
  });
  await S("PC-13 organizerCardBody", async () => {
    say("PC-13 organizerCardBody in a new project: " + J("organizerCardBody" in cfg(pd)));
    await openSettings(page, "Organizer");
    say("PC-13 Organizer tab options: " + J(await page.$$eval("#organizer-card-body-source option", (o) => o.map((x) => x.value + "=" + x.textContent))));
    for (const label of ["None", "Text excerpt", "Status"]) { await page.selectOption("#organizer-card-body-source", { label }); await tick(page, 1200); say(`PC-13 after choosing ${label}: config.organizerCardBody=${J(cfg(pd).organizerCardBody)}`); }
    await page.selectOption("#organizer-card-body-source", { label: "Text excerpt" }); await tick(page, 800);
    const len = page.locator("#organizer-card-body-excerpt-length");
    say("PC-13 excerpt length box value: " + J(await len.inputValue()));
    await len.fill("120"); await len.blur(); await tick(page, 1200);
    say("PC-13 after excerpt length 120: " + J(cfg(pd).organizerCardBody));
    await closeDlg(page);
  });
  await S("PC-14..21 goals", async () => {
    await openSettings(page, "Writing Goals");
    say("PC-14 config.dailyWordGoal/wordCountGoal in a new project: " + J(["dailyWordGoal", "wordCountGoal"].map((k) => [k, k in cfg(pd)])));
    const save = async (field, val, btn) => { await page.fill(field, val); await page.locator(`[role=dialog] button:has-text('${btn}'), dialog button:has-text('${btn}')`).first().click(); await tick(page, 1400); };
    await save("#daily-word-goal", "500", "SAVE DAILY GOAL");
    say("PC-14 after saving 500 as the daily goal: config.dailyWordGoal=" + J(cfg(pd).dailyWordGoal) + " ; status line=" + J((await dlg(page)).split("\n").filter((l) => /saved|cleared/i.test(l))));
    await save("#project-word-count-goal", "20000", "SAVE WORD-COUNT GOAL");
    say("PC-16 after saving 20000 as the total goal: config.wordCountGoal=" + J(cfg(pd).wordCountGoal) + " dailyWordGoal=" + J(cfg(pd).dailyWordGoal) + " ; status=" + J((await dlg(page)).split("\n").filter((l) => /saved|cleared/i.test(l))));
    for (const v of ["-5", "1.5", "abc", "0"]) { await save("#daily-word-goal", v, "SAVE DAILY GOAL"); say(`PC-14 daily goal input ${J(v)}: config.dailyWordGoal=${J(cfg(pd).dailyWordGoal)} ; lines=${J((await dlg(page)).split("\n").filter((l) => /whole|saved|cleared|valid|number|0 or more/i.test(l)))}`); }
    for (const v of ["-5", "1.5", "0"]) { await save("#project-word-count-goal", v, "SAVE WORD-COUNT GOAL"); say(`PC-16 total goal input ${J(v)}: config.wordCountGoal=${J(cfg(pd).wordCountGoal)} ; lines=${J((await dlg(page)).split("\n").filter((l) => /whole|saved|cleared|valid|number|0 or more/i.test(l)))}`); }
    await save("#daily-word-goal", "500", "SAVE DAILY GOAL"); await save("#project-word-count-goal", "20000", "SAVE WORD-COUNT GOAL");
    await closeDlg(page);
    await openSettings(page, "Writing Goals");
    say("PC-18 reopened Project Settings without a reload: daily field=" + J(await page.inputValue("#daily-word-goal")) + " total field=" + J(await page.inputValue("#project-word-count-goal")) + " ; on disk daily=" + J(cfg(pd).dailyWordGoal) + " total=" + J(cfg(pd).wordCountGoal));
    await closeDlg(page);
    await reloadProject(page, "Cfg Two"); await openSettings(page, "Writing Goals");
    say("PC-18 after reload + reopen: daily field=" + J(await page.inputValue("#daily-word-goal")) + " total field=" + J(await page.inputValue("#project-word-count-goal")));
    await save("#daily-word-goal", "", "SAVE DAILY GOAL"); await save("#project-word-count-goal", "", "SAVE WORD-COUNT GOAL");
    say("PC-14/16 after clearing both fields and saving: config keys " + J(Object.keys(cfg(pd)).filter((k) => /Goal/.test(k))) + " ; lines=" + J((await dlg(page)).split("\n").filter((l) => /saved|cleared/i.test(l))));
    await save("#project-word-count-goal", "200", "SAVE WORD-COUNT GOAL");
    await closeDlg(page);
  });
  await S("PC-17/19/20/21 progress and resource goal", async () => {
    await reloadProject(page, "Cfg Two"); await treeClick(page, "Doc One");
    const sbGoal = async () => page.evaluate(() => { const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim().toUpperCase() === "WORD COUNT GOAL" && e.closest("section,div")); return null; });
    void sbGoal;
    say("PC-19 sidebar goal input present: " + (await page.locator("input[aria-label=word-count-goal-input]").count()) + " ; value=" + J(await page.locator("input[aria-label=word-count-goal-input]").first().inputValue()));
    await page.fill("input[aria-label=word-count-goal-input]", "100"); await page.locator("input[aria-label=word-count-goal-input]").blur(); await tick(page, 2000);
    say("PC-19 sidecar wordCountGoal after typing 100: " + J(sidecarByName(h, "Doc One").json.wordCountGoal));
    const bars = () => page.evaluate(() => [...document.querySelectorAll("[role=progressbar]")].map((b) => ({ now: b.getAttribute("aria-valuenow"), max: b.getAttribute("aria-valuemax"), label: b.getAttribute("aria-label"), bg: getComputedStyle(b).backgroundColor, fillBg: b.firstElementChild ? getComputedStyle(b.firstElementChild).backgroundColor : null, where: b.closest("section,aside,[class*=sidebar]")?.tagName })));
    say("PC-20 progress bars on the page with the resource goal set: " + J(await bars()));
    say("PC-20 sidebar text near the goal: " + J((await sidebarText(page)).split("\n").filter(Boolean).slice(-12)));
    await page.fill("input[aria-label=word-count-goal-input]", ""); await page.locator("input[aria-label=word-count-goal-input]").blur(); await tick(page, 2000);
    say("PC-19 sidecar wordCountGoal after clearing the field: " + J("wordCountGoal" in sidecarByName(h, "Doc One").json) + " bars=" + J((await bars()).length));
    await page.fill("input[aria-label=word-count-goal-input]", "100"); await page.locator("input[aria-label=word-count-goal-input]").blur(); await tick(page, 2000);
    await clickTab(page, "Data");
    const dv = await bodyText(page);
    say("PC-21 Data view text with a resource goal (100) and a project goal (200) set: " + J(dv.split("\n").filter(Boolean).slice(8, 60)));
    say("PC-17 Data view progress bars: " + J(await bars()));
    say("PC-21 Data view mentions 'goal'? " + J(dv.split("\n").filter((l) => /goal/i.test(l))));
    await clickTab(page, "Edit");
    say("PC-17 footer/editor text with project goal set: " + J((await bodyText(page)).split("\n").filter((l) => /goal|Words:|Today/i.test(l)).slice(0, 8)));
  });
  await S("PC-22/23 noise words", async () => {
    await openSettings(page, "Noise Words");
    await page.fill("#new-custom-noise-word", "gloom"); await page.locator("[role=dialog] button:has-text('Add word'), dialog button:has-text('Add word')").click(); await tick(page, 1200);
    say("PC-22 config.customNoiseWords after adding 'gloom' in Project Settings > Noise Words: " + J(cfg(pd).customNoiseWords));
    await closeDlg(page);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Close Project"); await tick(page, 1500);
    await page.click('button[aria-label="App Settings"]'); await tick(page, 600);
    say("PC-23 App Settings dialog: " + J((await dlg(page)).split("\n").slice(0, 8)));
    await page.fill('input[aria-label="New noise word"]', "mirth"); await page.keyboard.press("Enter"); await tick(page, 1200);
    say("PC-23 App Settings after adding 'mirth': " + J((await dlg(page)).split("\n").filter((l) => /mirth/i.test(l))));
    await closeDlg(page);
    await page.click('button[aria-label="Open Cfg Two"]'); await tick(page, 2000);
    await openSettings(page, "Noise Words");
    say("PC-23 Noise Words tab with 'mirth' on the global list: " + J((await dlg(page)).split("\n").slice(12, 40)));
    const cb = page.locator("#exclude-global-noise-word-mirth");
    await cb.check(); await tick(page, 1200);
    say("PC-23 config.excludedGlobalNoiseWords after ticking 'mirth': " + J(cfg(pd).excludedGlobalNoiseWords) + " ; customNoiseWords=" + J(cfg(pd).customNoiseWords));
    await closeDlg(page);
  });
  await S("PC-32/33 tags", async () => {
    await openSettings(page, "Manage Tags");
    await page.fill("input[aria-label='New tag name']", "flashback"); await page.keyboard.press("Enter"); await tick(page, 1200);
    say("PC-32 config.tags after creating 'flashback' in Manage Tags: " + J(cfg(pd).tags) + " ; tagAssignments=" + J(cfg(pd).tagAssignments));
    await closeDlg(page);
    await reloadProject(page, "Cfg Two"); await treeClick(page, "Doc One");
    const tagBtn = page.locator("button[aria-pressed]").filter({ hasText: /flashback/i }).first();
    await tagBtn.click(); await tick(page, 1800);
    say("PC-32 config.tags / tagAssignments after assigning it to Doc One in the sidebar: " + J(cfg(pd).tags) + " / " + J(cfg(pd).tagAssignments) + " ; Doc One id=" + J(sidecarByName(h, "Doc One").json.id));
    const o = readPj(pd); o.config.tags.push({ id: "11111111-1111-4111-8111-111111111111", name: "added-by-hand", color: "#888888" }); writePj(pd, o);
    await reloadProject(page, "Cfg Two"); await openSettings(page, "Manage Tags");
    say("PC-33 Manage Tags after a tag was added to config.tags by hand and the project reopened: " + J((await dlg(page)).split("\n").filter((l) => /flashback|added-by-hand|Delete/i.test(l))));
    await closeDlg(page);
  });
  await S("PC-30 meta key", async () => {
    say("PC-30 project.json top-level keys now: " + J(Object.keys(readPj(pd))) + " ; config keys: " + J(Object.keys(cfg(pd))) + " ; any 'meta' key anywhere in project.json: " + J(/"meta"/.test(readFileSync(path.join(pd, "project.json"), "utf8"))));
  });
  await S("PC-34 jq", async () => {
    const src = path.join(pd, "project.json"), tmp = path.join(h.run.dir, "pj.tmp.json");
    const out = execFileSync("jq", [".name = \"Edited With jq\" | .config.statuses = [\"Idea\",\"Done\"]", src]);
    (await import("node:fs")).writeFileSync(tmp, out); (await import("node:fs")).copyFileSync(tmp, src);
    say("PC-34 jq version: " + execFileSync("jq", ["--version"]).toString().trim() + " ; after jq edit name=" + J(readPj(pd).name) + " statuses=" + J(cfg(pd).statuses));
    await page.reload(); await tick(page, 2000);
    say("PC-34 Start Page after reload: " + J((await bodyText(page)).split("\n").filter((l) => /Cfg|Edited/.test(l))));
    await page.click('button[aria-label="Open Edited With jq"]'); await tick(page, 2000); await treeClick(page, "Doc One");
    say("PC-34 Status options after reopening: " + J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent))));
  });
});
