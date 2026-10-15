// Task 6, web build: views/entity-relationship-graph.md G-04/G-05 (arrow direction of an authored edge). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tick, enableEntities, declare, relate } from "./task6-rlib.mjs";
import { nodePos, listEdges, edgePoint, tooltipText } from "./task6-rlib.mjs";
await withWeb("t6-g6", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Gr", "Blank");
  for (const n of ["Alice", "Bob", "S1"]) await createNode(page, n, "text");
  await enableEntities(page);
  await declare(page, "Alice", "character"); await declare(page, "Bob", "character");
  await relate(page, "Alice", "Bob", "mentor of");
  await treeClick(page, "Alice");
  say("Alice's sidebar relationships: " + J((await (await import("./task6-lib.mjs")).sidebarText(page)).split("RELATIONSHIPS")[1]?.slice(0, 300)));
  await treeClick(page, "Bob");
  say("Bob's sidebar relationships: " + J((await (await import("./task6-lib.mjs")).sidebarText(page)).split("RELATIONSHIPS")[1]?.slice(0, 300)));
  await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
  say("edges: " + J(await listEdges(page)) + " ; nodes: " + J(await nodePos(page)));
  say("authored edge geometry in screen px (x1,y1 = start, x2,y2 = end, marker-end on the end): " + J(await page.evaluate(() => { const e = document.querySelector("[data-testid=entity-graph-edge][data-edge-kind=authored]"); const m = e.getScreenCTM(); const a = new DOMPoint(+e.getAttribute("x1"), +e.getAttribute("y1")).matrixTransform(m), b = new DOMPoint(+e.getAttribute("x2"), +e.getAttribute("y2")).matrixTransform(m); return { start: [Math.round(a.x), Math.round(a.y)], end: [Math.round(b.x), Math.round(b.y)], markerEnd: e.getAttribute("marker-end"), markerStart: e.getAttribute("marker-start") }; })));
  say("canvas text labels near the edge: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-canvas] text")].map((t) => t.textContent.trim()))));
  const pt = await edgePoint(page, 0); await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(900); say("hover tooltip: " + J(await tooltipText(page)));
  await page.screenshot({ path: "/tmp/getwrite-handbook/logs/task6/t6-g6.png" });
});
