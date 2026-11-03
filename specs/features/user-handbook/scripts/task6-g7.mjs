// Re-run 2026-11-03 (group 4), web build: views/entity-relationship-graph.md G-28
// (shift-click a different node moves the focal point), with the settings panel closed,
// for an undimmed and a dimmed node, recording the element under the pointer. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, tabs, tick, enableEntities, declare, write } from "./task6-rlib.mjs";
import { nodePos, nodeOpacity } from "./task6-rlib.mjs";
const focalStatus = (page) => page.evaluate(() => document.querySelector("[data-testid=entity-graph-focal-point-status]")?.textContent.trim());
const hit = (page, [x, y]) => page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); const g = e?.closest("[data-testid]"); return e ? `${e.tagName}|${g?.getAttribute("data-testid")}|${g?.querySelector?.("text")?.textContent || ""}` : null; }, [x, y]);
const panelOpen = (page) => page.evaluate(() => !!document.querySelector("[data-testid=entity-graph-settings-panel]"));
async function shiftClick(page, name) {
  const p = (await nodePos(page))[name];
  const under = await hit(page, p);
  await page.keyboard.down("Shift"); await page.mouse.click(p[0], p[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
  return { p, under };
}
await withWeb("t6-g7", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Gr", "Blank");
  for (const n of ["Alice", "Bob", "Carol", "Dave", "Eve", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await enableEntities(page);
  for (const [n, k] of [["Alice", "character"], ["Bob", "character"], ["Carol", "character"], ["Dave", "character"], ["Eve", "place"]]) await declare(page, n, k);
  await write(page, "S1", "Alice and Bob talk.");
  await write(page, "S2", "Bob and Carol and Eve meet.");
  await write(page, "S3", "Dave and Alice walk.");
  await treeClick(page, "S1"); await page.click('[role=tab]:has-text("Graph")'); await tick(page, 3000);
  say("settings panel open: " + (await panelOpen(page)));
  let r = await shiftClick(page, "Dave");
  say(`shift-click Dave at ${J(r.p)} (element there ${r.under}): focal=${J(await focalStatus(page))} opacities=${J(await nodeOpacity(page))}`);
  const op = await nodeOpacity(page);
  const live = Object.keys(op).find((k) => Number(op[k]) >= 1 && k !== "Dave");
  const dim = Object.keys(op).find((k) => Number(op[k]) < 1);
  r = await shiftClick(page, live);
  say(`G-28 shift-click undimmed ${live} at ${J(r.p)} (element there ${r.under}): focal=${J(await focalStatus(page))} tab=${J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text))} opacities=${J(await nodeOpacity(page))}`);
  const op2 = await nodeOpacity(page);
  const dim2 = Object.keys(op2).find((k) => Number(op2[k]) < 1) || dim;
  r = await shiftClick(page, dim2);
  say(`G-28 shift-click dimmed ${dim2} at ${J(r.p)} (element there ${r.under}): focal=${J(await focalStatus(page))} tab=${J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text))} opacities=${J(await nodeOpacity(page))}`);
  // Same, with the settings panel open (the state in which task6-g3 saw dimmed nodes not respond).
  await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 800);
  say("settings panel open: " + (await panelOpen(page)));
  const op3 = await nodeOpacity(page);
  for (const n of Object.keys(op3)) {
    const p = (await nodePos(page))[n];
    say(`panel open: node ${n} opacity ${op3[n]} at ${J(p)} element there ${await hit(page, p)}`);
  }
  const focal3 = (await focalStatus(page)) || "";
  const live3 = Object.keys(op3).find((k) => Number(op3[k]) >= 1 && !focal3.includes(k));
  const dim3 = Object.keys(op3).find((k) => Number(op3[k]) < 1);
  for (const n of [live3, dim3].filter(Boolean)) {
    r = await shiftClick(page, n);
    say(`panel open: shift-click ${Number(op3[n]) < 1 ? "dimmed" : "undimmed"} ${n} at ${J(r.p)} (element there ${r.under}): focal=${J(await focalStatus(page))} opacities=${J(await nodeOpacity(page))}`);
  }
  // Deterministic case: with the panel open, measure it, close it, drag Carol to where the
  // panel sits, open it again, then click and shift-click Carol.
  const pr = await page.evaluate(() => { const r = document.querySelector("[data-testid=entity-graph-settings-panel]")?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; });
  say("settings panel rect [x,y,w,h]: " + J(pr));
  await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 800);
  say("settings panel open: " + (await panelOpen(page)));
  if (pr) {
    const target = [pr[0] + Math.round(pr[2] / 2), pr[1] + Math.round(pr[3] / 2)];
    const c0 = (await nodePos(page)).Carol;
    await page.mouse.move(c0[0], c0[1]); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(c0[0] + (target[0] - c0[0]) * i / 12, c0[1] + (target[1] - c0[1]) * i / 12); await page.waitForTimeout(30); }
    await page.mouse.up(); await tick(page, 1200);
    const c1 = (await nodePos(page)).Carol;
    say(`Carol dragged ${J(c0)} -> ${J(c1)} (target ${J(target)}); element there with panel closed: ${await hit(page, c1)}`);
    await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 800);
    say(`panel open again: ${await panelOpen(page)}; element at Carol ${J(c1)}: ${await hit(page, c1)}`);
    const before = await focalStatus(page);
    await page.keyboard.down("Shift"); await page.mouse.click(c1[0], c1[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
    say(`panel open, Carol under it: shift-click Carol: focal before=${J(before)} after=${J(await focalStatus(page))}`);
    await page.mouse.click(c1[0], c1[1]); await tick(page, 1800);
    say(`panel open, Carol under it: plain click Carol: tab=${J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text))}`);
    if (await panelOpen(page)) { await page.click("[data-testid=entity-graph-settings-toggle]"); await tick(page, 800); }
    say("settings panel open: " + (await panelOpen(page)));
    await page.keyboard.down("Shift"); await page.mouse.click(c1[0], c1[1]); await page.keyboard.up("Shift"); await tick(page, 1500);
    say(`panel closed: shift-click Carol at ${J(c1)} (element there ${await hit(page, c1)}): focal=${J(await focalStatus(page))}`);
  }
  // G-30, panel closed: is the focal point kept after the Edit tab and back, and after a reload?
  r = await shiftClick(page, "Bob");
  say(`G-30 shift-click Bob (element there ${r.under}): focal=${J(await focalStatus(page))}`);
  await page.click('[role=tab]:has-text("Edit")'); await tick(page, 1200);
  await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
  say(`G-30 after the Edit tab and back: focal=${J(await focalStatus(page))}`);
  await page.reload(); await tick(page, 3000); await page.click('button[aria-label="Open Gr"]'); await tick(page, 2500);
  await page.click('[role=tab]:has-text("Graph")'); await tick(page, 2500);
  say(`G-30 after a page reload: focal=${J(await focalStatus(page))}`);
});
