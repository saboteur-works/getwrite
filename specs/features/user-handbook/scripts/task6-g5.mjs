// Task 6, web build: views/entity-relationship-graph.md G-27 (dimmed nodes: drag, click, tooltip), without navigating in between. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, tick, enableEntities, declare, write } from "./task6-rlib.mjs";
import { nodePos, nodeOpacity, edgesInfo, listEdges, edgePoint, tooltipText } from "./task6-rlib.mjs";
const tabSel = async (page) => (await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text);
const focalStatus = (page) => page.evaluate(() => document.querySelector("[data-testid=entity-graph-focal-point-status]")?.textContent.trim());
const hit = (page, [x, y]) => page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); const g = e?.closest("[data-testid]"); return e ? `${e.tagName}|${g?.getAttribute("data-testid")}|${g?.querySelector?.("text")?.textContent || ""}` : null; }, [x, y]);
async function dragNode(page, name, dx, dy) { const p = (await nodePos(page))[name]; await page.mouse.move(p[0], p[1]); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(p[0] + dx * i / 10, p[1] + dy * i / 10); await page.waitForTimeout(30); } await page.mouse.up(); await tick(page, 1200); }
const dimEdges = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge]")].map((e, i) => `${i}:${e.getAttribute("data-focal-dimmed")}`));
await withWeb("t6-g5", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Gr", "Blank");
  for (const n of ["Alice", "Bob", "Carol", "Dave", "Eve", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await enableEntities(page);
  for (const [n, k] of [["Alice", "character"], ["Bob", "character"], ["Carol", "character"], ["Dave", "character"], ["Eve", "place"]]) await declare(page, n, k);
  await write(page, "S1", "Alice and Bob talk.");
  await write(page, "S2", "Bob and Carol and Eve meet.");
  await write(page, "S3", "Dave and Alice walk.");
  await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
  say("edges: " + J(await listEdges(page)));
  const p0 = await nodePos(page);
  await page.keyboard.down("Shift"); await page.mouse.click(p0.Dave[0], p0.Dave[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
  const op = await nodeOpacity(page);
  say("focal=" + J(await focalStatus(page)) + " opacities=" + J(op) + " edges dimmed flags=" + J(await dimEdges(page)));
  const dimmed = Object.keys(op).filter((k) => Number(op[k]) < 1), live = Object.keys(op).filter((k) => Number(op[k]) >= 1 && k !== "Dave");
  say("dimmed=" + J(dimmed) + " undimmed besides Dave=" + J(live));
  for (const n of [...live, ...dimmed]) {
    const q = (await nodePos(page))[n];
    await dragNode(page, n, 40, 25); const a = (await nodePos(page))[n];
    say(`drag ${op[n] < 1 ? "DIMMED" : "undimmed"} ${n} (+40,+25): ${J(q)} -> ${J(a)} ; focal=${J(await focalStatus(page))} tab=${J(await tabSel(page))} opacities=${J(await nodeOpacity(page))}`);
  }
  const dEdge = await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge]")].findIndex((e) => e.getAttribute("data-focal-dimmed") === "true"));
  if (dEdge >= 0) { const pt = await edgePoint(page, dEdge); await page.mouse.move(5, 5); await page.waitForTimeout(300); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(800); say(`hover a dimmed edge (${dEdge}): ${J(await tooltipText(page))} ; element there=${await hit(page, pt)}`); }
  const dn = dimmed[0]; const pn = (await nodePos(page))[dn];
  await page.mouse.move(pn[0], pn[1]); await page.waitForTimeout(900); say(`hover dimmed node ${dn}: tooltip=${J(await tooltipText(page))}`);
  await page.mouse.click(pn[0], pn[1]); await tick(page, 1800);
  say(`plain click on dimmed ${dn}: tab=${J(await tabSel(page))} sidebar=${J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0])}`);
  await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
  say("back on the Graph tab after navigating to a document: focal=" + J(await focalStatus(page)) + " opacities=" + J(await nodeOpacity(page)));
});
