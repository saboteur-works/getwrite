// Task 6 timeline setup shared by the timeline runs (web build).
export * from "./task6-lib.mjs";
import { say, J, bodyText, step, createProject, createNode, treeClick, openSettings, closeSettings, reloadProject, projectDir, expandAll } from "./task6-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export async function setScene(page, name, { date, time, dur, unit, end, endTime, pov, status, notes }) {
  await treeClick(page, name);
  if (pov) { await page.fill("input[aria-label=pov-input]", pov.slice(0, 3)); await tick(page, 900); await page.locator("ul li", { hasText: new RegExp("^" + pov + "$") }).first().click(); await tick(page, 1500); }
  if (status) { await page.selectOption("select[aria-label=status]", { label: status }); await tick(page, 1300); }
  if (date) { await page.fill("input[aria-label=story-date-input]", date); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 1300); }
  if (time) { await page.fill("input[aria-label=story-date-input-time]", time); await page.locator("input[aria-label=story-date-input-time]").blur(); await tick(page, 1300); }
  if (dur) { await page.fill("input[aria-label=story-duration-quantity]", String(dur)); await page.locator("input[aria-label=story-duration-quantity]").blur(); if (unit) await page.selectOption("select[aria-label=story-duration-unit]", { label: unit }); await tick(page, 1300); }
  if (notes) { const ta = page.locator("textarea[aria-label=notes], textarea[aria-label=notes-input]").first(); await ta.fill(notes); await ta.blur(); await tick(page, 1300); }
}
export async function buildTimelineProject(page, h, P = "Tl") {
  await createProject(page, h, P, "Blank");
  await createNode(page, "Mara", "text"); await createNode(page, "Elena", "text");
  await createNode(page, "Act One", "folder", "Workspace"); await createNode(page, "Act Two", "folder", "Workspace");
  await reloadProject(page, P);
  for (const n of ["Dawn", "Midday", "Midday Two"]) await createNode(page, n, "text", "Act One");
  for (const n of ["Spring", "Late"]) await createNode(page, n, "text", "Act Two");
  await createNode(page, "Long", "text", "Workspace"); await createNode(page, "Undated", "text", "Workspace");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500);
  await closeSettings(page);
  await openSettings(page, "Metadata");
  for (const n of [/^Point of View/, /^Notes/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
  await closeSettings(page);
  const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config = { ...(j.config || {}), statuses: ["Draft", "In review", "Published"] }; writeFileSync(pj, JSON.stringify(j, null, 2));
  await reloadProject(page, P);
}
import { sidecars } from "./task6-lib.mjs";
/** Writes userMetadata for the named scenes straight into the throwaway sidecars (hand edit, named in the rows), then reloads. */
export async function handEdit(page, h, P, edits) {
  const dir = projectDir(h);
  const all = sidecars(h);
  const idOf = (n) => all.find((s) => s.json.name === n).json.id;
  for (const [name, um, top] of edits) {
    const s = all.find((x) => x.json.name === name);
    const f = path.join(dir, "meta", s.file);
    const o = JSON.parse(readFileSync(f, "utf8"));
    const m = { ...(o.userMetadata || {}) };
    for (const [k, v] of Object.entries(um || {})) { if (v === null) delete m[k]; else m[k] = (k === "pov" && typeof v === "string") ? { id: idOf(v), name: v } : v; }
    o.userMetadata = m; Object.assign(o, top || {});
    writeFileSync(f, JSON.stringify(o, null, 2));
  }
  await reloadProject(page, P);
}
export const zoomLabel = (page) => page.locator(".timeline-zoom-label").innerText();
export const chipsInfo = (page) => page.evaluate(() => [...document.querySelectorAll(".timeline-chip")].map((e) => { const r = e.getBoundingClientRect(); return { text: e.innerText.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height), label: e.getAttribute("aria-label") || "" }; }));
