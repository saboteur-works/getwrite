// Feature 86 Stage 6.5 (pipeline lead): re-checks the handbook query observations (Q-50, Q-21, Q-22, Q-24, Q-08)
// and the stop findings (F-1, F-4, F-5) against a fresh standalone web build. Run OUTSIDE the sandbox.
// Uses the Feature 81 handbook harness: throwaway projects folder, own server pid only.
import { withWeb, say, J, step, chips, setField, setOp, tick, setupData, queryHelpers, projectDir, projectJson, newProjectWithDoc, addSidebarField, treeClick } from "../../user-handbook/scripts/task5-qlib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const localDay = (d) => d.toLocaleDateString("en-CA");
const today = localDay(new Date());
const tomorrow = localDay(new Date(Date.now() + 86400000));
say(`process zone=${Intl.DateTimeFormat().resolvedOptions().timeZone}; local today=${today}`);

await withWeb("f86-lead-a", {}, async ({ h, page }) => {
  const P = "Q Test";
  await setupData(page, h, P);
  const { newQuery, saveAs, run } = queryHelpers(page, h);
  const qdir = () => path.join(projectDir(h), "meta/queries");
  const def = (name) => readdirSync(qdir()).map((f) => JSON.parse(readFileSync(path.join(qdir(), f), "utf8"))).find((j) => j.name === name)?.definition;
  const reopen = async (name) => {
    await page.locator(`text=${name}`).first().hover(); await tick(page, 400);
    await page.click(`button[aria-label='Edit ${name}']`); await tick(page, 1200);
    const c = chips(page).nth(0);
    const out = { operator: await c.locator("select[aria-label=Operator]").evaluate((s) => s.options[s.selectedIndex]?.text) };
    for (const [k, sel] of [["amount", "input[aria-label='Amount']"], ["unit", "select[aria-label='Unit']"]]) if (await c.locator(sel).count()) out[k] = await c.locator(sel).inputValue();
    await page.keyboard.press("Escape"); await tick(page, 600);
    return out;
  };

  await step("Q-50 includes all of", async () => {
    await newQuery(); await setField(page, 0, "F Multi"); await setOp(page, 0, "includes all of");
    await chips(page).nth(0).locator("select[aria-label=Values]").selectOption([{ label: "Alpha" }, { label: "Beta" }]); await tick(page, 500);
    await saveAs("Alpha and Beta");
    say(`Q-50 "F Multi includes all of Alpha, Beta": result=${J(await run("Alpha and Beta"))} (data: A=[Alpha,Beta], B=[Alpha], C=[Beta]); definition=${J(def("Alpha and Beta"))}`);
    say(`Q-50 reopened: ${J(await reopen("Alpha and Beta"))}`);
    await newQuery(); await setField(page, 0, "F Multi"); await setOp(page, 0, "includes any of");
    await chips(page).nth(0).locator("select[aria-label=Values]").selectOption([{ label: "Alpha" }, { label: "Beta" }]); await tick(page, 500);
    await saveAs("Alpha or Beta");
    say(`Q-50 comparison "includes any of Alpha, Beta": result=${J(await run("Alpha or Beta"))}`);
  });

  await step("Q-21/Q-22 in the last and is on", async () => {
    for (const [field, amount, unit] of [["Created At", 1, "days"], ["Created At", 7, "days"], ["Created At", 1, "weeks"], ["Created At", 1, "months"], ["Updated At", 1, "days"]]) {
      await newQuery(); await setField(page, 0, field); await setOp(page, 0, "in the last");
      await chips(page).nth(0).locator("input[aria-label='Amount']").fill(String(amount)); await chips(page).nth(0).locator("select[aria-label='Unit']").selectOption({ label: unit }); await tick(page, 400);
      const nm = `${field} last ${amount} ${unit}`; await saveAs(nm);
      say(`Q-21/Q-22 ${nm} (all resources created minutes ago): result=${J(await run(nm))}; definition=${J(def(nm))}`);
    }
    say(`Q-21 reopened "Created At last 7 days": ${J(await reopen("Created At last 7 days"))}`);
    for (const [op, val] of [["is on", today], ["is after", today], ["is before", today], ["is before", tomorrow]]) {
      await newQuery(); await setField(page, 0, "Created At"); await setOp(page, 0, op);
      await chips(page).nth(0).locator("input[aria-label='Date']").fill(val); await tick(page, 400);
      const nm = `Created ${op} ${val}`; await saveAs(nm);
      say(`Q-21/F-5 Created At ${op} ${val} (today=${today}): result=${J(await run(nm))}; definition=${J(def(nm))}`);
    }
  });

  await step("F-4 untouched in the last", async () => {
    await newQuery(); await setField(page, 0, "Created At"); await setOp(page, 0, "in the last");
    const shown = { amount: await chips(page).nth(0).locator("input[aria-label='Amount']").inputValue(), unit: await chips(page).nth(0).locator("select[aria-label='Unit']").inputValue() };
    await saveAs("untouched last");
    say(`F-4 untouched "in the last": shown=${J(shown)}; result=${J(await run("untouched last"))}; definition=${J(def("untouched last"))}`);
  });

  await step("Q-24 Tags value box", async () => {
    await newQuery(); await setField(page, 0, "Tags"); await setOp(page, 0, "includes");
    const slot = chips(page).nth(0).locator(".filter-chip__slot--value");
    say(`Q-24 Tags value inputs: ${J(await slot.locator("input,select").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))))}`);
    const inp = slot.locator("input[aria-label='Tag']").first();
    await inp.fill("flash"); await tick(page, 900);
    say(`Q-24 typing "flash": suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    await inp.fill("Scene"); await tick(page, 900);
    say(`Q-24 typing "Scene": suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    await inp.fill("flash"); await tick(page, 900);
    await page.locator("[role=option]:has-text('flashback')").first().click(); await tick(page, 600);
    await saveAs("Tag flashback");
    say(`Q-24 "Tags includes flashback" (data: A and B tagged): result=${J(await run("Tag flashback"))}; definition=${J(def("Tag flashback"))}`);
  });

  await step("F-1 starts with", async () => {
    await treeClick(page, "Scene A");
    await addSidebarField(page, "ftext", "F Text", "Text", "Document");
    for (const [n, v] of [["Scene A", "Alpha one"], ["Scene B", "the alpha"], ["Scene C", "ALPHA.x"]]) {
      await treeClick(page, n); await page.fill("input[aria-label=ftext]", v); await page.locator("input[aria-label=ftext]").blur(); await tick(page, 1500);
    }
    for (const t of ["alpha", "alpha."]) {
      await newQuery(); await setField(page, 0, "F Text"); await setOp(page, 0, "starts with");
      await chips(page).nth(0).locator("input[aria-label='Value']").fill(t); await tick(page, 400);
      const nm = `starts ${t}`; await saveAs(nm);
      say(`F-1 "F Text starts with ${t}" (data: A="Alpha one", B="the alpha", C="ALPHA.x"): result=${J(await run(nm))}; definition=${J(def(nm))}`);
    }
    say(`F-1 reopened "starts alpha": ${J(await reopen("starts alpha"))}`);
  });
});

await withWeb("f86-lead-b", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, "Blank Check", "Doc 1");
  say(`Q-08 project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
  const { newQuery } = queryHelpers(page, h);
  await step("Q-08 Status chip", async () => {
    await newQuery(); await setField(page, 0, "Status"); await setOp(page, 0, "is");
    say(`Q-08 Status chip value options: ${J(await chips(page).nth(0).locator("select[aria-label=Value]").locator("option").allTextContents())}`);
    await setField(page, 0, "Statuses"); await setOp(page, 0, "includes");
    say(`OQ-7 Statuses chip value control: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value").innerText())}; options=${J(await chips(page).nth(0).locator(".filter-chip__slot--value option").allTextContents())}`);
    await page.keyboard.press("Escape"); await tick(page, 600);
  });
  await step("Q-08 sidebar Status", async () => {
    await treeClick(page, "Doc 1");
    say(`Q-08 sidebar status options: ${J(await page.locator("select[aria-label=status]").locator("option").allTextContents())}`);
  });
  await step("D-20 Organizer filter", async () => {
    await page.locator("button:has-text('Organizer'), [role=tab]:has-text('Organizer')").first().click(); await tick(page, 1500);
    say(`D-20 Organizer "Filter by status" options: ${J(await page.locator("[aria-label='Filter by status']").locator("option").allTextContents())}`);
  });
  say(`after: project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
});
