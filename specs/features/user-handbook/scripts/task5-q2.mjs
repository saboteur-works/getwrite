// Task 5, web build: story/metadata-queries.md rows (builder, combinators, examples, smart folders), part 1. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, chips, setField, setOp, matchInfo, tick, setupData, queryHelpers, projectDir, sidecarByName, projectJson } from "./task5-qlib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
await withWeb("t5-q2", {}, async ({ h, page }) => {
  const P = "Q Test";
  await setupData(page, h, P);
  const { newQuery, saveAs, run, addChip, pickRef, pickValue } = queryHelpers(page, h);
  await step("X1 groups AND", async () => {
    await newQuery();
    await setField(page, 0, "Point of View"); await setOp(page, 0, "is"); await pickRef(0, "Mar", "Mara");
    await page.locator("button:has-text('ADD GROUP')").first().click(); await tick(page, 700);
    await setField(page, 1, "Status"); await setOp(page, 1, "is"); await pickValue(1, "Draft"); await tick(page, 500);
    await page.locator("button:has-text('ADD CONDITION')").nth(1).click(); await tick(page, 500);
    say(`Q-13 chips now: ${await chips(page).count()}; groups: ${await page.locator("select[aria-label='Group combinator']").count()}`);
    await setField(page, 2, "Status"); await setOp(page, 2, "is"); await pickValue(2, "In review"); await tick(page, 500);
    await page.locator("select[aria-label='Group combinator']").nth(1).selectOption({ label: "Any of" }); await tick(page, 500);
    say(`Q-14 builder: group combinators=${J(await page.$$eval("select[aria-label='Group combinator']", (o) => o.map((x) => x.options[x.selectedIndex].textContent)))}; pill=${J(await page.$$eval(".query-builder__pill", (o) => o.map((x) => x.textContent.trim())))}`);
    await saveAs("Mara and (Draft or In review)");
    say(`Q-14 "POV is Mara AND (Status is Draft OR Status is In review)": result=${J(await run("Mara and (Draft or In review)"))} (data: A=Mara/Draft, B=Mara/In review, C=Elena/Draft)`);
    say(`Q-14 saved file: ${J(readFileSync(path.join(projectDir(h), "meta/queries", readdirSync(path.join(projectDir(h), "meta/queries")).find((f) => JSON.parse(readFileSync(path.join(projectDir(h), "meta/queries", f), "utf8")).name.startsWith("Mara and"))), "utf8").replace(/\s+/g, ""))}`);
    // third level attempt
    say(`Q-13 add-group buttons inside the builder: ${await page.locator("button:has-text('ADD GROUP')").count()}; any control for nesting a group inside a group: ${J(await page.$$eval("button", (b) => b.map((x) => x.innerText.trim()).filter((t) => /nest|sub-?group|add group/i.test(t))))}`);
  });
  await step("X1b pill OR", async () => {
    await newQuery();
    await setField(page, 0, "Point of View"); await setOp(page, 0, "is"); await pickRef(0, "Ele", "Elena");
    await page.locator("button:has-text('ADD GROUP')").first().click(); await tick(page, 700);
    await setField(page, 1, "Status"); await setOp(page, 1, "is"); await pickValue(1, "In review"); await tick(page, 500);
    await page.locator(".query-builder__pill").first().click(); await tick(page, 500);
    say(`Q-12 pill after click: ${J(await page.$$eval(".query-builder__pill", (o) => o.map((x) => x.textContent.trim())))}`);
    await saveAs("Elena or In review");
    say(`Q-12 "POV is Elena OR (Status is In review)": result=${J(await run("Elena or In review"))} (data: B=In review, C=Elena)`);
  });
  await step("X2 Q-45", async () => {
    await newQuery();
    await setField(page, 0, "Tags"); await setOp(page, 0, "includes");
    const tagInp = chips(page).nth(0).locator("input[aria-label='Search resource'], input[aria-label='Value'], input[aria-label='Values']").first();
    say(`Q-24 Tags value control: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value").evaluate((e) => e.innerHTML.replace(/<svg.*?<\/svg>/g, "").slice(0, 400)))}`);
    await tagInp.fill("flashback"); await tick(page, 800);
    say(`Q-24 options offered when typing "flash": ${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    say(`Q-24 after typing "flashback" in the Tags value box: suggestions=${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    await page.keyboard.press("Enter"); await tick(page, 600);
    say(`Q-24 Tags chip after Enter: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value").innerText())}`);
    await addChip(); await setField(page, 1, "Point of View"); await setOp(page, 1, "is"); await pickRef(1, "Mar", "Mara");
    await addChip(); await setField(page, 2, "Word Count"); await setOp(page, 2, "is less than"); await chips(page).nth(2).locator("input[aria-label='Value']").fill("500"); await tick(page, 500);
    say(`Q-45 chips: ${J(await chips(page).allInnerTexts().then((a) => a.map((t) => t.replace(/\n/g, " ").replace(/is not.*has any value/, "[ops]"))))}`);
    await saveAs("Flashback Mara short");
    say(`Q-45 "Tags includes flashback AND POV is Mara AND Word Count is less than 500": result=${J(await run("Flashback Mara short"))} (data: A=50 words,Mara,flashback; B=600 words)`);
  });
  await step("X3 Q-46", async () => {
    await newQuery();
    await setField(page, 0, "Story Date"); await setOp(page, 0, "is between");
    say(`Q-46 is-between value controls: ${J(await chips(page).nth(0).locator(".filter-chip__slot--value input").evaluateAll((o) => o.map((x) => x.getAttribute("aria-label") + ":" + x.type)))}`);
    await chips(page).nth(0).locator("input[aria-label='From date']").fill("2026-01-01"); await chips(page).nth(0).locator("input[aria-label='To date']").fill("2026-02-15"); await tick(page, 500);
    await saveAs("Story slice");
    say(`Q-46 "Story Date is between 2026-01-01 and 2026-02-15": result=${J(await run("Story slice"))} (data: A=01-05, C=02-01, B=03-01)`);
  });
  await step("X4 Q-48", async () => {
    await newQuery();
    await setField(page, 0, "Status"); await setOp(page, 0, "is empty"); await tick(page, 400);
    await saveAs("No status");
    say(`Q-48 "Status is empty": result=${J(await run("No status"))} (data: A,B,C have a status)`);
    await newQuery();
    await setField(page, 0, "Point of View"); await setOp(page, 0, "is empty"); await tick(page, 400);
    await saveAs("Needs a POV");
    say(`Q-48/Q-38 "Point of View is empty": result=${J(await run("Needs a POV"))} (data: A,B=Mara, C=Elena)`);
  });
});
