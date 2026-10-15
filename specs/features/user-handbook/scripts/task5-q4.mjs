// Task 5, web build: story/metadata-queries.md rows Q-41..Q-44 (advanced mode). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, chips, tick, newProjectWithDoc, projectDir } from "./task5-qlib.mjs";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
await withWeb("t5-q4", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  const P = "Adv Test";
  await newProjectWithDoc(page, h, P, "Scene A");
  await page.click("button[aria-label='New smart folder']"); await tick(page, 1000);
  await page.click("button.field-picker__trigger"); await tick(page, 400);
  say(`Q-16 field list of a new Blank project (no optional fields switched on): ${J(await page.$$eval("[role=listbox][aria-label='Select a field'] [role=option]", (o) => o.map((x) => x.innerText.split("\n")[0].trim())))}`);
  say(`Q-09 field picker search box: ${J(await page.$$eval("input[aria-label='Search fields']", (o) => o.map((x) => x.placeholder)))}`);
  await page.keyboard.press("Escape"); await tick(page, 400);
  const qdir = path.join(projectDir(h), "meta/queries");
  mkdirSync(qdir, { recursive: true });
  const id = "11111111-1111-4111-8111-111111111111";
  const st = (v) => ({ op: "eq", field: "status", value: v });
  const deep = { op: "and", children: [st("Draft"), { op: "or", children: [st("Draft"), { op: "and", children: [st("Draft"), { op: "exists", field: "pov" }] }] }] };
  writeFileSync(path.join(qdir, `${id}.query.json`), JSON.stringify({ id, name: "Deep nesting", definition: deep }, null, 2));
  say(`Q-41 method: a saved-query file with three levels (and > or > and) was written by hand into the throwaway project's meta/queries; the page was then reloaded`);
  await page.reload(); await tick(page, 2500); await page.click(`button[aria-label="Open ${P}"]`); await tick(page, 2500);
  say(`smart folders listed: ${J((await bodyText(page)).split("\n").filter((l) => /Deep nesting/.test(l)))}`);
  await page.locator("text=Deep nesting").first().click(); await tick(page, 2500);
  await page.locator("text=Deep nesting").first().hover();
  await page.click("button[aria-label='Edit Deep nesting']"); await tick(page, 1500);
  say(`Q-41 builder for the 3-level query: banner=${J(await page.$$eval(".query-builder__advanced", (o) => o.map((x) => x.innerText)))}; chips=${await chips(page).count()}; Add-group disabled=${J(await page.locator("button:has-text('ADD GROUP')").first().isDisabled())}`);
  await page.click("button:has-text('Edit in advanced mode')"); await tick(page, 800);
  const ta = page.locator("textarea[aria-label='Query AST JSON editor']");
  say(`Q-42 JSON editor: textarea present=${await ta.count()}; first chars=${J((await ta.inputValue()).slice(0, 90).replace(/\s+/g, " "))}; buttons=${J(await page.$$eval(".advanced-mode-toggle button", (b) => b.map((x) => x.innerText.trim() + (x.disabled ? " [disabled]" : ""))))}`);
  await page.click("button:has-text('Back to chip view')"); await tick(page, 1000);
  say(`Q-43 Back to chip view with the 3-level JSON: alert=${J(await page.$$eval("[role=alert]", (o) => o.map((x) => x.innerText)))}; chips shown=${await chips(page).count()}; banner=${J(await page.$$eval(".query-builder__advanced", (o) => o.map((x) => x.innerText)))}; editor open=${await ta.count()}`);
  if (!(await ta.count())) { await page.click("button:has-text('Edit in advanced mode')"); await tick(page, 600); }
  const simple = { op: "and", children: [st("Draft"), { op: "or", children: [st("Draft"), { op: "exists", field: "pov" }] }] };
  await ta.fill(JSON.stringify(simple)); await tick(page, 500);
  await page.click("button:has-text('Back to chip view')"); await tick(page, 1200);
  say(`Q-43 after replacing the JSON with a 2-level query and choosing Back to chip view: chips=${await chips(page).count()}; groups=${await page.locator("select[aria-label='Group combinator']").count()}; advanced banner present=${await page.locator(".query-builder__advanced").count()}; editor open=${await ta.count()}`);
});
