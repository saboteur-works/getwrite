// Task 5, web build: story/metadata-queries.md rows (built-in fields, links, smart-folder behaviour, advanced mode), part 2. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, chips, setField, setOp, matchInfo, tick, setupData, queryHelpers, projectDir, sidecarByName, projectJson, treeClick, sidebarText } from "./task5-qlib.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
await withWeb("t5-q3", {}, async ({ h, page }) => {
  const P = "Q Test";
  await setupData(page, h, P);
  const { newQuery, saveAs, run, addChip, pickRef, pickValue } = queryHelpers(page, h);
  const qdir = () => path.join(projectDir(h), "meta/queries");
  const qfile = (name) => readdirSync(qdir()).map((f) => ({ f, j: JSON.parse(readFileSync(path.join(qdir(), f), "utf8")) })).find((x) => x.j.name === name);

  await step("Q-04 Q-05 vs search", async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+k"); await tick(page, 800);
    say(`Q-04 Cmd+K: focused element=${J(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.placeholder))}`);
    await page.keyboard.type("Scene", { delay: 50 }); await tick(page, 1500);
    say(`Q-04 typing "Scene" in search: ${J((await bodyText(page)).split("\n").filter((l) => /^Scene [A-D]$/.test(l)).slice(0, 8))}`);
    await page.keyboard.press("Escape");
  });

  await step("Q-23/Q-24 statuses and tags chips", async () => {
    await newQuery();
    await setField(page, 0, "Statuses"); await setOp(page, 0, "includes");
    say(`Q-23 Statuses value control: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value").evaluate((e) => e.innerHTML.replace(/<svg.*?<\/svg>/g, "").replace(/class="[^"]*"/g, "").slice(0, 300)))}`);
    await newQuery();
    await setField(page, 0, "Tags"); await setOp(page, 0, "includes");
    const inp = chips(page).nth(0).locator("input[aria-label='Search resource']");
    await inp.fill("flashback"); await tick(page, 900);
    say(`Q-24 Tags chip: typing "flashback": suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    await inp.fill("Scene"); await tick(page, 900);
    say(`Q-24 Tags chip: typing "Scene": suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
  });

  await step("Q-45 as far as the chip builder allows", async () => {
    await newQuery();
    await setField(page, 0, "Point of View"); await setOp(page, 0, "is"); await pickRef(0, "Mar", "Mara");
    await addChip(); await setField(page, 1, "Word Count"); await setOp(page, 1, "is less than"); await chips(page).nth(1).locator("input[aria-label='Value']").fill("500"); await tick(page, 500);
    await saveAs("Mara short");
    say(`Q-45 "POV is Mara AND Word Count is less than 500": result=${J(await run("Mara short"))} (data: A=50 words, B=600 words, both POV Mara)`);
    say(`Q-45 saved file: ${J(qfile("Mara short")?.j.definition)}`);
  });

  await step("Q-17..Q-22 built-ins", async () => {
    const rows = [
      ["Type is text", async () => { await setField(page, 0, "Type"); await setOp(page, 0, "is"); await pickValue(0, "text"); }],
      ["Folder is Workspace", async () => { await setField(page, 0, "Folder"); await setOp(page, 0, "is"); await chips(page).nth(0).locator("input[aria-label='Search resource']").fill("Work"); await tick(page, 800); say(`Q-18 Folder suggestions for "Work": ${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`); await page.locator("[role=option]").first().click(); await tick(page, 600); }],
      ["Character Count above 1000", async () => { await setField(page, 0, "Character Count"); await setOp(page, 0, "is greater than"); await chips(page).nth(0).locator("input[aria-label='Value']").fill("1000"); }],
      ["Created in last 1 day", async () => { await setField(page, 0, "Created At"); await setOp(page, 0, "in the last"); await chips(page).nth(0).locator("input[aria-label='Amount']").fill("1"); say(`Q-21 in-the-last unit options: ${J(await chips(page).nth(0).locator("select[aria-label='Unit']").locator("option").allTextContents())}`); await chips(page).nth(0).locator("select[aria-label='Unit']").selectOption({ index: 0 }); }],
      ["Updated before 2020", async () => { await setField(page, 0, "Updated At"); await setOp(page, 0, "is before"); await chips(page).nth(0).locator("input[aria-label='Date']").fill("2020-01-01"); }],
      ["Updated before 2099", async () => { await setField(page, 0, "Updated At"); await setOp(page, 0, "is before"); await chips(page).nth(0).locator("input[aria-label='Date']").fill("2099-01-01"); }],
    ];
    for (const [name, build] of rows) {
      try { await newQuery(); await build(); await tick(page, 500); await saveAs(name); say(`BUILTIN "${name}": result=${J(await run(name))}; saved definition=${J(qfile(name)?.j.definition)}`); }
      catch (e) { say(`BUILTIN "${name}" ERROR ${String(e.message).split("\n")[0]}`); await page.keyboard.press("Escape"); }
    }
  });

  await step("Q-25/Q-26 links", async () => {
    await newQuery();
    await setField(page, 0, "Linked From"); await setOp(page, 0, "includes"); await pickRef(0, "Scene D", "Scene D");
    await saveAs("Linked from D");
    say(`Q-25 "Linked From includes Scene D" (D's text holds [[Scene A]]): result=${J(await run("Linked from D"))}; saved definition=${J(qfile("Linked from D")?.j.definition)}`);
    await newQuery();
    await setField(page, 0, "Links To"); await setOp(page, 0, "includes"); await pickRef(0, "Scene A", "Scene A");
    await saveAs("Links to A");
    say(`Q-26 "Links To includes Scene A": result=${J(await run("Links to A"))}; saved definition=${J(qfile("Links to A")?.j.definition)}`);
  });

  await step("Q-50 multi includes all", async () => {
    await newQuery();
    await setField(page, 0, "F Multi"); await setOp(page, 0, "includes all of");
    say(`Q-50 value control: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value").evaluate((e) => e.innerHTML.replace(/<svg.*?<\/svg>/g, "").replace(/class="[^"]*"/g, "").slice(0, 300)))}`);
    await chips(page).nth(0).locator("select[aria-label=Values]").selectOption([{ label: "Alpha" }, { label: "Beta" }]); await tick(page, 500);
    await saveAs("Alpha and Beta");
    say(`Q-50 "F Multi includes all of Alpha, Beta": result=${J(await run("Alpha and Beta"))} (data: A=[Alpha,Beta], B=[Alpha], C=[Beta])`);
    say(`Q-50 saved definition=${J(qfile("Alpha and Beta")?.j.definition)}`);
  });

  await step("Q-23 statuses chip, includes variants, in-the-last variants", async () => {
    await newQuery(); await setField(page, 0, "Statuses"); await setOp(page, 0, "includes"); await pickValue(0, "Draft"); await saveAs("Statuses includes Draft");
    say(`Q-23 "Statuses includes Draft" (Scenes A and C have the sidebar Status Draft): result=${J(await run("Statuses includes Draft"))}; definition=${J(qfile("Statuses includes Draft")?.j.definition)}`);
    await newQuery(); await setField(page, 0, "Status"); await setOp(page, 0, "is"); await pickValue(0, "Draft"); await saveAs("Status is Draft");
    say(`Q-23 "Status is Draft" for comparison: result=${J(await run("Status is Draft"))}`);
    for (const [op, vals, name] of [["includes", ["Alpha"], "multi includes Alpha"], ["includes any of", ["Alpha", "Beta"], "multi includes any of"], ["includes none of", ["Alpha"], "multi includes none of Alpha"], ["does not include", ["Alpha"], "multi does not include Alpha"], ["includes all of", ["Alpha", "Beta"], "multi includes all of 2"]]) {
      await newQuery(); await setField(page, 0, "F Multi"); await setOp(page, 0, op);
      const ctl = chips(page).nth(0).locator("select[aria-label=Values], select[aria-label=Value]").first();
      await ctl.selectOption(vals.map((label) => ({ label }))); await tick(page, 400);
      await saveAs(name);
      say(`Q-35/Q-50 F Multi ${op} ${J(vals)}: result=${J(await run(name))}; definition=${J(qfile(name)?.j.definition)} (data: A=[Alpha,Beta], B=[Alpha], C=[Beta], D none)`);
    }
    for (const [amount, unit] of [[1, "days"], [7, "days"], [1, "weeks"], [1, "months"]]) {
      await newQuery(); await setField(page, 0, "Created At"); await setOp(page, 0, "in the last");
      await chips(page).nth(0).locator("input[aria-label='Amount']").fill(String(amount)); await chips(page).nth(0).locator("select[aria-label='Unit']").selectOption({ label: unit }); await tick(page, 400);
      const nm = `created last ${amount} ${unit}`; await saveAs(nm);
      say(`Q-21/Q-32 Created At in the last ${amount} ${unit} (all resources were created in this run, minutes ago): result=${J(await run(nm))}; definition=${J(qfile(nm)?.j.definition)}`);
    }
  });

  await step("Q-36 icon, Q-38 live, Q-39/Q-40 edit and delete", async () => {
    say(`Q-36 smart folder row icon classes: ${J(await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.innerText.trim() === "Alpha and Beta").map((b) => [...b.querySelectorAll("svg")].map((s) => s.getAttribute("class")))))}`);
    await newQuery();
    await setField(page, 0, "Point of View"); await setOp(page, 0, "is empty"); await tick(page, 400);
    await saveAs("Needs a POV 2");
    say(`Q-38 "Needs a POV 2" first run: ${J(await run("Needs a POV 2"))}`);
    // pick Scene D from the Data view list and give it a POV
    await page.locator("[role=treeitem][aria-label='Scene D']").first().click(); await tick(page, 2500);
    say(`Q-38 after selecting Scene D in the tree: heading/work area lines=${J((await bodyText(page)).split("\n").filter((l) => /Needs a POV|Scene D/.test(l)).slice(0, 6))}`);
    await page.fill("input[aria-label=pov-input]", "Mar"); await tick(page, 900); await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 2500);
    say(`Q-38 Scene D POV now: ${J(sidecarByName(h, "Scene D").json.userMetadata.pov?.name)}; work area still on the smart folder? ${J((await bodyText(page)).includes("Needs a POV 2"))}; list shown right now (before clicking the folder again)=${J((await matchInfo(page)).listed)}`);
    await tick(page, 5000);
    say(`Q-38 list shown 5 s later, still without clicking the folder again: ${J((await matchInfo(page)).listed)}`);
    await page.locator("text=Needs a POV 2").first().click(); await tick(page, 2500);
    say(`Q-38 "Needs a POV 2" after clicking it again: ${J((await matchInfo(page)).listed)}`);
    // edit
    await page.locator("text=Needs a POV 2").first().hover(); await tick(page, 400);
    say(`Q-39 buttons on hover: ${J(await page.$$eval("button[aria-label^='Edit Needs'], button[aria-label^='Delete Needs']", (b) => b.map((x) => x.getAttribute("aria-label"))))}`);
    await page.click("button[aria-label='Edit Needs a POV 2']"); await tick(page, 1200);
    say(`Q-40 builder after Edit: chips=${await chips(page).count()}; field trigger=${J(await chips(page).nth(0).locator("button.field-picker__trigger").getAttribute("aria-label"))}; operator=${J(await chips(page).nth(0).locator("select[aria-label=Operator]").inputValue())}; save button text=${J(await page.locator("button:has-text('SAVE QUERY'), button:has-text('Save query'), button:has-text('Update')").allTextContents())}`);
    // delete
    await page.locator("text=Needs a POV 2").first().hover(); await tick(page, 300);
    await page.click("button[aria-label='Delete Needs a POV 2']"); await tick(page, 1000);
    say(`Q-39 after Delete: dialogs=${J(await page.$$eval("[role=alertdialog], [role=dialog]", (d) => d.map((x) => x.innerText.slice(0, 150))))}`);
    const conf = page.locator("[role=alertdialog] button, [role=dialog] button").filter({ hasText: /^(Delete|Confirm|Remove|Yes)/ });
    if (await conf.count()) { await conf.last().click(); await tick(page, 1500); }
    say(`Q-39 after delete: smart folder still listed=${J((await bodyText(page)).includes("Needs a POV 2"))}; files=${J(readdirSync(qdir()).length)}`);
  });

});
