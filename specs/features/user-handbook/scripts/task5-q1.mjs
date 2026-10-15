// Task 5, web build: story/metadata-queries.md rows Q-06..Q-35 (query builder, fields, operators). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, createNode, treeClick, sidecarByName, projectJson, projectDir } from "./task5-lib.mjs";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
const FIELD_TYPES = [["ftext", "F Text", "Text"], ["fnum", "F Number", "Number"], ["fdate", "F Date", "Date"], ["fbool", "F Bool", "Boolean"], ["fsel", "F Select", "Select"], ["fmulti", "F Multi", "Multi"], ["fref", "F Ref", "Ref"], ["fmref", "F MultiRef", "Multi Ref"]];
await withWeb("t5-q1", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Q Test", "Scene One");
  await openSettings(page, "Metadata");
  for (const n of [/^Timeline/, /Point of View/, /Synopsis/, /Notes/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
  await closeSettings(page);
  for (const [n, l, t] of FIELD_TYPES) await addSidebarField(page, n, l, t, "Document");
  await openSettings(page, "Manage Tags");
  await page.fill("input[aria-label='New tag name']", "flashback"); await page.keyboard.press("Enter"); await tick(page, 1200);
  await closeSettings(page);
  await page.click("button[aria-label='New smart folder']"); await tick(page, 1200);
  say(`Q-06/Q-07 clicking the + next to Smart folders: builder visible=${J((await bodyText(page)).includes("ADD CONDITION"))}; text=${J((await bodyText(page)).split("\n").filter((l) => /ALL OF|ANY OF|FIELD|ADD CONDITION|ADD GROUP|SAVE QUERY/i.test(l)))}; smart folders section label text=${J((await bodyText(page)).split("\n").filter((l) => /SMART FOLDERS/i.test(l)))}`);
  await page.click("button[aria-label='Select a field']"); await tick(page, 800);
  const labels = await page.$$eval("[role=listbox][aria-label='Select a field'] [role=option]", (o) => o.map((x) => x.innerText.replace(/\n/g, " | ")));
  say(`Q-09/Q-16/Q-17..Q-26 field picker options (in order): ${J(labels)}`);
  say(`Q-09 field picker raw group headings: ${J(await page.$$eval("[role=listbox][aria-label='Select a field'] *", (o) => o.filter((x) => x.children.length === 0).map((x) => x.textContent.trim()).filter((t) => /^(Metadata|Built-in|Document|Attributes|Fields|Properties)/i.test(t))))}`);
  await page.keyboard.press("Escape");
  page.setDefaultTimeout(8000);
  // per-field: operators
  for (let i = 0; i < labels.length; i++) {
    const lab = labels[i];
    const name = lab.split(" | ")[0];
    await step("field " + name, async () => {
      await page.locator("button.field-picker__trigger").first().click(); await tick(page, 400);
      await page.locator("[role=listbox][aria-label='Select a field'] [role=option]").nth(i).click(); await tick(page, 700);
      const ops = await page.$$eval("select[aria-label=Operator] option", (o) => o.map((x) => (x.disabled ? "(separator)" : x.textContent.trim())));
      const valueCtl = await page.evaluate(() => { const g = document.querySelector("[role=group][aria-label='Filter condition']"); const v = g.querySelector(".filter-chip__slot--value"); return v ? [...v.querySelectorAll("input,select,textarea,button")].map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || "") + ":" + (x.type || "") + (x.tagName === "SELECT" ? ":[" + [...x.options].map((o) => o.textContent.trim()).join("|") + "]" : "")) : []; });
      say(`FIELD ${J(name)} (picker row ${J(lab)}): operators=${J(ops)}; value control=${J(valueCtl)}; trigger label=${J(await page.locator("button.field-picker__trigger").first().getAttribute("aria-label"))}`);
    });
  }
});
