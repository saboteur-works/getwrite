// Task 6, web build: views/entity-relationship-graph.md part 3 (dimmed nodes, saved-position reset, shared-field tooltip). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, openSettings, closeSettings, projectDir, reloadProject, sidecars, enableEntities, declare, write, relate, addSidebarField } from "./task6-rlib.mjs";
import { nodePos, nodeOpacity, edgesInfo, listEdges, edgePoint, tooltipText, vp } from "./task6-rlib.mjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const pj = (h) => JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8")).config;
const posFile = (h) => { const f = path.join(projectDir(h), "meta", "entity-graph-positions.json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), snap: r.connectionTypesSnapshot })) : null; };
const openGraph = async (page) => { await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000); };
const tabSel = async (page) => (await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text);
const focalStatus = (page) => page.evaluate(() => document.querySelector("[data-testid=entity-graph-focal-point-status]")?.textContent.trim());
const panel = async (page) => { if (!(await page.locator("[data-testid=entity-graph-settings-panel]").count())) { await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 700); } };
const toggle = async (page, label) => { await panel(page); await page.locator("[data-testid=entity-graph-settings-panel] label", { hasText: label }).locator("input[type=checkbox]").click(); await tick(page, 2500); };
const hit = (page, [x, y]) => page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); const g = e?.closest("[data-testid]"); return e ? `${e.tagName}|${g?.getAttribute("data-testid")}|${g?.querySelector?.("text")?.textContent || ""}` : null; }, [x, y]);
async function dragNode(page, name, dx, dy) { const p = (await nodePos(page))[name]; await page.mouse.move(p[0], p[1]); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(p[0] + dx * i / 10, p[1] + dy * i / 10); await page.waitForTimeout(30); } await page.mouse.up(); await tick(page, 1200); }
await withWeb("t6-g4", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Gr", "Blank");
  for (const n of ["Alice", "Bob", "Carol", "Dave", "Eve", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await enableEntities(page);
  for (const [n, k] of [["Alice", "character"], ["Bob", "character"], ["Carol", "character"], ["Dave", "character"], ["Eve", "place"]]) await declare(page, n, k);
  await write(page, "S1", "Alice and Bob talk.");
  await write(page, "S2", "Alice, Bob and Carol meet at Eve.");
  await write(page, "S3", "Dave walks alone. " + "Far away words fill the page here. ".repeat(12) + "Then Alice arrives.");
  await relate(page, "Alice", "Bob", "mentor of"); await relate(page, "Carol", "Alice", "ally of");
  await treeClick(page, "Carol"); await addSidebarField(page, "house", "House", "Text", "Document"); await page.fill("input[aria-label=house]", "Red"); await page.keyboard.press("Tab"); await tick(page, 1500);
  await treeClick(page, "Dave"); await page.fill("input[aria-label=house]", "Red"); await page.keyboard.press("Tab"); await tick(page, 1500);
  await openGraph(page);
  await step("node hit tests", async () => {
    const p = await nodePos(page);
    for (const n of Object.keys(p)) {
      say(`node ${n}: center ${J(p[n])} element at center: ${await hit(page, p[n])}`);
      await page.mouse.click(p[n][0], p[n][1]); await tick(page, 1500);
      say(`  plain click on ${n}: tab=${J(await tabSel(page))} sidebar=${J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0])}`);
      await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
    }
  });
  await step("focal and dimmed", async () => {
    const p0 = await nodePos(page);
    await page.keyboard.down("Shift"); await page.mouse.click(p0.Dave[0], p0.Dave[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
    const op = await nodeOpacity(page); const p1 = await nodePos(page);
    say("focal=" + J(await focalStatus(page)) + " opacities=" + J(op) + " positions=" + J(p1));
    const dimmed = Object.keys(op).filter((k) => Number(op[k]) < 1), live = Object.keys(op).filter((k) => Number(op[k]) >= 1 && k !== "Dave");
    say("dimmed=" + J(dimmed) + " not dimmed (besides Dave)=" + J(live));
    for (const n of [...live, ...dimmed]) {
      const q = (await nodePos(page))[n];
      say(`G-27 ${op[n] < 1 ? "DIMMED" : "undimmed"} ${n}: element at center=${await hit(page, q)} pointer-events=${await page.evaluate((nm) => { const g = [...document.querySelectorAll("[data-testid=entity-graph-node]")].find((x) => x.querySelector("text")?.textContent.trim() === nm); return getComputedStyle(g).pointerEvents; }, n)}`);
      await dragNode(page, n, 50, 30); const after = (await nodePos(page))[n];
      say(`G-27   drag ${n} (+50,+30): ${J(q)} -> ${J(after)} ; tab=${J(await tabSel(page))} ; focal=${J(await focalStatus(page))}`);
      const c = (await nodePos(page))[n]; await page.mouse.click(c[0], c[1]); await tick(page, 1500);
      say(`G-27   plain click on ${n}: tab=${J(await tabSel(page))} sidebar=${J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0])}`);
      await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
    }
  });
  await step("shared field tooltip", async () => {
    await toggle(page, "Shared tags/metadata");
    const list = new Set(await listEdges(page)); const n = (await edgesInfo(page)).length;
    say("list items mentioning the shared field: " + J([...list].filter((t) => /field/.test(t))));
    for (let i = 0; i < n; i++) {
      const k = await page.evaluate((j) => document.querySelectorAll("[data-testid=entity-graph-edge]")[j].getAttribute("data-edge-kind"), i);
      if (k !== "sharedMetadata") continue;
      const pt = await edgePoint(page, i); await page.mouse.move(5, 5); await page.waitForTimeout(300); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(800);
      say(`edge ${i} (${k}) hover at ${J(pt)}: tooltip=${J(await tooltipText(page))} inList=${list.has(await tooltipText(page))}`);
    }
    await toggle(page, "Shared tags/metadata");
  });
  await step("position reset", async () => {
    await page.click("[data-testid=entity-graph-clear-focal-point-button]", { force: true }).catch(() => {}); await tick(page, 800);
    const p0 = await nodePos(page);
    await dragNode(page, "Alice", 90, 60); const p1 = await nodePos(page);
    say(`drag Alice ${J(p0.Alice)} -> ${J(p1.Alice)} ; positions file=${J(posFile(h))} ; config types=${J(pj(h).entityGraphConnectionTypes)}`);
    await toggle(page, "Backlinks");
    say(`Backlinks on: config types=${J(pj(h).entityGraphConnectionTypes)} ; Alice immediately ${J((await nodePos(page)).Alice)} ; file=${J(posFile(h))}`);
    await treeClick(page, "S2"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
    say("Alice after leaving the Graph tab and returning: " + J((await nodePos(page)).Alice) + " ; all nodes " + J(await nodePos(page)));
    await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500); await openGraph(page);
    say("Alice after a page reload: " + J((await nodePos(page)).Alice) + " ; all nodes " + J(await nodePos(page)) + " ; file=" + J(posFile(h)));
    await toggle(page, "Backlinks");
    say("Backlinks off again: Alice " + J((await nodePos(page)).Alice) + " ; config types=" + J(pj(h).entityGraphConnectionTypes));
  });
});
