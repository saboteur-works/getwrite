// Task 5, web build: story/metadata.md rows M-65, M-66 (entity mentions, compile this entity), M-67, M-68 (colour mode and status list location). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, createNode, treeClick, openSettings, closeSettings, dialogText, sidebarText, sidecarByName, projectJson, projectDir, pm, createProject } from "./task5-lib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
await withWeb("t5-m5", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  const P = "Ent Test";
  await newProjectWithDoc(page, h, P, "Elena");
  await createNode(page, "Scene One", "text"); await createNode(page, "Scene Two", "text");
  await openSettings(page, "Entities");
  await page.getByRole("checkbox", { name: /^Entities/ }).first().click(); await tick(page, 1500);
  await closeSettings(page);
  await treeClick(page, "Elena");
  await page.fill("input[aria-label=entity-kind-input]", "character"); await page.locator("input[aria-label=entity-kind-input]").blur(); await tick(page, 2500);
  say(`Elena sidecar: entityKind=${J(sidecarByName(h, "Elena").json.entityKind)}`);
  for (const [n, t] of [["Scene One", "Elena walked home alone."], ["Scene Two", "Then Elena left the house."]]) {
    await treeClick(page, n);
    for (let i = 0; i < 40; i++) { if (!((await page.evaluate(() => document.querySelector(".ProseMirror")?.innerText || "")).trim())) break; await page.waitForTimeout(250); }
    await pm(page).click(); await page.keyboard.insertText(t); await tick(page, 6000);
  }
  await step("M-65 mentions", async () => {
    await page.reload(); await tick(page, 2000); await page.click(`button[aria-label="Open ${P}"]`); await tick(page, 2000);
    await treeClick(page, "Elena"); await tick(page, 2000);
    const t = await sidebarText(page);
    say(`M-65 Elena's sidebar sections: ${J(t.split("\n").filter((l) => /^[A-Z][A-Z ]+$/.test(l)))}`);
    const i = t.indexOf("ENTITY MENTIONS");
    say(`M-65 text under ENTITY MENTIONS: ${J(t.slice(i, i + 700))}`);
    say(`M-66 compile controls in the sidebar: ${J(await page.$$eval("button", (b) => b.map((x) => x.getAttribute("aria-label") || x.innerText.trim()).filter((s) => /compile/i.test(s))))}`);
  });
  await step("M-66 compile", async () => {
    const btn = page.locator("button:has-text('Compile')").first();
    say(`M-66 compile button text: ${J(await btn.innerText())}`);
    await btn.click(); await tick(page, 2500);
    say(`M-66 after clicking: dialog=${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText.slice(0, 900) : null; }))}`);
    const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await page.locator("[role=dialog] button:has-text('Compile (2)'), dialog button:has-text('Compile (2)')").first().click(); await tick(page, 3000);
    const d = await dl;
    say(`M-66 after Compile (2) with the default format: download event=${J(d ? d.suggestedFilename() : null)}; dialog now=${J(await page.evaluate(() => { const x = document.querySelector("[role=dialog], dialog"); return x ? x.innerText.slice(0, 500) : null; }))}`);
    if (d) { const fp = path.join(h.run.dir, "compiled-" + d.suggestedFilename()); await d.saveAs(fp); say(`M-66 downloaded file content (throwaway): ${J(readFileSync(fp, "utf8").slice(0, 400))}`); }
    await page.keyboard.press("Escape"); await tick(page, 600);
  });
  await step("M-67 colour mode + status list", async () => {
    const pj = () => readFileSync(path.join(projectDir(h), "project.json"), "utf8");
    const before = pj();
    const ls0 = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    say(`M-67 before: html class=${J(await page.evaluate(() => document.documentElement.className))}; data-theme=${J(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))}; localStorage=${J(ls0)}`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Switch to dark mode"); await tick(page, 2000);
    const after = pj();
    say(`M-67 after Switch to dark mode: html class=${J(await page.evaluate(() => document.documentElement.className))}; data-theme=${J(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))}; localStorage=${J(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))))}; project.json changed=${before !== after}; menu now offers=${J((await bodyText(page)).split("\n").filter((l) => /Switch to (light|dark) mode/.test(l)))}`);
    if (before !== after) say(`M-67 project.json after (config keys): ${J(Object.keys(JSON.parse(after).config))}; preferences-like keys: ${J(Object.entries(JSON.parse(after).config).filter(([k]) => /theme|color|mode|dark/i.test(k)))}`);
    await page.keyboard.press("Escape");
    await page.reload(); await tick(page, 2500);
    say(`M-67 after a reload: html class=${J(await page.evaluate(() => document.documentElement.className))}`);
    await page.click(`button[aria-label="Open ${P}"]`); await tick(page, 1500);
    await createProject(page, h, "Second", "Blank");
    say(`M-67 in a second new project: html class=${J(await page.evaluate(() => document.documentElement.className))}`);
    const second = path.join(h.projectsDir);
    say(`M-68 config.statuses of the first project (default): ${J(projectJson(h).config.statuses)}`);
  });
});
