// Feature 86 pre-PR checks (pipeline lead), on a standalone web build of the branch. Run OUTSIDE the sandbox.
// 1. D-20: the Organizer "Filter by status" options in a Blank project (config.statuses empty), with a folder selected.
// 2. F-2/F-3 reachability: can the app save a typed name (plain string) as a reference chip's value?
//    The code shows the plain "Resource" text box only when the field's candidate list is empty; the one UI route
//    found is a Multi Ref field whose folder scope (Project Settings > Metadata) is an empty folder.
import { withWeb, say, J, step, chips, setField, setOp, tick, queryHelpers, projectDir, projectJson, newProjectWithDoc, createNode, treeClick, addSidebarField, openSettings, closeSettings, sidebarText, sidecarByName } from "../../user-handbook/scripts/task5-qlib.mjs";
import { reloadProject, expandAll } from "../../user-handbook/scripts/task6-lib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const valueSlot = async (page) => chips(page).nth(0).locator(".filter-chip__slot--value input, .filter-chip__slot--value select")
  .evaluateAll((els) => els.map((e) => ({ tag: e.tagName, label: e.getAttribute("aria-label"), placeholder: e.getAttribute("placeholder") })));

await withWeb("f86-lead-organizer", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, "Blank Check", "Doc 1");
  await createNode(page, "Chapter 1", "folder", "Workspace");
  await reloadProject(page, "Blank Check");
  say(`D-20 before: project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
  await step("D-20 Organizer filter with a folder selected", async () => {
    await expandAll(page); await page.locator(`[role=treeitem][aria-label="Workspace"]`).first().click(); await tick(page, 1500);
    const tab = page.locator("[aria-label='Work area views'] button:has-text('Organizer')").first();
    say(`D-20 Organizer tab with the Workspace folder selected (Chapter 1 inside it): count=${await tab.count()}; disabled=${J(await tab.isDisabled().catch(() => null))}`);
    await tab.click(); await tick(page, 1500);
    if (!(await page.locator("[aria-label='Filter by status']").count())) { await page.click("button:has-text('Filters')"); await tick(page, 800); }
    say(`D-20 Organizer "Filter by status" options: ${J(await page.locator("[aria-label='Filter by status']").locator("option").allTextContents())}`);
  });
  say(`D-20 after: project.json config.statuses=${J(projectJson(h)?.config?.statuses)}`);
});

await withWeb("f86-lead-typed-ref", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, "Ref Check", "Scene A");
  for (const n of ["Mara", "Elena"]) await createNode(page, n, "text");
  await createNode(page, "Cast", "folder", "Workspace");
  await reloadProject(page, "Ref Check");
  const def = (name) => readdirSync(path.join(projectDir(h), "meta/queries")).map((f) => JSON.parse(readFileSync(path.join(projectDir(h), "meta/queries", f), "utf8"))).find((j) => j.name === name)?.definition;
  const findKey = (o) => { if (!o || typeof o !== "object") return null; if (o.key === "fcast") return o; for (const v of Object.values(o)) { const r = findKey(v); if (r) return r; } return null; };
  const fieldDef = () => findKey(projectJson(h));
  await step("Multi Ref field, Scene A -> Mara (scope: any folder)", async () => {
    await treeClick(page, "Scene A");
    await addSidebarField(page, "fcast", "F Cast", "Multi Ref", "Document");
    await page.fill("input[aria-label=multi-resource-ref-input]", "Mar"); await tick(page, 800);
    await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 1500);
    say(`Scene A sidecar userMetadata.fcast=${J(sidecarByName(h, "Scene A")?.json?.userMetadata?.fcast)}`);
  });
  const chipCheck = async (tag) => {
    const { newQuery, saveAs, run } = queryHelpers(page, h);
    await newQuery(); await setField(page, 0, "F Cast"); await setOp(page, 0, "includes");
    const slot = await valueSlot(page);
    say(`${tag}: F Cast "includes" value controls=${J(slot)}`);
    return { slot, newQuery, saveAs, run };
  };
  await step("query chip before scoping", async () => { await chipCheck("before scoping"); await page.keyboard.press("Escape"); await tick(page, 600); });
  await step("scope F Cast to the empty folder Cast", async () => {
    await openSettings(page, "Metadata");
    await page.click("button[aria-label='Ref folder for F Cast']"); await tick(page, 500);
    for (let i = 0; i < 10; i++) { const ex = page.locator("[data-testid=folder-tree-list] button[aria-label^='Expand ']"); if (!(await ex.count())) break; await ex.first().click(); await tick(page, 200); }
    say(`folder picker entries: ${J(await page.locator("[data-testid=folder-tree-list] button").allInnerTexts())}`);
    await page.locator("[data-testid=folder-tree-list] button[aria-pressed]", { hasText: /^Cast$/ }).first().click(); await tick(page, 1500);
    await closeSettings(page);
    say(`F Cast field definition after scoping: ${J(fieldDef())}`);
    await reloadProject(page, "Ref Check"); await treeClick(page, "Scene A");
    say(`Scene A sidebar after scoping (F Cast lines): ${J((await sidebarText(page)).split("\n").filter((l, i, a) => /F CAST|MARA/i.test(l) || /F CAST/i.test(a[i - 1] ?? "")))}`);
  });
  await step("query chip after scoping: type a name", async () => {
    for (const [op, nm] of [["includes", "Cast has Mara"], ["does not include", "Cast lacks Mara"]]) {
      const { slot, saveAs, run } = await chipCheck(`after scoping (${op})`);
      await setOp(page, 0, op);
      const resourceBox = chips(page).nth(0).locator(".filter-chip__slot--value input[aria-label='Resource']");
      if (!(await resourceBox.count())) { say(`after scoping (${op}): no plain "Resource" box; controls=${J(slot)}`); continue; }
      await resourceBox.fill("Mara"); await tick(page, 600);
      await saveAs(nm);
      say(`typed name "${op} Mara" (data: Scene A has F Cast = [Mara]): result=${J(await run(nm))}; definition=${J(def(nm))}`);
    }
  });
});
