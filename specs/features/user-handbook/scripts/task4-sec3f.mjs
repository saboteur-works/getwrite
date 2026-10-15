// Task 4, web build: per-resource word-count goal change and clear (W-21, W-24), font-family suggestions (H-08). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, pm, newProjectWithDoc, waitSaved } from "./task4-lib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const sidecar = (h) => { const d = path.join(h.projectsDir, readdirSync(h.projectsDir)[0], "meta"); return readdirSync(d).filter((f) => f.endsWith(".meta.json")).map((f) => JSON.parse(readFileSync(path.join(d, f), "utf8")).wordCountGoal); };
await withWeb("t4sec3f", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Goal2", "Doc One");
  await pm(page).click();
  await page.keyboard.type("one two three four five six");
  await waitSaved(page);
  const inp = page.locator('input[aria-label="word-count-goal-input"]');
  for (const v of ["10", "4", "", "abc", "-3", "2.5", "0"]) {
    await inp.fill(v);
    await page.waitForTimeout(1500);
    say(`W-21/24 resource goal input ${J(v)}: sidecar wordCountGoal=${J(sidecar(h))}; progress ${J((await bodyText(page)).split("\n").filter((l) => /words ·/.test(l)))}; alert ${J(await page.$$eval("[role=alert]", (e) => e.map((x) => x.textContent.trim())))}`);
  }
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings"); await page.waitForTimeout(600);
  await page.locator('[role=dialog] [role=tab]:has-text("Editor")').click(); await page.waitForTimeout(500);
  say(`H-08 font-family datalist options: ${J(await page.$$eval("datalist option", (o) => o.map((x) => x.value)))}; datalist ids ${J(await page.$$eval("datalist", (d) => d.map((x) => x.id)))}`);
});
