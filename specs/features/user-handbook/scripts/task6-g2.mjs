// Task 6, web build: views/entity-relationship-graph.md part 1 (what it shows, settings, getting around). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createNode, treeClick, tabs, tick, openSettings, closeSettings, addSidebarField, projectDir, reloadProject, sidecars } from "./task6-rlib.mjs";
import { buildGraphProject, nodePos, edgesInfo, listEdges, edgePoint, tooltipText, vp, enableEntities, declare } from "./task6-rlib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
const cfg = (h) => { const c = JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config; return { types: c.entityGraphConnectionTypes, radius: c.entityGraphFocalHopRadius }; };
const openGraph = async (page) => { await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000); };
const panel = async (page) => { if (!(await page.locator("[data-testid=entity-graph-settings-panel]").count())) { await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 700); } };
const toggle = async (page, label) => { await panel(page); await page.locator("[data-testid=entity-graph-settings-panel] label", { hasText: label }).locator("input[type=checkbox]").click(); await tick(page, 2500); };
await withWeb("t6-g2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await buildGraphProject(page, h);
  await createNode(page, "Hermit", "text"); await declare(page, "Hermit", "character");
  await openSettings(page, "Manage Tags"); await page.fill("input[aria-label='New tag name']", "hero"); await page.locator("button:text-is('Add Tag')").click(); await tick(page, 1800); await closeSettings(page);
  await reloadProject(page, "Gr");
  for (const n of ["Dave", "Eve"]) { await treeClick(page, n); const tb = page.locator("button:text-is('hero')"); if (await tb.count()) { await tb.first().click(); await tick(page, 1500); } else say("tag button missing on " + n); }
  await treeClick(page, "Carol"); await addSidebarField(page, "house", "House", "Text", "Document"); await page.fill("input[aria-label=house]", "Red"); await page.keyboard.press("Tab"); await tick(page, 1500);
  await treeClick(page, "Dave"); await page.fill("input[aria-label=house]", "Red"); await page.keyboard.press("Tab"); await tick(page, 1500);
  say("stored: " + J(sidecars(h).filter((s) => /^(Carol|Dave|Eve)$/.test(s.json.name)).map((s) => `${s.json.name}:${J(s.json.userMetadata)}`)) + " tags=" + J(JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config.tagAssignments));
  await openGraph(page);
  await step("G-01..G-06 default", async () => {
    say("G-02 nodes: " + J(Object.keys(await nodePos(page))) + " (Hermit has no mentions and no relationships)");
    say("G-03 panel checkboxes: " + J(await (async () => { await panel(page); return page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-settings-panel] input[type=checkbox]")].map((c) => `${c.closest("label")?.innerText.trim()}=${c.checked}`)); })()));
    say("G-04/G-06 edge styles: " + J(await edgesInfo(page)));
    say("G-04..06/G-31 list: " + J(await listEdges(page)));
    say("G-04/G-05 canvas svg text elements: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-canvas] text")].map((t) => t.textContent.trim()))));
    say("G-04/G-05 marker / defs: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-canvas] marker")].map((m) => m.id + ":" + m.outerHTML.slice(0, 120)))));
  });
  await step("G-07..G-12 connection types", async () => {
    for (const [lab] of [["Backlinks"], ["Proximity mentions"], ["Shared tags/metadata"]]) {
      await toggle(page, lab);
      say(`G-07/08/09 after turning on ${lab}: config=${J(cfg(h))} edge items=${J(await listEdges(page))} styles=${J((await edgesInfo(page)).map((e) => `${e.dash}|${e.sw}|${e.stroke}|${e.op}`))}`);
    }
    say("G-12 persisted immediately: config=" + J(cfg(h)));
    await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    await panel(page);
    say("G-12 after reload: checkboxes=" + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-settings-panel] input[type=checkbox]")].map((c) => `${c.closest("label")?.innerText.trim()}=${c.checked}`))) + " radius=" + J(await page.evaluate(() => document.querySelector("[data-testid=entity-graph-settings-panel] input[type=text], [data-testid=entity-graph-settings-panel] input[type=number]")?.value)));
    say("G-10 pairs with more than one kind: " + J((await listEdges(page)).filter((t) => /Alice and Bob|Alice → Bob|Bob.*Alice/.test(t))));
  });
  await step("G-11 layout", async () => {
    say("G-11 settings toggle and reset-view positions: " + J(await page.evaluate(() => ({ settings: JSON.stringify(document.querySelector("[data-testid=entity-graph-settings-toggle]").getBoundingClientRect().toJSON()), reset: JSON.stringify(document.querySelector("[data-testid=entity-graph-reset-view]").getBoundingClientRect().toJSON()) }))));
  });
  await step("G-13/14 pan zoom", async () => {
    const box = await page.locator("[data-testid=entity-graph-canvas]").boundingBox();
    const v0 = await vp(page); const p0 = await nodePos(page);
    await page.mouse.move(box.x + 40, box.y + 120); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + 40 + i * 15, box.y + 120 + i * 8); await page.waitForTimeout(30); } await page.mouse.up(); await tick(page, 600);
    const v1 = await vp(page); const p1 = await nodePos(page);
    say(`G-13 pan by dragging an empty area (+120,+64): transform ${v0} -> ${v1}; Alice ${J(p0.Alice)} -> ${J(p1.Alice)}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -300); await tick(page, 600);
    const v2 = await vp(page); const p2 = await nodePos(page);
    await page.mouse.wheel(0, 300); await tick(page, 600); const v3 = await vp(page);
    say(`G-14 wheel up: ${v1} -> ${v2} (Alice ${J(p1.Alice)} -> ${J(p2.Alice)}); wheel down: -> ${v3}`);
    await page.click("[data-testid=entity-graph-reset-view]"); await tick(page, 800); say("reset view -> " + await vp(page));
  });
  await step("G-15 click node", async () => {
    const p = await nodePos(page);
    await page.mouse.click(p.Bob[0], p.Bob[1]); await tick(page, 1800);
    say("G-15 plain click on Bob's node: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " sidebar=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
    const n = page.locator("[data-testid=entity-graph-node]").filter({ hasText: "Carol" }).first();
    await n.focus(); say("G-15 focus on Carol's node: tabindex=" + J(await n.getAttribute("tabindex")) + " role=" + J(await n.getAttribute("role")));
    await page.keyboard.press("Enter"); await tick(page, 1800);
    say("G-15 Enter on Carol's focused node: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " sidebar=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
    await page.locator("[data-testid=entity-graph-node]").filter({ hasText: "Dave" }).first().focus(); await page.keyboard.press("Space"); await tick(page, 1800);
    say("G-15 Space on Dave's focused node: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " sidebar=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
    await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
  });
  await step("G-16/18 drag and keyboard", async () => {
    const p0 = await nodePos(page); const e0 = await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge]")].map((e) => e.getBoundingClientRect().toJSON()));
    await page.mouse.move(p0.Dave[0], p0.Dave[1]); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(p0.Dave[0] + i * 12, p0.Dave[1] + i * 6); await page.waitForTimeout(30); } await page.mouse.up(); await tick(page, 1200);
    const p1 = await nodePos(page);
    say("G-16 drag Dave by (+120,+60): " + J(Object.fromEntries(Object.keys(p0).map((k) => [k, [p0[k], p1[k]]]))));
    say("G-16 after the drag: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)));
    const e1 = await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge]")].map((e) => e.getBoundingClientRect().toJSON()));
    say("G-16 edges whose bounding box changed: " + J(e0.map((b, i) => (Math.abs(b.width - e1[i].width) + Math.abs(b.height - e1[i].height) + Math.abs(b.x - e1[i].x) + Math.abs(b.y - e1[i].y) > 1 ? i : null)).filter((x) => x !== null)) + " of " + e0.length);
    const n = page.locator("[data-testid=entity-graph-node]").filter({ hasText: "Eve" }).first(); await n.focus();
    for (const k of ["ArrowRight", "ArrowDown", "Shift+ArrowRight", "Alt+ArrowRight"]) { await page.keyboard.press(k); await page.waitForTimeout(300); }
    const p2 = await nodePos(page);
    say("G-18 arrow keys on the focused Eve node: " + J([p1.Eve, p2.Eve]));
  });
  await step("G-20/21 tooltips", async () => {
    const list = await listEdges(page);
    for (const i of [0, 3, 7, list.length - 1]) {
      const pt = await edgePoint(page, i); if (!pt) continue;
      await page.mouse.move(5, 5); await page.waitForTimeout(300); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(900);
      say(`G-20 edge ${i} (list: ${J(list[i])}) hover at ${J(pt)} -> tooltip ${J(await tooltipText(page))}`);
    }
    say("G-21 tabindex on edge/hit-target elements: " + J(await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-testid=entity-graph-edge],[data-testid=entity-graph-edge-hit-target]")].map((e) => e.getAttribute("tabindex") + "/" + e.tagName))])));
    await page.mouse.move(5, 5); await page.waitForTimeout(500);
    const seq = []; for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(() => { const a = document.activeElement; return `${a.tagName}|${a.getAttribute("data-testid") || ""}|${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 20)}`; })); }
    say("G-21 Tab order inside the page: " + J(seq) + " ; tooltip after Tab: " + J(await tooltipText(page)));
  });
  await step("G-31/32 list", async () => {
    say("G-31 list classes/visibility: " + J(await page.evaluate(() => { const l = document.querySelector("[data-testid=entity-graph-accessible-list]"); const r = l.getBoundingClientRect(); const c = getComputedStyle(l); return { cls: l.className, w: Math.round(r.width), h: Math.round(r.height), clip: c.clip, position: c.position, overflow: c.overflow }; })));
    say("G-31 node list: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-node-item]")].map((e) => e.textContent.trim()))));
    const before = (await listEdges(page)).length; await toggle(page, "Backlinks"); const after = (await listEdges(page)).length; say(`G-32 list follows a toggle: edge items ${before} -> ${after} after turning Backlinks off; canvas edges now=${(await edgesInfo(page)).length}`);
  });
});
