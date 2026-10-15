// Task 6, web build: views/entity-roster.md ER-08 (custom and global noise-word lists). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, openSettings, closeSettings, dialogText, sidecars, reloadProject, projectDir } from "./task6-rlib.mjs";
import { enableEntities, declare } from "./task6-rlib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
const roster = (page) => page.evaluate(() => { const l = (document.body.innerText || "").split("\n"); const i = l.indexOf("⌘K"); const j = l.lastIndexOf("METADATA"); return l.slice(i + 1, j); });
const flagged = async (page) => { const r = await roster(page); const out = {}; let cur = null; for (const l of r) { if (["Bob", "Zed", "Quill"].includes(l)) cur = l; if (/^Needs attention:/.test(l) && cur) out[cur] = l; } return out; };
await withWeb("t6-r3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "En", "Blank");
  for (const n of ["Zed", "Bob", "Quill"]) await createNode(page, n, "text");
  await enableEntities(page);
  await declare(page, "Zed", "place"); await declare(page, "Bob", "character"); await declare(page, "Quill", "object");
  await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2500);
  say("ER-08 baseline (no custom, no global words): flagged=" + J(await flagged(page)));
  await step("custom", async () => {
    await openSettings(page, "Noise Words");
    const inp = page.getByLabel("Add a custom noise word");
    say("custom input count=" + await inp.count());
    await inp.fill("Zed"); await page.locator("button:has-text('ADD WORD')").click(); await tick(page, 1800);
    say("Noise Words tab after adding Zed: " + J((await dialogText(page)).split("\n").slice(-14)));
    say("project.json config noise lists: " + J((({ customNoiseWords, excludedGlobalNoiseWords }) => ({ customNoiseWords, excludedGlobalNoiseWords }))(JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config)));
    await closeSettings(page);
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2000);
    say("ER-08 after custom noise word Zed: flagged=" + J(await flagged(page)));
  });
  await step("global", async () => {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await page.click("button:has-text('APP SETTINGS')"); await tick(page, 1200);
    say("App Settings dialog: " + J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : "(none)"; })));
    say("App Settings controls: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input, dialog input, [role=dialog] button, dialog button")].map((e) => `${e.tagName}|${e.getAttribute("aria-label") || ""}|${(e.innerText || e.placeholder || "").slice(0, 30)}`))));
    const gi = page.locator("[role=dialog] input[type=text], dialog input[type=text]").first();
    await gi.fill("Bob"); await page.locator("[role=dialog] button:has-text('Add'), dialog button:has-text('Add')").first().click(); await tick(page, 1800);
    say("App Settings after adding Bob: " + J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText.slice(0, 600) : "(none)"; })));
    await page.locator("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')").first().click(); await tick(page, 800);
    await page.click('button[aria-label="Open En"]'); await tick(page, 2500);
    await treeClick(page, "Zed"); await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2500);
    say("ER-08 after global noise word Bob: flagged=" + J(await flagged(page)));
    await openSettings(page, "Noise Words");
    say("project Noise Words tab lists the global word: " + J((await dialogText(page)).split("\n").slice(-6)) + " ; checkboxes=" + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input[type=checkbox]")].map((c) => `${c.getAttribute("aria-label") || c.closest("label")?.innerText}=${c.checked}`).filter((t) => /Bob|xclude|oise/i.test(t)))));
    const cb = page.locator("[role=dialog] label:has-text('Bob') input[type=checkbox]").first();
    if (await cb.count()) { await cb.click(); await tick(page, 1500); }
    await closeSettings(page);
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2500);
    say("ER-08 after excluding the global word Bob in this project: flagged=" + J(await flagged(page)) + " ; excluded=" + J(JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config.excludedGlobalNoiseWords));
  });
});
