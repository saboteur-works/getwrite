// Task 6, web build: views/timeline.md T-44..T-47 (chip variants by space). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, handEdit, zoomLabel, tick, treeClick, openSettings, closeSettings } from "./task6-tlib.mjs";
const info = (page) => page.evaluate(() => [...document.querySelectorAll(".timeline-chip")].map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); const inner = [...e.querySelectorAll("*")].map((x) => `${x.tagName}:${x.textContent.trim().slice(0, 30)}`).join(","); return `${e.getAttribute("aria-label")}|text=${JSON.stringify(e.innerText.trim())}|${Math.round(r.width * 10) / 10}x${Math.round(r.height)}|minW=${c.minWidth}|overflow=${c.overflow}|textOverflow=${c.textOverflow}|whiteSpace=${c.whiteSpace}|fs=${c.fontSize}|radius=${c.borderRadius}|inner=${inner.slice(0, 80)}`; }));
await withWeb("t6-t8", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Var", "Blank");
  for (const n of ["The Very Long Journey Home", "Tiny Event Scene", "Point Event Scene", "A Medium Named Bar Scene"]) await createNode(page, n, "text");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500); await closeSettings(page);
  await handEdit(page, h, "Var", [
    ["The Very Long Journey Home", { storyDate: "2026-01-01", storyDuration: 28800 }],
    ["Tiny Event Scene", { storyDate: "2026-02-01T09:00", storyDuration: 60 }],
    ["Point Event Scene", { storyDate: "2026-02-15" }],
    ["A Medium Named Bar Scene", { storyDate: "2026-03-01", storyDuration: 5760 }],
  ]);
  await treeClick(page, "Tiny Event Scene"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  const zin = page.locator("button[aria-label='Zoom in']"), zout = page.locator("button[aria-label='Zoom out']");
  while (await zout.isEnabled()) { await zout.click(); await page.waitForTimeout(250); }
  for (let k = 0; k < 9; k++) { say(`T-44..47 at ${await zoomLabel(page)}:\n  ` + (await info(page)).join("\n  ")); if (await zin.isDisabled()) break; await zin.click(); await page.waitForTimeout(300); }
});
