// Task 8, web build: project-configuration.md rows PC-23 (exclusion), PC-24..PC-26 (examples), PC-29 (invalid config). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, step, openSettings, reloadProject, tick, dlg, projectDir, readPj, writePj, bodyText, closeDlg } from "./task8-lib.mjs";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { assertThrowaway, LOG_DIR } from "./lib/safety.mjs";
import path from "node:path";
const EX = {
  statuses: { name: "My Novel", maxRevisions: 100, config: { statuses: ["Outline", "First Draft", "Revised", "Final"] } },
  minimal: { name: "My Novel Minimal", maxRevisions: 50 },
  recommended: { name: "Novel Draft", description: "Work-in-progress novel", maxRevisions: 200, autoPrune: true },
};
await withWeb("t8-p3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await closeDlg(page); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  assertThrowaway(h.projectsDir);
  const dirs = {};
  for (const [k, v] of Object.entries(EX)) {
    const id = { statuses: "aaaaaaaa-0000-4000-8000-000000000001", minimal: "aaaaaaaa-0000-4000-8000-000000000002", recommended: "aaaaaaaa-0000-4000-8000-000000000003" }[k];
    const d = path.join(h.projectsDir, id); mkdirSync(d); assertThrowaway(d); writeFileSync(path.join(d, "project.json"), JSON.stringify(v, null, 2)); dirs[k] = d;
  }
  say("PC-24..26 hand-made project folders contain only project.json: " + J(Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, readdirSync(d)]))));
  await S("PC-24..26 examples", async () => {
    await page.goto(h.baseUrl + "/"); await tick(page, 2500);
    say("PC-24..26 Start Page cards: " + J((await bodyText(page)).split("\n").filter((l) => /My Novel|Novel Draft|ACTIVE PROJECT|resources/.test(l))));
    for (const [k, nm] of [["statuses", "My Novel"], ["minimal", "My Novel Minimal"], ["recommended", "Novel Draft"]]) {
      await page.goto(h.baseUrl + "/"); await tick(page, 1800);
      await page.click(`button[aria-label="Open ${nm}"]`); await tick(page, 2500);
      say(`PC-${k} opened ${nm}: header=${J((await bodyText(page)).split("\n").slice(0, 4))}; project folder now: ${J(readdirSync(dirs[k]))}; project.json keys=${J(Object.keys(readPj(dirs[k])))} config keys=${J(Object.keys(readPj(dirs[k]).config ?? {}))}`);
      say(`PC-${k} project.json maxRevisions/autoPrune at top level=${J([readPj(dirs[k]).maxRevisions, readPj(dirs[k]).autoPrune])} ; config.maxRevisions/autoPrune=${J([readPj(dirs[k]).config?.maxRevisions, readPj(dirs[k]).config?.autoPrune])} ; config.statuses=${J(readPj(dirs[k]).config?.statuses)}`);
      if (k === "statuses") {
        await page.click('button[aria-label="Workspace options"]').catch(() => {});
        await page.keyboard.press("Escape");
        const n = await page.locator("button:has-text('CREATE RESOURCE')").count();
        say("PC-statuses empty-state CREATE RESOURCE button count: " + n);
        if (n) { await page.click("button:has-text('CREATE RESOURCE')"); await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("First"); await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click(); await tick(page, 2500); await treeClick(page, "First"); say("PC-statuses Status options in the sidebar: " + J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent)))); }
      }
    }
  });
  await S("PC-29 invalid config", async () => {
    await page.goto(h.baseUrl + "/"); await tick(page, 1500);
    const d = dirs.recommended; const o = readPj(d);
    o.config = { maxRevisions: "abc", statuses: "oops", features: { timeline: "yes" } }; writePj(d, o);
    await page.reload(); await tick(page, 2500);
    say("PC-29 Start Page with an invalid config in Novel Draft: " + J((await bodyText(page)).split("\n").filter((l) => /Novel Draft|error|invalid|could not|failed/i.test(l))));
    const card = page.locator('button[aria-label="Open Novel Draft"]');
    say("PC-29 Open button present: " + (await card.count()));
    if (await card.count()) { await card.click(); await tick(page, 3000); say("PC-29 after opening: " + J((await bodyText(page)).split("\n").slice(0, 12))); say("PC-29 project.json config after open: " + J(readPj(d).config)); }
    const log = path.join(LOG_DIR, `${h.run.runId}-server.log`);
    const lines = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => /valid|schema|zod|invalid|Error/i.test(l)).slice(0, 8).map((l) => l.replaceAll(/\/tmp\/getwrite-handbook\/[^\s"]*/g, "<throwaway>").slice(0, 300)) : null;
    say("PC-29 server log lines matching valid|schema|zod|invalid|Error: " + J(lines));
  });
  await S("PC-23 exclusion", async () => {
    await page.goto(h.baseUrl + "/"); await tick(page, 1500);
    await createProject(page, h, "Cfg Three", "Blank");
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Close Project"); await tick(page, 1500);
    await page.click('button[aria-label="App Settings"]'); await tick(page, 600);
    await page.fill('input[aria-label="New noise word"]', "mirth"); await page.keyboard.press("Enter"); await tick(page, 1200);
    await closeDlg(page);
    await page.click('button[aria-label="Open Cfg Three"]'); await tick(page, 2000);
    await openSettings(page, "Noise Words");
    const cbs = await page.$$eval("[role=dialog] input[type=checkbox], dialog input[type=checkbox]", (o) => o.map((x) => ({ id: x.id, checked: x.checked, label: x.labels?.[0]?.innerText })).filter((x) => /noise/.test(x.id)));
    say("PC-23 exclusion checkboxes: " + J(cbs));
    const cb = page.locator("input[id^='exclude-global-noise-word-']").first();
    await cb.click(); await tick(page, 1500);
    const find = () => { const all = readdirSync(h.projectsDir).map((x) => path.join(h.projectsDir, x, "project.json")).filter(existsSync).map((p) => JSON.parse(readFileSync(p, "utf8"))).find((j) => j.name === "Cfg Three"); return all?.config; };
    say("PC-23 after ticking the box: checked=" + (await cb.isChecked()) + " config.excludedGlobalNoiseWords=" + J(find()?.excludedGlobalNoiseWords) + " customNoiseWords=" + J(find()?.customNoiseWords));
    await cb.click(); await tick(page, 1500);
    say("PC-23 after unticking: checked=" + (await cb.isChecked()) + " config.excludedGlobalNoiseWords=" + J(find()?.excludedGlobalNoiseWords));
  });
});
