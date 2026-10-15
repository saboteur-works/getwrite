// Task 6, web build: views/organizer.md rows O-10..O-17 (Filtering). Run OUTSIDE the sandbox.
import { reloadProject, withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, typeInto, expandAll, cards, sidebarText, addSidebarField, projectDir } from "./task6-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const names = async (page) => (await cards(page)).map((c) => c.title);
const ctrls = (page) => page.evaluate(() => [...document.querySelectorAll("[aria-label^='Filter'],[aria-label^='Minimum'],[aria-label^='Maximum'],[aria-label^='Clear']")].map((e) => `${e.tagName}|${e.getAttribute("aria-label")}|${[...(e.options || [])].map((o) => o.textContent).join("/")}|val=${e.value ?? ""}`));
const openWs = async (page, f = "Workspace") => { await expandAll(page); await page.locator(`[role=treeitem][aria-label="${f}"]`).first().click(); await page.waitForTimeout(1500); };
await withWeb("t6-o2", {}, async ({ h, page }) => {
  await createProject(page, h, "Org", "Blank");
  const png = path.join(h.run.dir, "p.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
  for (const n of ["F1", "F2", "F3"]) await createNode(page, n, "text");
  await createNode(page, "Pic", "image", "Workspace", png);
  await createNode(page, "Other", "folder", "Workspace"); await createNode(page, "Empty", "folder", "Workspace");
  await typeInto(page, "F1", "one two three four five six seven eight nine ten eleven twelve");
  await typeInto(page, "F2", "word ".repeat(60));
  await treeClick(page, "F1"); await addSidebarField(page, "povchar", "Pov Char", "Ref", "Document");
  await reloadProject(page, "Org");
  await createNode(page, "O1", "text", "Other"); await createNode(page, "O2", "text", "Other");
  await typeInto(page, "O1", "other one");
  await step("O-10 before statuses", async () => {
    await openWs(page); await page.click("button:has-text('Filters')"); await page.waitForTimeout(800);
    say("O-10 filter controls in a new Blank project (config.statuses empty): " + J(await ctrls(page)));
    say("filters bar button text: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => /filter/i.test(t)))));
  });
  const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config = { ...(j.config || {}), statuses: ["Draft", "In review", "Published"] }; writeFileSync(pj, JSON.stringify(j, null, 2));
  await reloadProject(page, "Org");
  await treeClick(page, "F1"); await page.selectOption("select[aria-label=status]", { label: "In review" }); await page.waitForTimeout(1500);
  await page.fill("input[aria-label=povchar]", "F2"); await page.waitForTimeout(1000); await page.locator("ul li", { hasText: /^F2$/ }).first().click(); await page.waitForTimeout(1500);
  await treeClick(page, "F2"); await page.selectOption("select[aria-label=status]", { label: "Published" }); await page.waitForTimeout(1500);
  await page.fill("input[aria-label=povchar]", "F3"); await page.waitForTimeout(1000); await page.locator("ul li", { hasText: /^F3$/ }).first().click(); await page.waitForTimeout(1500);
  await treeClick(page, "O1"); await page.selectOption("select[aria-label=status]", { label: "Published" }); await page.waitForTimeout(1500);
  const sc = (await import("./task6-lib.mjs")).sidecars(h).map((s) => `${s.json.name}:${s.json.type}:status=${J(s.json.userMetadata?.status ?? null)}:pov=${J(s.json.userMetadata?.povchar ?? null)}:words=${s.json.wordCount ?? null}`);
  say("stored: " + J(sc));
  await openWs(page);
  const tools = async () => { if (!(await page.locator("[aria-label='Filter by status']").count())) { await page.click("button:has-text('Filters')"); await page.waitForTimeout(600); } };
  await step("O-10 status", async () => {
    await tools();
    say("O-10 status options now: " + J((await ctrls(page)).filter((c) => /status/i.test(c))));
    say("O-10 no filter: " + J(await names(page)));
    for (const v of ["Draft", "In review", "Published", "No status"]) { await page.selectOption("select[aria-label='Filter by status']", { label: v }); await page.waitForTimeout(700); say(`O-10 status=${v}: ${J(await names(page))}`); }
    await page.selectOption("select[aria-label='Filter by status']", { label: "In review" }); await page.waitForTimeout(500);
    say("O-15 controls with status active: " + J(await ctrls(page)));
    await page.click("button[aria-label='Clear status filter']"); await page.waitForTimeout(600);
    say("O-15 after Clear status filter: " + J(await names(page)) + " ; controls: " + J((await ctrls(page)).filter((c) => /Clear/.test(c))));
  });
  await step("O-11/12 words", async () => {
    await page.fill("input[aria-label='Minimum words']", "10"); await page.waitForTimeout(700); say("O-11 min 10: " + J(await names(page)));
    await page.fill("input[aria-label='Maximum words']", "30"); await page.waitForTimeout(700); say("O-11 min 10, max 30: " + J(await names(page)));
    await page.fill("input[aria-label='Minimum words']", ""); await page.waitForTimeout(700); say("O-11 max 30 only: " + J(await names(page)));
    say("O-15 controls: " + J((await ctrls(page)).filter((c) => /Clear/.test(c))));
    await page.click("button[aria-label='Clear word count filter']"); await page.waitForTimeout(600); say("O-15 after clear word count: " + J(await names(page)));
    await page.fill("input[aria-label='Minimum words']", "0"); await page.waitForTimeout(700); say("O-12 min 0 (every document has >= 0): " + J(await names(page)));
    await page.click("button[aria-label='Clear word count filter']"); await page.waitForTimeout(600);
  });
  await step("O-13 ref", async () => {
    await page.click("button:has-text('Advanced filters')"); await page.waitForTimeout(700);
    say("O-13 advanced controls: " + J((await ctrls(page)).filter((c) => /Filter by/.test(c))));
    await page.selectOption("select[aria-label='Filter by Pov Char']", { label: "F2" }); await page.waitForTimeout(700); say("O-13 Pov Char=F2: " + J(await names(page)));
    say("O-15 clear controls: " + J((await ctrls(page)).filter((c) => /Clear/.test(c))));
  });
  await step("O-14/15/16", async () => {
    await page.selectOption("select[aria-label='Filter by status']", { label: "Published" }); await page.waitForTimeout(700);
    say("O-14 Pov Char=F2 + status=Published (F1 is In review, F2 Published): " + J(await names(page)));
    await page.fill("input[aria-label='Minimum words']", "100"); await page.waitForTimeout(700);
    say("O-14/O-16 + min words 100: " + J(await names(page)) + " ; body lines: " + J((await bodyText(page)).split("\n").filter((l) => /No cards|empty|nothing|no resources/i.test(l))));
    say("O-15 Clear all present: " + J(await page.locator("button:has-text('Clear all filters')").count()));
    await page.click("button:has-text('Clear all filters')"); await page.waitForTimeout(700);
    say("O-15 after Clear all filters: " + J(await names(page)) + " ; controls: " + J(await ctrls(page)));
    say("O-15 Clear all button count with no filter: " + J(await page.locator("button:has-text('Clear all filters')").count()));
    await openWs(page, "Empty");
    say("O-16 empty folder text: " + J((await bodyText(page)).split("\n").slice(14, 30)));
  });
  await step("O-17 per folder", async () => {
    await openWs(page, "Workspace"); await tools();
    await page.selectOption("select[aria-label='Filter by status']", { label: "Published" }); await page.waitForTimeout(700);
    say("O-17 Workspace status=Published: " + J(await names(page)));
    await openWs(page, "Other"); await tools();
    say("O-17 Other folder: status control value=" + J(await page.inputValue("select[aria-label='Filter by status']")) + " cards=" + J(await names(page)));
    await page.selectOption("select[aria-label='Filter by status']", { label: "Draft" }); await page.waitForTimeout(700);
    say("O-17 Other status=Draft: " + J(await names(page)));
    await openWs(page, "Workspace"); await tools();
    say("O-17 back in Workspace: status control value=" + J(await page.inputValue("select[aria-label='Filter by status']")) + " cards=" + J(await names(page)));
  });
});
