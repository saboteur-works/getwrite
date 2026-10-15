// Task 6, web build: views/entity-relationship-graph.md part 2 (focal point, hop radius, saved positions, read-only). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, openSettings, closeSettings, projectDir, reloadProject, sidecars, enableEntities, declare, write, relate } from "./task6-rlib.mjs";
import { nodePos, nodeOpacity, edgesInfo, listEdges, edgePoint, tooltipText, vp } from "./task6-rlib.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
const pj = (h) => JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config;
const posFile = (h) => { const f = path.join(projectDir(h), "meta", "entity-graph-positions.json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const openGraph = async (page) => { await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000); };
const tabSel = async (page) => (await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text);
const focalStatus = (page) => page.evaluate(() => document.querySelector("[data-testid=entity-graph-focal-point-status]")?.textContent.trim());
const panel = async (page) => { if (!(await page.locator("[data-testid=entity-graph-settings-panel]").count())) { await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 700); } };
const toggle = async (page, label) => { await panel(page); await page.locator("[data-testid=entity-graph-settings-panel] label", { hasText: label }).locator("input[type=checkbox]").click(); await tick(page, 2500); };
const dimmedEdges = (page) => page.evaluate(() => { const a = [...document.querySelectorAll("[data-testid=entity-graph-edge]")]; return `${a.filter((e) => e.getAttribute("data-focal-dimmed") === "true").length} of ${a.length}`; });
async function dragNode(page, name, dx, dy) { const p = (await nodePos(page))[name]; await page.mouse.move(p[0], p[1]); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(p[0] + dx * i / 10, p[1] + dy * i / 10); await page.waitForTimeout(30); } await page.mouse.up(); await tick(page, 1200); }
await withWeb("t6-g3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Gr", "Blank");
  for (const n of ["Alice", "Bob", "Carol", "Dave", "Eve", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await step("G-34 greyed", async () => {
    await treeClick(page, "Alice");
    say("G-34 tabs with Entities off: " + J((await tabs(page)).map((t) => t.text + ":" + (t.disabled ? "disabled" : "on"))));
    await page.locator("span:has(> [role=tab]:has-text('GRAPH'))").first().hover(); await page.waitForTimeout(800);
    say("G-34 tooltip on the greyed Graph tab: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=tooltip], .react-tooltip")].map((e) => e.textContent))));
  });
  await enableEntities(page);
  for (const [n, k] of [["Alice", "character"], ["Bob", "character"], ["Carol", "character"], ["Dave", "character"], ["Eve", "place"]]) await declare(page, n, k);
  await write(page, "S1", "Alice and Bob talk.");
  await write(page, "S2", "Alice, Bob and Carol meet at Eve.");
  await write(page, "S3", "Dave walks alone. " + "Far away words fill the page here. ".repeat(12) + "Then Alice arrives.");
  await write(page, "Bob", "Bob knows [[Alice]] well.");
  await relate(page, "Alice", "Bob", "mentor of"); await relate(page, "Carol", "Alice", "ally of");
  await openGraph(page);
  say("config at start: " + J({ types: pj(h).entityGraphConnectionTypes, radius: pj(h).entityGraphFocalHopRadius }) + " ; focal status=" + J(await focalStatus(page)) + " ; positions file=" + J(posFile(h)));
  await step("G-35 read-only", async () => {
    say("G-35 buttons/inputs in the graph view: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-relationship-graph-view] button, [data-testid=entity-relationship-graph-view] input, [data-testid=entity-relationship-graph-view] select")].map((e) => `${e.tagName}|${e.getAttribute("aria-label") || ""}|${e.innerText.trim().slice(0, 30)}`))));
    const pt = await edgePoint(page, 7); await page.mouse.dblclick(pt[0], pt[1]); await page.waitForTimeout(600);
    say("G-35 double-click on an authored edge: tab=" + J(await tabSel(page)) + " relationships still: " + J(sidecars(h).length));
    await page.mouse.move(5, 5);
  });
  await step("G-20 rigorous tooltips", async () => {
    for (const lab of ["Backlinks", "Proximity mentions", "Shared tags/metadata"]) await toggle(page, lab);
    const list = new Set(await listEdges(page)); const n = (await edgesInfo(page)).length;
    const res = [];
    for (let i = 0; i < n; i++) { const pt = await edgePoint(page, i); await page.mouse.move(5, 5); await page.waitForTimeout(250); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(700); const t = await tooltipText(page); res.push({ i, kind: (await page.evaluate((k) => document.querySelectorAll("[data-testid=entity-graph-edge]")[k].getAttribute("data-edge-kind"), i)), t, inList: t ? list.has(t) : null }); }
    say("G-20 edges=" + n + " list items=" + list.size + " ; hover results: " + J(res.map((r) => `${r.i}:${r.kind}:${r.inList}:${r.t ? r.t.slice(0, 70) : null}`)));
    say("G-20 tooltips not found in the list: " + J(res.filter((r) => r.t && !r.inList).map((r) => r.t)));
    for (const lab of ["Backlinks", "Proximity mentions", "Shared tags/metadata"]) await toggle(page, lab);
    say("config after toggling the three types off again: " + J(pj(h).entityGraphConnectionTypes));
  });
  await step("G-19/25/26/27/28 focal", async () => {
    const p0 = await nodePos(page); const box = await page.locator("[data-testid=entity-graph-canvas]").boundingBox();
    say("G-25 before: viewport=" + await vp(page) + " opacities=" + J(await nodeOpacity(page)) + " dimmed edges=" + await dimmedEdges(page) + " canvas center=" + J([Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]));
    await page.keyboard.down("Shift"); await page.mouse.click(p0.Dave[0], p0.Dave[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
    const p1 = await nodePos(page);
    say(`G-19 shift-click on Dave: tab=${J(await tabSel(page))} (a plain click goes to Edit) ; focal status=${J(await focalStatus(page))} ; viewport=${await vp(page)} ; Dave screen pos ${J(p0.Dave)} -> ${J(p1.Dave)} ; canvas center ${J([Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)])}`);
    say("G-25 radius 1: opacities=" + J(await nodeOpacity(page)) + " dimmed edges=" + await dimmedEdges(page) + " ; positions file after=" + J(posFile(h)));
    await panel(page);
    const rin = page.locator("[data-testid=entity-graph-settings-panel] input[type=text], [data-testid=entity-graph-settings-panel] input[type=number]").first();
    await rin.fill("2"); await rin.blur(); await tick(page, 2000);
    say("G-26 radius set to 2: config radius=" + J(pj(h).entityGraphFocalHopRadius) + " opacities=" + J(await nodeOpacity(page)) + " dimmed edges=" + await dimmedEdges(page));
    await rin.fill("3"); await rin.blur(); await tick(page, 2000);
    say("G-26 radius 3: config radius=" + J(pj(h).entityGraphFocalHopRadius) + " opacities=" + J(await nodeOpacity(page)));
    await rin.fill("1"); await rin.blur(); await tick(page, 2000);
    say("G-26 radius back to 1: " + J(await nodeOpacity(page)));
    // G-27 dimmed node behaviours
    const op = await nodeOpacity(page); const dimmed = Object.keys(op).filter((k) => Number(op[k]) < 1);
    say("G-27 dimmed nodes: " + J(dimmed));
    const dn = dimmed[0]; const pp = await nodePos(page);
    await dragNode(page, dn, 60, 40); const pa = await nodePos(page);
    say(`G-27 drag dimmed ${dn}: ${J(pp[dn])} -> ${J(pa[dn])}; tab=${J(await tabSel(page))}`);
    const ep = await page.evaluate(() => { const es = [...document.querySelectorAll("[data-testid=entity-graph-edge]")]; const i = es.findIndex((e) => e.getAttribute("data-focal-dimmed") === "true"); return i; });
    if (ep >= 0) { const pt = await edgePoint(page, ep); await page.mouse.move(5, 5); await page.waitForTimeout(300); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(800); say("G-27 hover a dimmed edge: " + J(await tooltipText(page))); }
    await page.mouse.move(5, 5);
    const pc = (await nodePos(page))[dn]; await page.mouse.click(pc[0], pc[1]); await tick(page, 1800);
    say(`G-27 plain click on dimmed ${dn}: tab=${J(await tabSel(page))} sidebar=${J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0])}`);
    await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
    say("after returning to the Graph tab (navigated Edit and back): focal status=" + J(await focalStatus(page)) + " opacities=" + J(await nodeOpacity(page)));
    // G-28
    const q = await nodePos(page);
    await page.keyboard.down("Shift"); await page.mouse.click(q.Carol[0], q.Carol[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
    say("G-28 shift-click Carol: focal=" + J(await focalStatus(page)) + " opacities=" + J(await nodeOpacity(page)));
    // G-29 list buttons
    say("G-29 list buttons: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-accessible-list] button")].map((b) => `${b.getAttribute("data-testid")}|${b.textContent.trim()}`))));
    const sb = page.locator("[data-testid=entity-graph-node-set-focal-button]").filter({ hasText: "Bob" }).first();
    await sb.focus(); await page.keyboard.press("Enter"); await tick(page, 1500);
    say("G-29 'Set Bob as focal point' via keyboard: focal=" + J(await focalStatus(page)) + " opacities=" + J(await nodeOpacity(page)));
    await page.locator("[data-testid=entity-graph-clear-focal-point-button]").focus(); await page.keyboard.press("Enter"); await tick(page, 1500);
    say("G-29 'Clear focal point' via keyboard: focal=" + J(await focalStatus(page)) + " opacities=" + J(await nodeOpacity(page)) + " dimmed edges=" + await dimmedEdges(page));
    // G-30
    await page.keyboard.down("Shift"); const w = await nodePos(page); await page.mouse.click(w.Eve[0], w.Eve[1]); await page.keyboard.up("Shift"); await tick(page, 1200);
    say("G-30 focal set to Eve: " + J(await focalStatus(page)));
    await treeClick(page, "S2"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
    say("G-30 after leaving the Graph tab and coming back: " + J(await focalStatus(page)));
    await page.keyboard.down("Shift"); const w2 = await nodePos(page); await page.mouse.click(w2.Eve[0], w2.Eve[1]); await page.keyboard.up("Shift"); await tick(page, 1200);
    await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    say("G-30 after a page reload: " + J(await focalStatus(page)) + " ; project.json has a focal key: " + J(Object.keys(pj(h)).filter((k) => /focal/i.test(k))));
  });
  await step("G-22/23/24 positions", async () => {
    const p0 = await nodePos(page);
    await dragNode(page, "Alice", 90, 60);
    const p1 = await nodePos(page);
    say(`G-22 drag Alice by (+90,+60): ${J(p0.Alice)} -> ${J(p1.Alice)} ; positions file=${J(posFile(h))}`);
    await treeClick(page, "S2"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
    say("G-22 after Edit and back: Alice " + J((await nodePos(page)).Alice));
    await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    say("G-22 after a page reload: Alice " + J((await nodePos(page)).Alice));
    await page.goto(h.baseUrl + "/"); await tick(page, 1500); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    say("G-22 after closing and reopening the project: Alice " + J((await nodePos(page)).Alice));
    say("G-24 position file location: " + J(path.relative(path.dirname(projectDir(h)), path.join(projectDir(h), "meta", "entity-graph-positions.json"))));
    await createNode(page, "Zed", "text"); await declare(page, "Zed", "place"); await openGraph(page);
    say("G-23 after declaring one more entity (Zed): Alice " + J((await nodePos(page)).Alice) + " (dragged position was " + J(p1.Alice) + "); nodes=" + J(Object.keys(await nodePos(page))));
    await panel(page); const rin = page.locator("[data-testid=entity-graph-settings-panel] input[type=text], [data-testid=entity-graph-settings-panel] input[type=number]").first();
    await rin.fill("2"); await rin.blur(); await tick(page, 2000);
    say("G-23 after changing the hop radius to 2: Alice " + J((await nodePos(page)).Alice));
    await rin.fill("1"); await rin.blur(); await tick(page, 1500);
    const before = (await nodePos(page)).Alice;
    await toggle(page, "Backlinks");
    say(`G-23 after turning Backlinks on: Alice ${J(before)} -> ${J((await nodePos(page)).Alice)} ; positions file=${J(posFile(h))}`);
    await toggle(page, "Backlinks");
    say("G-23 after turning Backlinks off again: Alice " + J((await nodePos(page)).Alice) + " ; positions file=" + J(posFile(h)));
    await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    say("G-23 after reload: Alice " + J((await nodePos(page)).Alice));
  });
});
