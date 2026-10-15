// Task 6, web build: views/timeline.md part 3 (hours-scale project: tooltip, ticks, gap labels, chip variants). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, reloadProject, handEdit, zoomLabel, chipsInfo, tabs, tick, treeClick, openSettings, closeSettings, projectDir } from "./task6-tlib.mjs";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const tlText = async (page) => { const l = (await bodyText(page)).split("\n"); return l.slice(l.indexOf("⌘K") + 1, l.indexOf("METADATA")); };
const tipInfo = (page) => page.evaluate(() => [...document.querySelectorAll('.timeline-root div[style*="z-index: 200"]')].filter((e) => e.textContent.trim()).map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); const strong = [...e.querySelectorAll("*")].filter((x) => x.children.length === 0 && x.textContent.trim()).map((x) => `${x.textContent.trim().slice(0, 60)}[w${getComputedStyle(x).fontWeight}]`); return { cls: e.className.toString().slice(0, 50), text: e.innerText.replace(/\n+/g, " | "), parts: strong, opacity: c.opacity, bg: c.backgroundColor, z: c.zIndex, pos: c.position, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; }));
const stepIf = (name, fn) => (!ONLY || ONLY.includes(name)) ? step(name, fn) : null;
const gaps = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=timeline-axis] ~ div *")].filter((e) => e.children.length === 0 && /^·\s*\S+\s*·$/.test(e.textContent.trim())).map((e) => e.textContent.trim()));
await withWeb("t6-t5", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Hrs", "Blank");
  await createNode(page, "Mara", "text"); await createNode(page, "Elena", "text");
  await createNode(page, "Act One", "folder", "Workspace"); await createNode(page, "Act Two", "folder", "Workspace");
  await reloadProject(page, "Hrs");
  for (const n of ["Morning", "Noon", "Evening", "Night"]) await createNode(page, n, "text", "Act One");
  for (const n of ["D1", "D2"]) await createNode(page, n, "text", "Act Two");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500); await closeSettings(page);
  await openSettings(page, "Metadata");
  for (const n of [/^Point of View/, /^Notes/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
  await closeSettings(page);
  const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config.statuses = ["Draft", "In review", "Published"]; writeFileSync(pj, JSON.stringify(j, null, 2));
  const LONGNOTE = "First sentence of the long note. " + "More words follow here to make the note long. ".repeat(8);
  await handEdit(page, h, "Hrs", [
    ["Morning", { storyDate: "2026-05-01T06:00", storyDuration: 180, pov: "Mara", status: "In review", notes: LONGNOTE }],
    ["Noon", { storyDate: "2026-05-01T12:00", pov: "Elena" }],
    ["Evening", { storyDate: "2026-05-01T18:00", storyDuration: 90 }],
    ["Night", { storyDate: "2026-05-01T23:30", storyDuration: 30, pov: "Mara" }],
    ["D1", { storyDate: "2026-05-01T06:00" }],
    ["D2", { storyDate: "2026-05-04T06:00", pov: "Elena" }],
  ]);
  await treeClick(page, "Morning"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  const zin = page.locator("button[aria-label='Zoom in']"), zout = page.locator("button[aria-label='Zoom out']");
  await stepIf("overview", async () => {
    say("T-41/T-42/T-28 timeline text at " + await zoomLabel(page) + ": " + J(await tlText(page)));
    say("T-28 gap labels: " + J(await gaps(page)));
    say("T-43..T-47 chips: " + J((await chipsInfo(page)).map((c) => `${c.label}|text=${J(c.text)}|${c.w}x${c.h}@${c.x},${c.y}`)));
    say("T-18/T-53 row heights: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=timeline-axis] ~ div")].map((r) => `${r.innerText.replace(/\n+/g, " / ").slice(0, 30)}|h=${Math.round(r.getBoundingClientRect().height)}`))));
    say("T-47 pin vs row: " + J(await page.evaluate(() => { const c = [...document.querySelectorAll(".timeline-chip")].find((e) => e.getAttribute("aria-label") === "Noon"); const row = c.closest("[data-testid=timeline-axis] ~ div"); const r = c.getBoundingClientRect(); const rr = row.getBoundingClientRect(); return { pinH: Math.round(r.height), pinW: r.width, rowH: Math.round(rr.height), pinTop: Math.round(r.top), rowTop: Math.round(rr.top) }; })));
  });
  await stepIf("per zoom", async () => {
    while (await zout.isEnabled()) { await zout.click(); await page.waitForTimeout(250); }
    const out = [];
    for (let k = 0; k < 10; k++) {
      const ticks = await page.evaluate(() => [...document.querySelector("[data-testid=timeline-axis]").children[1].children].map((t) => t.querySelector("span")?.textContent));
      out.push(`${await zoomLabel(page)}: ticks(${ticks.length})=${J(ticks.slice(0, 4))} gaps=${J(await gaps(page))} chips=${J((await chipsInfo(page)).map((c) => `${c.label}:${J(c.text)}:${c.w}x${c.h}`))}`);
      if (await zin.isDisabled()) break; await zin.click(); await page.waitForTimeout(300);
    }
    say("T-13/T-26/T-28/T-44..47 per zoom level:\n" + out.join("\n"));
    while (await zout.isEnabled()) { await zout.click(); await page.waitForTimeout(150); }
    for (let i = 0; i < 2; i++) { await zin.click(); await page.waitForTimeout(250); }
  });
  await stepIf("tooltips", async () => {
    say("zoom for tooltips: " + await zoomLabel(page));
    for (const n of ["Morning", "Noon", "Evening", "Night", "D1", "D2"]) {
      await page.mouse.move(5, 5); await page.waitForTimeout(500);
      const c = page.locator(`.timeline-chip[aria-label="${n}"]`).first(); await c.scrollIntoViewIfNeeded();
      const bb = await c.boundingBox();
      await c.hover({ position: { x: Math.min(4, bb.width / 2), y: 14 } }); await page.waitForTimeout(900);
      const t = await tipInfo(page); const r = await c.evaluate((e) => { const x = e.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; });
      say(`T-50 tooltip for ${n}: chipRect=${J(r)} tips=${J(t)}`);
      if (t.length) say(`T-52 element at tooltip center for ${n}: ` + await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className.toString().slice(0, 40)}` : null; }, [t[0].rect[0] + t[0].rect[2] / 2, t[0].rect[1] + t[0].rect[3] / 2]) + `; tooltip bottom ${t[0].rect[1] + t[0].rect[3]} vs chip top ${r[1]}`);
    }
  });
  await stepIf("T-14 Noon click", async () => {
    await page.mouse.move(5, 5);
    await page.locator('.timeline-chip[aria-label="Evening"]').first().click(); await tick(page, 1200);
    say("T-14 after clicking the Evening chip: tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " sidebar=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]));
  });
});
