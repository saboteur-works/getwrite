// Task 6, web build: views/entity-roster.md rows ER-08..ER-14 (noise sources, dismiss, open a row). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, sidebarText, openSettings, closeSettings, dialogText, sidecars, reloadProject } from "./task6-rlib.mjs";
import { enableEntities, declare, write } from "./task6-rlib.mjs";
const roster = (page) => page.evaluate(() => { const l = (document.body.innerText || "").split("\n"); const i = l.indexOf("⌘K"); const j = l.lastIndexOf("METADATA"); return l.slice(i + 1, j); });
const row = (page, name) => page.locator("[data-testid=entity-roster-row]").filter({ has: page.locator(`[data-testid=entity-roster-row-name]:text-is("${name}")`) }).first();
const flagged = async (page) => { const r = await roster(page); const out = {}; let cur = null; for (const l of r) { if (["Alice","Bob","Mary","Will","Zed","Ox"].includes(l)) cur = l; if (/^Needs attention/.test(l) && cur) out[cur] = (out[cur] || "") + l + " "; } return out; };
const tabSel = async (page) => (await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text);
await withWeb("t6-r2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "En", "Blank");
  for (const n of ["Zed", "Will", "Mary", "Bob", "Alice", "S1"]) await createNode(page, n, "text");
  await enableEntities(page);
  await declare(page, "Alice", "character", ["Al"]); await declare(page, "Bob", "character"); await declare(page, "Mary", "character", ["Al"]);
  await declare(page, "Will", "character"); await declare(page, "Zed", "place");
  await write(page, "S1", "Alice met Bob and Mary.");
  await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2500);
  await step("ER-12 open a row", async () => {
    const b = row(page, "Bob").locator("button").first();
    await b.focus(); await page.keyboard.press("Enter"); await tick(page, 1800);
    say("ER-12 Enter on the Bob row button: tab=" + J(await tabSel(page)) + " sidebar heading=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 1500);
    await row(page, "Alice").locator("button").first().focus(); await page.keyboard.press("Space"); await tick(page, 1800);
    say("ER-12 Space on the Alice row button: tab=" + J(await tabSel(page)) + " sidebar heading=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    say("ER-13 Alice sidebar: alias input present=" + await page.locator("input[aria-label=new-alias-input]").count() + " ; alias/kind values=" + J(await page.evaluate(() => [...document.querySelectorAll("input")].filter((i) => /kind|alias/i.test(i.getAttribute("aria-label") || "")).map((i) => `${i.getAttribute("aria-label")}=${i.value}`))));
    const sb = await sidebarText(page); say("ER-13 Alice sidebar entity part: " + J(sb.slice(sb.indexOf("ENTITY\n"))));
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 1500);
    await row(page, "Mary").locator("button").first().click(); await tick(page, 1800);
    say("ER-12 click on the Mary row button: tab=" + J(await tabSel(page)) + " sidebar heading=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 1500);
  });
  await step("ER-08/09/10 dismiss", async () => {
    say("ER-08 flagged now: " + J(await flagged(page)));
    const dis = page.locator("button[aria-label='Dismiss noise observation for \"Will\"']");
    say("ER-09 dismiss button for Will: count=" + await dis.count() + " text=" + J(await dis.first().innerText().catch(() => null)));
    await dis.first().click(); await tick(page, 1800);
    say("ER-10 after dismissing Will: flagged=" + J(await flagged(page)) + " ; Alice 'Al' dismiss still there=" + await page.locator("button[aria-label='Dismiss noise observation for \"Al\"']").count());
    say("ER-10 sidecar Will: " + J(sidecars(h).find((s) => s.json.name === "Will").json.dismissedNoiseTerms));
    await reloadProject(page, "En"); await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2500);
    say("ER-10 after reload: flagged=" + J(await flagged(page)));
    const dal = page.locator("button[aria-label='Dismiss noise observation for \"Al\"']");
    await dal.first().click(); await tick(page, 1800);
    say("ER-10 dismissed 'Al' on the first row that shows it: flagged=" + J(await flagged(page)) + " ; sidecars: " + J(sidecars(h).filter((s) => s.json.dismissedNoiseTerms).map((s) => `${s.json.name}:${J(s.json.dismissedNoiseTerms)}`)));
  });
  await step("ER-10 text changes", async () => {
    await treeClick(page, "Zed");
    await page.fill("input[aria-label=new-alias-input]", "It"); await page.click("button[aria-label=add-alias]"); await tick(page, 1500);
    say("Zed alias controls: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || "").filter((t) => /lias|ismiss|emove/.test(t)))));
    const dz = page.locator("button[aria-label='Dismiss noise observation for \"It\"']");
    say("Zed 'It' sidebar dismiss count=" + await dz.count());
    if (await dz.count()) { await dz.first().click(); await tick(page, 1500); }
    say("Zed dismissed list: " + J(sidecars(h).find((s) => s.json.name === "Zed").json.dismissedNoiseTerms));
    const rm = page.locator("button[aria-label*='emove alias'], button[aria-label*='emove It']").first();
    if (await rm.count()) { await rm.click(); await tick(page, 1500); }
    await page.fill("input[aria-label=new-alias-input]", "Is"); await page.click("button[aria-label=add-alias]"); await tick(page, 1500);
    await page.click('[role=tab]:has-text("Entities")'); await tick(page, 2000);
    say("ER-10 after replacing the dismissed alias 'It' with 'Is': flagged=" + J(await flagged(page)) + " ; Zed row text=" + J((await row(page, "Zed").innerText()).split("\n")));
  });
  await step("ER-08 project custom noise words", async () => {
    await openSettings(page, "Noise Words");
    say("Noise Words tab: " + J(await dialogText(page)));
    say("controls: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input, [role=dialog] button, [role=dialog] textarea")].map((e) => `${e.tagName}|${e.getAttribute("aria-label") || ""}|${(e.innerText || e.placeholder || "").slice(0, 25)}`).filter((t) => /oise|ustom|dd|ADD/i.test(t)))));
    const inp = page.locator("[role=dialog] input[aria-label*=ustom], [role=dialog] input[placeholder*=oise], [role=dialog] input[placeholder*=word]").first();
    if (await inp.count()) { await inp.fill("Zed"); await page.keyboard.press("Enter"); await tick(page, 1500); }
    say("after adding Zed: " + J((await dialogText(page)).split("\n").slice(-12)) + " ; project.json custom=" + J((await import("./task6-lib.mjs")).projectDir ? "n/a" : ""));
    await closeSettings(page);
    await page.click('[role=tab]:has-text("Entities")').catch(() => {}); await tick(page, 2000);
    say("ER-08 after custom noise word Zed: flagged=" + J(await flagged(page)));
  });
});
