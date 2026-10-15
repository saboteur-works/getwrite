// Task 6 entity setup shared by the roster and graph runs (web build).
export * from "./task6-lib.mjs";
import { say, J, bodyText, createProject, createNode, treeClick, openSettings, closeSettings, tabs, sidebarText, reloadProject, typeInto, tick, pm } from "./task6-lib.mjs";
export async function enableEntities(page) {
  await openSettings(page, "Entities"); await page.getByRole("checkbox", { name: /^Entities/ }).first().click(); await tick(page, 1500); await closeSettings(page);
}
export async function declare(page, name, kind, aliases = []) {
  await treeClick(page, name);
  await page.fill("input[aria-label=entity-kind-input]", kind); await page.locator("input[aria-label=entity-kind-input]").blur(); await tick(page, 1500);
  for (const a of aliases) {
    await page.fill("input[aria-label=new-alias-input]", a); await page.click("button[aria-label=add-alias]"); await tick(page, 1300);
  }
}
export async function write(page, name, text) {
  await treeClick(page, name);
  await page.click('[role=tab]:has-text("Edit"), [role=tab]:has-text("Media")').catch(() => {});
  await pm(page).click(); await page.keyboard.insertText(text); await tick(page, 5500);
}
export async function relate(page, from, to, type) {
  await treeClick(page, from);
  await page.selectOption("select[aria-label=entity-relationship-target-select]", { label: to });
  await page.selectOption("select[aria-label=entity-relationship-type-select]", { label: type });
  await page.click("button[aria-label=add-entity-relationship]"); await tick(page, 1800);
}
export async function buildGraphProject(page, h, P = "Gr") {
  await createProject(page, h, P, "Blank");
  for (const n of ["Alice", "Bob", "Carol", "Dave", "Eve", "S1", "S2", "S3"]) await createNode(page, n, "text");
  await enableEntities(page);
  for (const [n, k] of [["Alice", "character"], ["Bob", "character"], ["Carol", "character"], ["Dave", "character"], ["Eve", "place"]]) await declare(page, n, k);
  await write(page, "S1", "Alice and Bob talk.");
  await write(page, "S2", "Alice, Bob and Carol meet at Eve.");
  await write(page, "S3", "Dave walks alone. " + "Far away words fill the page here. ".repeat(12) + "Then Alice arrives.");
  await write(page, "Bob", "Bob knows [[Alice]] well.");
  await relate(page, "Alice", "Bob", "mentor of");
  await relate(page, "Carol", "Alice", "ally of");
}
export const nodePos = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-testid=entity-graph-node]")].map((g) => { const r = g.getBoundingClientRect(); const name = (g.querySelector("text")?.textContent || g.getAttribute("aria-label") || "?").trim(); return [name, [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]]; })));
export const nodeOpacity = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-testid=entity-graph-node]")].map((g) => { const name = (g.querySelector("text")?.textContent || "?").trim(); return [name, getComputedStyle(g).opacity]; })));
export const edgesInfo = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge]")].map((e) => { const c = getComputedStyle(e); const attrs = {}; for (const a of e.attributes) if (!/^(d|points|x1|y1|x2|y2|style|class|data-testid)$/.test(a.name)) attrs[a.name] = a.value.slice(0, 50); return { tag: e.tagName, stroke: c.stroke, sw: c.strokeWidth, dash: c.strokeDasharray, op: c.opacity, marker: e.getAttribute("marker-end") ? "arrow" : "", attrs }; }));
export const listEdges = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=entity-graph-edge-item]")].map((e) => e.textContent.trim()));
export async function edgePoint(page, i) {
  return page.evaluate((idx) => { const t = document.querySelectorAll("[data-testid=entity-graph-edge-hit-target]")[idx]; if (!t || !t.getPointAtLength) return null; const len = t.getTotalLength(); const p = t.getPointAtLength(len * 0.5); const m = t.getScreenCTM(); const pt = new DOMPoint(p.x, p.y).matrixTransform(m); return [Math.round(pt.x), Math.round(pt.y)]; }, i);
}
export const tooltipText = (page) => page.evaluate(() => { const t = document.querySelector("[data-testid=entity-graph-edge-tooltip]"); return t ? t.textContent.trim() : null; });
export const vp = (page) => page.evaluate(() => document.querySelector("[data-testid=entity-graph-viewport]")?.getAttribute("transform"));
