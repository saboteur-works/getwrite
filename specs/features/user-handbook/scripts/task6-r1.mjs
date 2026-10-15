// Task 6, web build: views/entity-roster.md rows ER-01..ER-16. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, sidebarText, openSettings, closeSettings, dialogText, expandAll } from "./task6-rlib.mjs";
import { enableEntities, declare, write } from "./task6-rlib.mjs";
const roster = (page) => page.evaluate(() => { const l = (document.body.innerText || "").split("\n"); const i = l.indexOf("⌘K"); const j = l.lastIndexOf("METADATA"); return l.slice(i + 1, j); });
const rowsHtml = (page) => page.evaluate(() => [...document.querySelectorAll("[role=listitem], li, [class*=roster]")].slice(0, 3).map((e) => e.outerHTML.replace(/<svg.*?<\/svg>/g, "").slice(0, 700)));
await withWeb("t6-r1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "En", "Blank");
  for (const n of ["Zed", "Will", "Mary", "Bob", "Alice", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await step("T-off", async () => {
    say("ER-16 tabs before enabling entities: " + J((await tabs(page)).map((t) => t.text + ":" + (t.disabled ? "disabled" : "on"))));
    await treeClick(page, "Alice");
    await page.locator("span:has(> [role=tab]:has-text('ENTITIES'))").first().hover(); await page.waitForTimeout(800);
    say("ER-16 tooltip on the greyed Entities tab: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=tooltip], .react-tooltip")].map((e) => e.textContent))));
  });
  await enableEntities(page);
  await declare(page, "Alice", "character", ["Al"]);
  await declare(page, "Bob", "character", ["Bobby"]);
  await declare(page, "Mary", "character", ["Al"]);
  await declare(page, "Will", "character");
  await declare(page, "Zed", "place");
  await write(page, "S1", "Alice met Bob. Alice and Bobby walked home with Mary.");
  await write(page, "S2", "Alice went home. Nothing else happened.");
  await write(page, "S3", "Bob stayed alone.");
  await step("roster", async () => {
    await treeClick(page, "S1");
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 3000);
    say("ER-01..ER-11 roster text: " + J(await roster(page)));
    say("roster row html: " + J(await rowsHtml(page)));
    const mi = (await import("./task6-lib.mjs")).sidecars(h).map((s) => `${s.json.name}: kind=${s.json.entityKind} aliases=${J(s.json.aliases)}`);
    say("stored entities: " + J(mi.filter((x) => /kind=/.test(x) && !/kind=undefined/.test(x))));
  });
  await step("ER-12/14 open + read-only", async () => {
    say("ER-14 inputs/selects inside the roster list: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=listitem] input, [role=listitem] select, [role=listitem] textarea, li input, li select")].length)));
    const row = page.locator("[role=listitem], li").filter({ hasText: /^Bob/ }).first();
    say("ER-12 row element: " + J(await row.evaluate((e) => `${e.tagName}|role=${e.getAttribute("role")}|tabindex=${e.getAttribute("tabindex")}`)));
    await row.focus().catch(() => {}); await page.keyboard.press("Enter"); await tick(page, 1500);
    say("ER-12 after Enter on the Bob row: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " sidebar=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 1500);
    await page.locator("[role=listitem], li").filter({ hasText: /^Alice/ }).first().click(); await tick(page, 1500);
    const t = await bodyText(page);
    say("ER-12/13 after clicking the Alice row: tab=" + J((await tabs(page)).filter((x) => x.selected === "true").map((x) => x.text)) + " sidebar heading=" + J(t.split("\nMETADATA\n")[1]?.split("\n")[0]) + " ; has alias input=" + await page.locator("input[aria-label=new-alias-input]").count() + " ; has mentioned-in=" + J(/ENTITY MENTIONS|MENTIONED IN/i.test(t)));
    say("ER-13 sidebar entity mentions part: " + J((await sidebarText(page)).split("ENTITY MENTIONS")[1]?.slice(0, 500)));
  });
});
