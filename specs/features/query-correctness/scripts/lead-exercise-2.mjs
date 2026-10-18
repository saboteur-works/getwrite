// Feature 86 Stage 6.5 (pipeline lead), second pass: the Tags value box (Q-24) through the input the chip actually renders,
// and the Organizer status filter (D-20) in a Blank project. Run OUTSIDE the sandbox.
import { withWeb, say, J, step, chips, setField, setOp, tick, setupData, queryHelpers, projectDir, projectJson, newProjectWithDoc } from "../../user-handbook/scripts/task5-qlib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

await withWeb("f86-lead-c", {}, async ({ h, page }) => {
  await setupData(page, h, "Q Test");
  const { newQuery, saveAs, run } = queryHelpers(page, h);
  const def = (name) => readdirSync(path.join(projectDir(h), "meta/queries")).map((f) => JSON.parse(readFileSync(path.join(projectDir(h), "meta/queries", f), "utf8"))).find((j) => j.name === name)?.definition;
  await step("Q-24 Tags value box", async () => {
    await newQuery(); await setField(page, 0, "Tags"); await setOp(page, 0, "includes");
    const inp = chips(page).nth(0).locator(".filter-chip__slot--value input").first();
    say(`Q-24 Tags value input: aria-label=${J(await inp.getAttribute("aria-label"))}; placeholder=${J(await inp.getAttribute("placeholder"))}`);
    for (const t of ["flash", "Scene", "Mara"]) {
      await inp.fill(t); await tick(page, 900);
      say(`Q-24 typing ${J(t)}: suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    }
    await inp.fill("flash"); await tick(page, 900);
    await page.locator("[role=option]:has-text('flashback')").first().click(); await tick(page, 600);
    await saveAs("Tag flashback");
    say(`Q-24 "Tags includes flashback" (data: A and B tagged): result=${J(await run("Tag flashback"))}; definition=${J(def("Tag flashback"))}`);
    await newQuery(); await setField(page, 0, "Tags"); await setOp(page, 0, "includes any of");
    say(`D-19 note: Tags "includes any of" value control: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value input, .filter-chip__slot--value select").evaluateAll((e) => e.map((x) => [x.tagName, x.getAttribute("aria-label"), x.getAttribute("placeholder")])))}`);
  });
});

await withWeb("f86-lead-d", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, "Blank Check", "Doc 1");
  say(`D-20 project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
  await step("D-20 Organizer filter", async () => {
    const tab = page.locator("[aria-label='Work area views'] button:has-text('Organizer')").first();
    say(`D-20 Organizer tab: count=${await tab.count()}; disabled=${J(await tab.isDisabled().catch(() => null))}`);
    await tab.click(); await tick(page, 1500);
    say(`D-20 Organizer "Filter by status" options: ${J(await page.locator("[aria-label='Filter by status']").locator("option").allTextContents())}`);
  });
  say(`after: project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
});
