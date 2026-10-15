// Task 6, web build: views/timeline.md T-41 (year-scale tick labels), T-28 (large gap label). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, handEdit, zoomLabel, chipsInfo, tick, treeClick, openSettings, closeSettings } from "./task6-tlib.mjs";
const tlText = async (page) => { const l = (await bodyText(page)).split("\n"); return l.slice(l.indexOf("⌘K") + 1, l.indexOf("METADATA")); };
await withWeb("t6-t6", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Yrs", "Blank");
  await createNode(page, "Y1", "text"); await createNode(page, "Y2", "text"); await createNode(page, "Y3", "text");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500); await closeSettings(page);
  await handEdit(page, h, "Yrs", [["Y1", { storyDate: "2024-01-01" }], ["Y2", { storyDate: "2024-04-01" }], ["Y3", { storyDate: "2028-01-01" }]]);
  await treeClick(page, "Y1"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  const zin = page.locator("button[aria-label='Zoom in']"), zout = page.locator("button[aria-label='Zoom out']");
  while (await zout.isEnabled()) { await zout.click(); await page.waitForTimeout(250); }
  for (let k = 0; k < 8; k++) {
    const ticks = await page.evaluate(() => [...document.querySelector("[data-testid=timeline-axis]").children[1].children].map((t) => t.querySelector("span")?.textContent));
    const gaps = await page.evaluate(() => [...document.querySelectorAll("[data-testid=timeline-axis] ~ div *")].filter((e) => e.children.length === 0 && /^·\s*\S+\s*·$/.test(e.textContent.trim())).map((e) => e.textContent.trim()));
    say(`T-41 ${await zoomLabel(page)}: ticks(${ticks.length})=${J(ticks)} gaps=${J(gaps)}`);
    if (await zin.isDisabled()) break; await zin.click(); await page.waitForTimeout(300);
  }
});
