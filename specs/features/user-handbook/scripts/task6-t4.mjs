// Task 6, web build: views/timeline.md part 2 (chips, tooltip, legend, zoom input). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, reloadProject, handEdit, zoomLabel, chipsInfo, tabs, tick, treeClick, openSettings, closeSettings, dialogText, sidecars, projectDir } from "./task6-tlib.mjs";
const tlText = async (page) => { const l = (await bodyText(page)).split("\n"); return l.slice(l.indexOf("⌘K") + 1, l.indexOf("METADATA")); };
const chipLoc = (page, name) => page.locator(`.timeline-chip[aria-label="${name}"]`).first();
const cs = (page, loc, props) => loc.evaluate((e, p) => { const c = getComputedStyle(e); return Object.fromEntries(p.map((k) => [k, c[k]])); }, props);
const tipInfo = (page) => page.evaluate(() => [...document.querySelectorAll("[role=tooltip], [class*=tooltip], [class*=Tooltip], [data-radix-popper-content-wrapper]")].filter((e) => e.textContent.trim() && !/Turn (it|them) on/.test(e.textContent)).map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className.toString().slice(0, 60), text: e.innerText.replace(/\n+/g, " | "), html: e.innerHTML.replace(/<svg.*?<\/svg>/g, "").slice(0, 700), opacity: c.opacity, bg: c.backgroundColor, z: c.zIndex, pos: c.position, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; }));
await withWeb("t6-t4", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Tl", "Blank");
  await step("User Preferences item", async () => {
    await page.click('button[aria-label="Open project settings menu"]'); await page.locator("text=User Preferences").first().click(); await page.waitForTimeout(1200);
    say("User Preferences dialog text: " + J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : "(no dialog)"; })));
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  });
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1000); await page.click('button[aria-label="Open Tl"]'); await page.waitForTimeout(2000);
  await createNode(page, "Mara", "text"); await createNode(page, "Elena", "text");
  await createNode(page, "Act One", "folder", "Workspace"); await createNode(page, "Act Two", "folder", "Workspace");
  await reloadProject(page, "Tl");
  for (const n of ["Dawn", "Midday", "Midday Two"]) await createNode(page, n, "text", "Act One");
  for (const n of ["Spring", "Late"]) await createNode(page, n, "text", "Act Two");
  await createNode(page, "Long", "text", "Workspace"); await createNode(page, "Undated", "text", "Workspace");
  await openSettings(page, "Timeline"); await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500); await closeSettings(page);
  await openSettings(page, "Metadata");
  for (const n of [/^Point of View/, /^Notes/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
  await closeSettings(page);
  const pj = (await import("node:path")).join(projectDir(h), "project.json"); const fs = await import("node:fs"); const j = JSON.parse(fs.readFileSync(pj, "utf8")); j.config.statuses = ["Draft", "In review", "Published"]; fs.writeFileSync(pj, JSON.stringify(j, null, 2));
  const LONGNOTE = "First sentence of the long note. " + "More words follow here to make the note long. ".repeat(8);
  await handEdit(page, h, "Tl", [
    ["Dawn", { storyDate: "2026-01-05T08:00", storyDuration: 120, pov: "Mara", notes: LONGNOTE }],
    ["Midday", { storyDate: "2026-01-05T12:00", storyDuration: 30, pov: "Elena", status: "In review" }],
    ["Midday Two", { storyDate: "2026-01-05T12:10", storyDuration: 30 }],
    ["Spring", { storyDate: "2026-03-01", pov: "Mara" }],
    ["Late", { storyDate: "2026-09-01T09:30", pov: "Mara" }],
    ["Long", { storyDate: "2026-02-01", storyDuration: 27360, pov: "Elena" }],
  ]);
  await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2500);
  await step("T-32 title bar", async () => {
    const t = await tlText(page);
    say("T-32 first lines of the Timeline view: " + J(t.slice(0, 14)) + " ; contains 'Timeline —': " + J(t.some((x) => /Timeline\s*[—–-]/i.test(x))));
    say("T-32 timeline-root first child classes: " + J(await page.evaluate(() => [...document.querySelector(".timeline-root").children].map((c) => `${c.className}|${c.innerText.slice(0, 40).replace(/\n/g, "/")}`))));
  });
  await step("T-12 wheel (from 200%)", async () => {
    const box = await page.locator("[data-testid=timeline-axis]").boundingBox();
    await page.mouse.move(box.x + 300, box.y + 120);
    const l0 = await zoomLabel(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control"); await tick(page, 700); const l1 = await zoomLabel(page);
    await page.keyboard.down("Meta"); await page.mouse.wheel(0, -300); await page.keyboard.up("Meta"); await tick(page, 700); const l2 = await zoomLabel(page);
    await page.mouse.wheel(0, -300); await tick(page, 700); const l3 = await zoomLabel(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, 300); await page.keyboard.up("Control"); await tick(page, 700); const l4 = await zoomLabel(page);
    await page.keyboard.down("Meta"); await page.mouse.wheel(0, 300); await page.keyboard.up("Meta"); await tick(page, 700); const l5 = await zoomLabel(page);
    say(`T-12 zoom label: start ${l0}; Ctrl+wheel up ${l1}; Meta+wheel up ${l2}; plain wheel up ${l3}; Ctrl+wheel down ${l4}; Meta+wheel down ${l5}; platform=${await page.evaluate(() => navigator.platform)}`);
    while ((await zoomLabel(page)) !== "200%") { const b = page.locator((await zoomLabel(page)) < "200%" ? "button[aria-label='Zoom in']" : "button[aria-label='Zoom out']"); await b.click(); await tick(page, 300); if (Math.random() > 2) break; }
    say("back at " + await zoomLabel(page));
  });
  await step("T-39 dim", async () => {
    const out = page.locator("button[aria-label='Zoom out']"), inn = page.locator("button[aria-label='Zoom in']");
    const enabled = await cs(page, inn, ["color", "opacity", "cursor", "backgroundColor"]);
    while (!(await out.isDisabled())) { await out.click(); await page.waitForTimeout(150); }
    say("T-39 enabled zoom-in: " + J(enabled) + " ; disabled zoom-out at " + await zoomLabel(page) + ": " + J(await cs(page, out, ["color", "opacity", "cursor", "backgroundColor"])));
    while ((await zoomLabel(page)) !== "200%") { await inn.click(); await page.waitForTimeout(150); }
  });
  await step("T-16/T-17/T-34/T-35 legend and colors", async () => {
    say("T-17 legend: " + J(await page.evaluate(() => { const l = document.querySelector(".timeline-legend"); return l ? { text: l.innerText.replace(/\n+/g, " | "), html: l.innerHTML.replace(/<svg.*?<\/svg>/g, "").slice(0, 1400), pos: JSON.stringify(l.getBoundingClientRect().toJSON()), axisTop: JSON.stringify(document.querySelector("[data-testid=timeline-axis]").getBoundingClientRect().toJSON()) } : null; })));
    say("T-35 legend entries styles: " + J(await page.evaluate(() => [...document.querySelectorAll(".timeline-legend-entry")].map((e) => { const sw = e.firstElementChild; const sc = getComputedStyle(sw); const ec = getComputedStyle(e); return `${e.innerText.trim()}|swatch ${sc.width}x${sc.height} radius=${sc.borderRadius} bg=${sc.backgroundColor} img=${sc.backgroundImage.slice(0, 40)}|text font=${ec.fontFamily.slice(0, 40)} color=${ec.color}`; }))));
    say("T-16/T-48 chip colors: " + J(await page.evaluate(() => [...document.querySelectorAll(".timeline-chip")].map((e) => { const c = getComputedStyle(e); return `${e.getAttribute("aria-label")}|bg=${c.backgroundColor}|opacity=${c.opacity}|radius=${c.borderRadius}|border=${c.borderTopWidth} ${c.borderTopColor}|bgimg=${c.backgroundImage.slice(0, 40)}`; }))));
  });
  await step("T-49 hover/focus", async () => {
    const c = chipLoc(page, "Long");
    const before = await cs(page, c, ["backgroundColor", "filter", "opacity", "outlineStyle", "outlineWidth", "boxShadow", "transform"]);
    await c.hover(); await page.waitForTimeout(500);
    const hov = await cs(page, c, ["backgroundColor", "filter", "opacity", "outlineStyle", "outlineWidth", "boxShadow", "transform"]);
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
    await c.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await page.waitForTimeout(300);
    const foc = await cs(page, c, ["backgroundColor", "filter", "outlineStyle", "outlineWidth", "outlineColor", "boxShadow"]);
    say(`T-49 Long chip: normal=${J(before)} hover=${J(hov)} keyboard focus (Tab round trip)=${J(foc)} focus-visible=${await c.evaluate((e) => e.matches(":focus-visible"))}`);
  });
  await step("T-50 tooltips", async () => {
    say("chips now: " + J((await chipsInfo(page)).map((c) => `${c.label}|${c.text}|${c.w}x${c.h}@${c.x},${c.y}`)) + " zoom " + await zoomLabel(page) + " tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)));
    for (const n of ["Dawn", "Midday", "Midday Two", "Spring", "Long", "Late"]) {
      if (!(await chipLoc(page, n).count())) { say(`T-50 no chip with aria-label ${n}; labels present: ${J((await chipsInfo(page)).map((c) => c.label))}`); continue; }
      await page.mouse.move(5, 5); await page.waitForTimeout(500);
      const c = chipLoc(page, n); await c.scrollIntoViewIfNeeded(); await c.hover(); await page.waitForTimeout(900);
      const t = await tipInfo(page); const r = await c.evaluate((e) => { const x = e.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; });
      say(`T-50 tooltip for ${n}: chipRect=${J(r)} tips=${J(t.map((x) => ({ text: x.text, opacity: x.opacity, bg: x.bg, z: x.z, pos: x.pos, rect: x.rect })))}`);
      if (n === "Dawn") say("T-50 Dawn tooltip html: " + J(t.map((x) => x.html)));
      if (t.length) { const at = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className.toString().slice(0, 40)}` : null; }, [t[0].rect[0] + 5, t[0].rect[1] + 5]); say(`T-52 element at the tooltip's corner for ${n}: ${at}`); }
    }
  });
  await step("T-14 click chip", async () => {
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
    await chipLoc(page, "Midday").click(); await tick(page, 1500);
    say("T-14 editor present (.ProseMirror count)=" + await page.locator(".ProseMirror").count() + " ; timeline-root present=" + await page.locator(".timeline-root").count());
    say("T-14 after clicking the Midday chip: selected tab=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + " ; sidebar heading=" + J((await bodyText(page)).split("\nMETADATA\n")[1]?.split("\n")[0]) + " ; editor title line=" + J((await bodyText(page)).split("\n").slice(14, 18)));
    await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 1500);
  });
  await step("T-40 tick geometry", async () => {
    say("T-40 tick label vs tick line: " + J(await page.evaluate(() => { const ax = document.querySelector("[data-testid=timeline-axis]"); const t = ax.children[1].children[1]; const sp = t.querySelectorAll("span"); const a = sp[0].getBoundingClientRect(), b = sp[1].getBoundingClientRect(); return { label: sp[0].textContent, labelTop: Math.round(a.top), labelBottom: Math.round(a.bottom), lineTop: Math.round(b.top), lineBottom: Math.round(b.bottom), lineHeight: Math.round(b.height), axisTop: Math.round(ax.getBoundingClientRect().top), axisBottom: Math.round(ax.getBoundingClientRect().bottom) }; })));
  });
  await step("T-36 single POV", async () => {
    await handEdit(page, h, "Tl", [["Midday", { pov: "Mara" }], ["Long", { pov: "Mara" }]]);
    await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2000);
    say("T-36 every scene with a POV is Mara, Midday Two has none: legend=" + J(await page.evaluate(() => { const l = document.querySelector(".timeline-legend"); return l ? l.innerText.replace(/\n+/g, " | ") : null; })) + " ; pills=" + J(await page.evaluate(() => [...document.querySelectorAll(".timeline-pov-pill")].map((e) => e.innerText))));
    await handEdit(page, h, "Tl", [["Midday Two", { pov: "Mara" }]]);
    await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2000);
    say("T-36 every scene has the same POV (Mara) and all of them have one: legend=" + J(await page.evaluate(() => { const l = document.querySelector(".timeline-legend"); return l ? l.innerText.replace(/\n+/g, " | ") : null; })) + " ; pills=" + J(await page.evaluate(() => [...document.querySelectorAll(".timeline-pov-pill")].map((e) => e.innerText))));
    await handEdit(page, h, "Tl", [["Midday Two", { pov: null }]]);
    await handEdit(page, h, "Tl", [["Dawn", { pov: null }], ["Midday", { pov: null }], ["Spring", { pov: null }], ["Late", { pov: null }], ["Long", { pov: null }]]);
    await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2000);
    say("T-36 no scene has a POV: legend=" + J(await page.evaluate(() => { const l = document.querySelector(".timeline-legend"); return l ? l.innerText.replace(/\n+/g, " | ") : null; })) + " ; pills=" + J(await page.evaluate(() => [...document.querySelectorAll(".timeline-pov-pill")].map((e) => e.innerText))));
    await handEdit(page, h, "Tl", [["Dawn", { pov: "Mara" }], ["Midday", { pov: "Elena" }]]);
    await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2000);
    say("T-17 two POVs again (Mara, Elena) and scenes with none: legend=" + J(await page.evaluate(() => { const l = document.querySelector(".timeline-legend"); return l ? l.innerText.replace(/\n+/g, " | ") : null; })));
  });
  await step("T-19 folder-less", async () => {
    const dir = projectDir(h); const s = sidecars(h).find((x) => x.json.name === "Long"); const f = (await import("node:path")).join(dir, "meta", s.file);
    const o = JSON.parse(fs.readFileSync(f, "utf8")); say("Long folderId before: " + J(o.folderId)); o.folderId = null; delete o.folderId; fs.writeFileSync(f, JSON.stringify(o, null, 2));
    await reloadProject(page, "Tl"); await treeClick(page, "Dawn"); await page.click('[role=tab]:has-text("Timeline")'); await tick(page, 2000);
    say("T-19 Long without a folderId: timeline row texts=" + J((await tlText(page)).filter((x) => /scene|ACT|WORK|UNGROUP|Long|NO FOLDER/i.test(x))));
    say("T-19 chips: " + J((await chipsInfo(page)).map((c) => c.label)) + " rows: " + J(await page.evaluate(() => [...document.querySelectorAll("[data-testid=timeline-axis] ~ div")].map((r) => r.innerText.replace(/\n+/g, " / ").slice(0, 40)))));
    say("T-19 tree after: " + J((await bodyText(page)).split("\n").slice(3, 14)));
  });
});
