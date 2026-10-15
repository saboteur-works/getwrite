// Task 6, web build: views/timeline.md part 1 (enabling, placement, zoom, ticks). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, buildTimelineProject, handEdit, zoomLabel, chipsInfo, tabs, tick, treeClick, sidecars, openSettings, closeSettings, dialogText, projectDir, setScene } from "./task6-tlib.mjs";
const tlText = async (page) => { const l = (await bodyText(page)).split("\n"); return l.slice(l.indexOf("⌘K") + 1, l.indexOf("METADATA")); };
const trackInfo = (page) => page.evaluate(() => { const ax = document.querySelector("[data-testid=timeline-axis]"); const tr = ax.children[1].getBoundingClientRect(); const sc = ax.parentElement.parentElement; return { trackLeft: Math.round(tr.left), trackWidth: Math.round(tr.width), scrollW: sc.scrollWidth, clientW: sc.clientWidth, minWidth: ax.parentElement.style.minWidth, ticks: [...ax.children[1].children].map((t) => ({ text: t.querySelector("span")?.textContent, x: Math.round(t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2) })) }; });
await withWeb("t6-t3", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1000);
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Tl"); await page.selectOption("select", { label: (await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent)) });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  await step("gear menu", async () => {
    await page.click('button[aria-label="Open project settings menu"]'); await page.waitForTimeout(600);
    say("gear menu items: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], [role=menu] button, [role=menu] a")].map((e) => e.textContent.trim()).filter(Boolean))));
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  });
  await step("T-03 before enabling", async () => {
    say("T-03 tabs in a new project: " + J((await tabs(page)).map((t) => t.text + ":" + (t.disabled ? "disabled" : "on"))));
    await page.locator("span:has(> [role=tab]:has-text('TIMELINE'))").first().hover(); await page.waitForTimeout(800);
    say("T-07 tooltip on the greyed Timeline tab: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=tooltip], .react-tooltip")].map((e) => e.textContent))));
  });
  await step("T-22 empty", async () => {
    await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500);
    say("T-04 after enabling the view: Metadata tab 'Timeline' checkbox -> " + J(await (async () => { await page.click('[role=dialog] [role=tab]:has-text("Metadata")'); await tick(page, 800); return page.evaluate(() => [...document.querySelectorAll("[role=dialog] input[type=checkbox]")].map((c) => `${c.closest("label")?.innerText.replace(/\n+/g, " / ").slice(0, 30)}=${c.checked}`)); })()));
    await closeSettings(page);
    const { createNode } = await import("./task6-lib.mjs"); await createNode(page, "Solo", "text"); await treeClick(page, "Solo");
    await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 1500);
    say("T-22 Timeline tab, no scenes yet (new project): " + J(await tlText(page)));
  });
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(800);
  await page.goto(h.baseUrl + "/");
  await createAll(page, h);
  async function createAll(page, h) {
    const { createNode, reloadProject } = await import("./task6-lib.mjs");
    await page.click('button[aria-label="Open Tl"]'); await page.waitForTimeout(2000);
    await createNode(page, "Mara", "text"); await createNode(page, "Elena", "text");
    await createNode(page, "Act One", "folder", "Workspace"); await createNode(page, "Act Two", "folder", "Workspace");
    await reloadProject(page, "Tl");
    for (const n of ["Dawn", "Midday", "Midday Two"]) await createNode(page, n, "text", "Act One");
    for (const n of ["Spring", "Late"]) await createNode(page, n, "text", "Act Two");
    await createNode(page, "Long", "text", "Workspace"); await createNode(page, "Undated", "text", "Workspace");
    await openSettings(page, "Metadata");
    for (const n of [/^Point of View/, /^Notes/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
    await closeSettings(page);
  }
  await handEdit(page, h, "Tl", [
    ["Dawn", { storyDate: "2026-01-05T08:00", storyDuration: 120, pov: "Mara", notes: "Opening scene notes" }],
    ["Midday", { storyDate: "2026-01-05T12:00", storyDuration: 30, pov: "Elena", status: "In review" }],
    ["Midday Two", { storyDate: "2026-01-05T12:10", storyDuration: 30 }],
    ["Spring", { storyDate: "2026-03-01", pov: "Mara" }],
    ["Late", { storyDate: "2026-09-01T09:30", pov: "Mara" }],
    ["Long", { storyDate: "2026-02-01", storyDuration: 27360 }],
  ]);
  await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  await step("T-01 placement", async () => {
    say("T-01 timeline text: " + J(await tlText(page)));
    const ci = await chipsInfo(page); const ti = await trackInfo(page);
    say("T-01/T-11/T-24 chips: " + J(ci) + " ; track: left=" + ti.trackLeft + " width=" + ti.trackWidth + " ; fractions of track: " + J(ci.map((c) => `${c.text || "(pin)"}@${((c.x - ti.trackLeft) / ti.trackWidth).toFixed(3)}..${((c.x + c.w - ti.trackLeft) / ti.trackWidth).toFixed(3)}`)));
    say("T-26 ticks at 200%: " + J(ti.ticks));
    say("T-33 scrollable: scrollWidth=" + ti.scrollW + " clientWidth=" + ti.clientW + " min-width style=" + ti.minWidth);
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-testid=timeline-axis] ~ div")].map((r) => { const cs = getComputedStyle(r); const rr = r.getBoundingClientRect(); return `${r.innerText.replace(/\n+/g, " / ").slice(0, 40)}|h=${Math.round(rr.height)}|borderBottom=${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}|bg=${cs.backgroundColor}`; }));
    say("T-18/T-29/T-30/T-53 rows: " + J(rows));
  });
  await step("T-12 zoom", async () => {
    const seq = [];
    seq.push("start " + await zoomLabel(page));
    for (let i = 0; i < 22; i++) { const b = page.locator("button[aria-label='Zoom in']"); const dis = await b.isDisabled(); if (dis) { seq.push("zoom in disabled at " + await zoomLabel(page)); break; } await b.click(); await page.waitForTimeout(120); seq.push(await zoomLabel(page)); }
    say("T-27 zoom in presses: " + J(seq));
    say("T-39 at max zoom: zoom-in disabled=" + await page.locator("button[aria-label='Zoom in']").isDisabled() + " attrs=" + J(await page.locator("button[aria-label='Zoom in']").evaluate((e) => ({ opacity: getComputedStyle(e).opacity, disabled: e.disabled, ariaDisabled: e.getAttribute("aria-disabled"), cls: e.className }))) + " zoom-out disabled=" + await page.locator("button[aria-label='Zoom out']").isDisabled());
    const ti = await trackInfo(page);
    say("T-25/T-26 at max zoom: min-width=" + ti.minWidth + " scrollWidth=" + ti.scrollW + " tick count=" + ti.ticks.length + " labels=" + J(ti.ticks.map((t) => t.text)));
    const seq2 = [];
    for (let i = 0; i < 30; i++) { const b = page.locator("button[aria-label='Zoom out']"); if (await b.isDisabled()) { seq2.push("zoom out disabled at " + await zoomLabel(page)); break; } await b.click(); await page.waitForTimeout(120); seq2.push(await zoomLabel(page)); }
    say("T-27 zoom out presses: " + J(seq2));
    const t2 = await trackInfo(page);
    say("T-39 at min zoom: zoom-out disabled=" + await page.locator("button[aria-label='Zoom out']").isDisabled() + " opacity=" + await page.locator("button[aria-label='Zoom out']").evaluate((e) => getComputedStyle(e).opacity) + " min-width=" + t2.minWidth + " scrollWidth=" + t2.scrollW + " clientWidth=" + t2.clientW + " ticks=" + t2.ticks.length);
    say("T-13 chips at min zoom: " + J(await chipsInfo(page)));
  });
  await step("T-25 per zoom", async () => {
    const out = [];
    for (let k = 0; k < 19; k++) {
      const ti = await trackInfo(page); const ci = await chipsInfo(page);
      out.push(`${await zoomLabel(page)}: trackW=${ti.trackWidth} scrollW=${ti.scrollW} ticks=${ti.ticks.length} sampleLabels=${J(ti.ticks.slice(0, 2).map((t) => t.text))} chips=${J(ci.map((c) => `${c.text || "pin"}:${c.w}x${c.h}@y${c.y}`))}`);
      const b = page.locator("button[aria-label='Zoom in']"); if (await b.isDisabled()) break; await b.click(); await page.waitForTimeout(250);
    }
    say("T-25/T-26/T-13/T-31/T-44 per zoom level:\n" + out.join("\n"));
  });
  await step("T-12 wheel", async () => {
    const box = await page.locator("[data-testid=timeline-axis]").boundingBox();
    await page.mouse.move(box.x + 300, box.y + 120);
    const l0 = await zoomLabel(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control"); await tick(page, 600);
    const l1 = await zoomLabel(page);
    await page.keyboard.down("Meta"); await page.mouse.wheel(0, -300); await page.keyboard.up("Meta"); await tick(page, 600);
    const l2 = await zoomLabel(page);
    await page.mouse.wheel(0, -300); await tick(page, 600); const l3 = await zoomLabel(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, 300); await page.keyboard.up("Control"); await tick(page, 600); const l4 = await zoomLabel(page);
    say(`T-12 zoom label: start ${l0}; after Ctrl+scroll up ${l1}; after Cmd+scroll up ${l2}; after plain scroll up ${l3}; after Ctrl+scroll down ${l4}; platform=${await page.evaluate(() => navigator.platform)}`);
  });
  await step("T-06/T-08 live", async () => {
    await treeClick(page, "Undated");
    say("T-08 before: scene count text=" + J((await tlText(page)).filter((t) => /SCENE/i.test(t))));
    await page.fill("input[aria-label=story-date-input]", "2026-02-15"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 2000);
    await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 1200);
    say("T-06/T-08 after setting Undated's Story Date in the sidebar: " + J((await tlText(page)).filter((t) => /SCENE|Undated/i.test(t))) + " chips=" + J((await chipsInfo(page)).map((c) => c.text || "pin")));
  });
  await step("T-04 off", async () => {
    await openSettings(page, "Metadata");
    const cb = page.getByRole("checkbox", { name: /^Timeline/ }).first();
    await cb.click(); await tick(page, 1500);
    const state = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input[type=checkbox]")].map((c) => `${c.closest("label")?.innerText.replace(/\n+/g, " / ").slice(0, 24)}=${c.checked}`));
    await closeSettings(page);
    say("T-04 after unchecking built-in feature Timeline: checkboxes=" + J(state) + " tabs=" + J((await tabs(page)).map((t) => t.text + ":" + (t.disabled ? "disabled" : "on"))));
  });
});
