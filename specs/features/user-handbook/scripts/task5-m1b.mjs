// Task 5, web build: story/metadata.md rows M-14..M-16 (POV, story dates, Timeline), M-21/M-22/M-25 (custom field types, folder scope, default visibility).
// Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, createNode, treeClick, sidecarByName, projectJson, projectDir, expandAll } from "./task5-lib.mjs";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
const reopen = async (page, proj, doc) => { await page.reload(); await tick(page, 2000); await page.click(`button[aria-label="Open ${proj}"]`); await tick(page, 2000); await treeClick(page, doc); };
await withWeb("t5-m1b", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Meta Two", "Scene One");
  await createNode(page, "Scene Two", "text");
  await createNode(page, "Characters", "folder");
  await createNode(page, "Places", "folder");
  await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Meta Two"]'); await tick(page, 2000);
  await expandAll(page);
  await createNode(page, "Elena", "text", "Characters");
  await createNode(page, "Mara", "text", "Characters");
  await createNode(page, "Paris", "text", "Places");
  await expandAll(page);
  say(`tree text: ${J((await bodyText(page)).split("\n").slice(3, 20))}`);

  await step("M-14/15/16 timeline", async () => {
    await openSettings(page, "Metadata");
    await page.getByRole("checkbox", { name: /^Timeline/ }).first().click(); await tick(page, 1200);
    await page.getByRole("checkbox", { name: /Point of View/ }).click(); await tick(page, 1200);
    await closeSettings(page);
    await openSettings(page, "Timeline");
    await page.getByRole("checkbox", { name: /Enable Timeline view/ }).click(); await tick(page, 1500);
    await closeSettings(page);
    await treeClick(page, "Scene One");
    say(`M-15 sidebar with Timeline and POV on: ${J(await sidebarText(page))}`);
    say(`M-15 manager groups: ${J(await (async () => { await openSettings(page, "Metadata"); const t = await dialogText(page); await closeSettings(page); return t.slice(t.indexOf("DOCUMENT\n")).split("\n").filter((l) => /^(DOCUMENT|TIMELINE|Story Date|Duration|Story End Date|Point of View|Status)/.test(l)); })())}`);
    // Timeline view before any story date
    await page.click("button:has-text('TIMELINE'), [role=tab]:has-text('Timeline')");
    await tick(page, 1500);
    say(`M-16 Timeline view before any Story Date is set: ${J((await bodyText(page)).split("\n").slice(14, 40))}`);
    await page.click("[role=tab]:has-text('Edit'), button:has-text('EDIT')").catch(() => {});
    await tick(page, 800);
    await treeClick(page, "Scene One");
    // set POV and story date
    await page.fill("input[aria-label=pov-input]", "Mar"); await tick(page, 1000);
    say(`M-14 POV suggestions: ${J(await page.$$eval("[role=listbox] [role=option], [role=option]", (o) => o.map((x) => x.textContent)))}`);
    await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 2000);
    say(`M-14 sidecar userMetadata after choosing Mara: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    say(`M-15 story-date input type: ${J(await page.$$eval("input[aria-label=story-date-input], input[aria-label=story-date-input-time]", (o) => o.map((x) => x.type)))}`);
    await page.fill("input[aria-label=story-date-input]", "2026-01-05"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 2500);
    say(`M-15 sidecar userMetadata after Story Date: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    await treeClick(page, "Scene Two");
    await page.fill("input[aria-label=pov-input]", "Ele"); await tick(page, 1000);
    await page.locator("[role=option]:has-text('Elena')").first().click(); await tick(page, 2000);
    await page.fill("input[aria-label=story-date-input]", "2026-01-03"); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 2500);
    await page.fill("input[aria-label=story-duration-quantity]", "30"); await page.locator("input[aria-label=story-duration-quantity]").blur(); await tick(page, 2500);
    say(`M-15 Scene Two sidecar userMetadata: ${J(sidecarByName(h, "Scene Two").json.userMetadata)}; duration unit options: ${J(await page.$$eval("select[aria-label=story-duration-unit] option", (o) => o.map((x) => x.textContent)))}`);
    await page.click("[role=tab]:has-text('Timeline'), button:has-text('TIMELINE')"); await tick(page, 2500);
    say(`M-14/16 Timeline view after Story Dates: text=${J((await bodyText(page)).split("\n").slice(12, 50))}`);
    await page.evaluate(() => { const sc = [...document.querySelectorAll("*")].find((e) => e.scrollWidth > e.clientWidth && /scenes?/i.test(e.innerText || "") && e.clientWidth > 300); void sc; });
    const probe = () => page.evaluate(() => {
      const out = { legend: [], blocks: [] };
      for (const e of document.querySelectorAll("*")) {
        const t = (e.textContent || "").trim();
        if (e.children.length === 0 && /^(Elena|Mara)$/.test(t) && e.previousElementSibling) { const d = e.previousElementSibling; out.legend.push([t, getComputedStyle(d).backgroundColor]); }
        const r = e.getBoundingClientRect(); const bg = getComputedStyle(e).backgroundColor;
        if (e.children.length <= 1 && r.width > 8 && r.width < 80 && r.height > 15 && r.height < 60 && r.x > 380 && bg !== "rgba(0, 0, 0, 0)" && (e.getAttribute("title") || e.getAttribute("aria-label") || t)) out.blocks.push([(e.getAttribute("title") || e.getAttribute("aria-label") || t).slice(0, 60), bg, Math.round(r.x)]);
      }
      return out;
    });
    say(`M-14 Timeline legend dots and scene blocks (name, computed background, x): ${J(await probe())}`);
    const dots = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.width < 14 && Math.abs(r.width - r.height) < 1 && parseFloat(cs.borderRadius) >= r.width / 2 - 1 && cs.backgroundColor !== "rgba(0, 0, 0, 0)"; }).map((e) => [e.parentElement.innerText.trim().slice(0, 12), getComputedStyle(e).backgroundColor]));
    say(`M-14 Timeline legend: dot colors by POV name: ${J(dots)}`);
    const blocksWith = (color) => page.evaluate((c) => [...document.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).backgroundColor === c && r.height > 15 && r.width >= 2; }).map((e) => [Math.round(e.getBoundingClientRect().x), Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]), color);
    for (const [nm, col] of dots) {
      await page.click(`button:text-is('${nm.toUpperCase()}'), button:has-text('${nm.toUpperCase()}')`); await tick(page, 1200);
      say(`M-14 filter ${nm.toUpperCase()}: counter=${J((await bodyText(page)).split("\n").filter((l) => /SCENES?$/i.test(l)))}; elements taller than 15px with the ${nm} dot colour ${col} (x, width, height): ${J(await blocksWith(col))}`);
    }
    await page.click("button:has-text('ALL')"); await tick(page, 800);
    await page.click("button:has-text('ELENA')"); await tick(page, 1200);
    say(`M-14 after choosing the ELENA filter in the Timeline view: scene counter=${J((await bodyText(page)).split("\n").filter((l) => /SCENES?$/i.test(l)))}`);
    await page.click("button:has-text('ALL')"); await tick(page, 800);
    await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t5-m1b-timeline.png" });
  });

  await step("M-21 field types", async () => {
    await treeClick(page, "Scene One");
    // switch to edit view first
    await page.click("[role=tab]:has-text('Edit'), button:has-text('EDIT')").catch(() => {});
    await tick(page, 800);
    for (const [n, l, t] of [["ftext", "F Text", "Text"], ["fnum", "F Number", "Number"], ["fdate", "F Date", "Date"], ["fbool", "F Bool", "Boolean"], ["fsel", "F Select", "Select"], ["fmulti", "F Multi", "Multi"], ["fref", "F Ref", "Ref"], ["fmref", "F MultiRef", "Multi Ref"]]) await addSidebarField(page, n, l, t, "Document");
    await openSettings(page, "Metadata");
    await page.fill("textarea[aria-label='Options for F Select']", "Red\nGreen"); await page.locator("textarea[aria-label='Options for F Select']").blur(); await tick(page, 1500);
    await page.fill("textarea[aria-label='Options for F Multi']", "Alpha\nBeta\nGamma"); await page.locator("textarea[aria-label='Options for F Multi']").blur(); await tick(page, 1500);
    await closeSettings(page);
    say(`M-21 sidebar controls: ${J(await page.$$eval("input, select, textarea", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.type)).filter((s) => /f(text|num|date|bool|sel|multi|ref|mref)|multi-resource|story-date/.test(s))))}`);
    await page.fill("input[aria-label=ftext]", "hello"); await page.locator("input[aria-label=ftext]").blur(); await tick(page, 1500);
    await page.fill("input[aria-label=fnum]", "42"); await page.locator("input[aria-label=fnum]").blur(); await tick(page, 1500);
    await page.locator("input[aria-label=fbool]").click(); await tick(page, 1500);
    await page.selectOption("select[aria-label=fsel]", { label: "Green" }); await tick(page, 1500);
    say(`M-21 fmulti element: ${J(await page.$eval("select[aria-label=fmulti]", (s) => ({ multiple: s.multiple, options: [...s.options].map((o) => o.textContent) })))}`);
    await page.selectOption("select[aria-label=fmulti]", [{ label: "Alpha" }, { label: "Gamma" }]); await tick(page, 1500);
    say(`M-21 sidecar after text/number/bool/select/multi: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    // date field: second date control (the first is Story Date)
    const dateInputs = await page.$$eval("input[aria-label=story-date-input]", (o) => o.length);
    say(`M-21 number of date inputs in the sidebar (F Date in the Document group, Story Date in the Timeline group): ${dateInputs}; label text above the F Date input and above the Story Date input: ${J(await page.$$eval("input[aria-label=story-date-input]", (o) => o.map((x) => { let n = x.parentElement; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const l = [...n.querySelectorAll("label, span, div")].find((e) => e.children.length === 0 && /DATE|F Date/i.test(e.textContent)); if (l) return l.textContent.trim(); } return null; })))}`);
    await page.locator("input[aria-label=story-date-input]").nth(0).fill("2026-02-09"); await page.locator("input[aria-label=story-date-input]").nth(0).blur(); await tick(page, 2000);
    say(`M-21 sidecar after date: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    // ref field (single)
    await page.click("input[aria-label=fref]"); await page.keyboard.type("S", { delay: 100 }); await tick(page, 1200);
    say(`M-22 Ref field (no folder scope) suggestions for "S": ${J(await page.$$eval("li", (o) => o.map((x) => x.textContent).filter((t) => t.length < 40)))}`);
    await page.fill("input[aria-label=fref]", ""); await page.keyboard.type("Par", { delay: 100 }); await tick(page, 1200);
    await page.locator("li:has-text('Paris')").first().click(); await tick(page, 2000);
    await page.click("input[aria-label=multi-resource-ref-input]"); await page.keyboard.type("e", { delay: 100 }); await tick(page, 1200);
    say(`M-22 Multi Ref field, Folder scope "Any folder", suggestions for "e": ${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    await page.locator("[role=option]:has-text('Elena')").first().click(); await tick(page, 1500);
    await page.keyboard.type("Ma", { delay: 100 }); await tick(page, 1200);
    await page.locator("[role=option]:has-text('Mara')").first().click(); await tick(page, 2000);
    say(`M-21 sidecar after ref and multi-ref: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    await reopen(page, "Meta Two", "Scene One");
    say(`M-21 after reload: input values=${J(await page.$$eval("input, select", (o) => o.filter((x) => /f(text|num|date|bool|sel|multi|ref)|multi-resource/.test(x.getAttribute("aria-label") || "")).map((x) => (x.getAttribute("aria-label")) + "=" + (x.type === "checkbox" ? x.checked : x.multiple ? [...x.selectedOptions].map((o) => o.textContent).join("+") : x.value))))}; sidebar text tail=${J((await sidebarText(page)).split("\n").filter((l) => /Paris|Elena|Mara/.test(l)))}`);
  });

  await step("M-22 folder scope", async () => {
    await openSettings(page, "Metadata");
    say(`M-62 the word "provider" in the Project Settings dialog text: ${J((await dialogText(page)).toLowerCase().includes("provider"))}; in the page body: ${J((await bodyText(page)).toLowerCase().includes("provider"))}`);
    say(`M-22 Folder scope controls in manager (Ref and Multi Ref fields): ${J(await page.$$eval("[aria-label^='Ref folder for'], [aria-label^='Include subfolders']", (o) => o.map((x) => x.getAttribute("aria-label") + ":" + x.tagName)))}; manager text near Folder scope: ${J((await dialogText(page)).split("\n").filter((l) => /Folder scope|Any folder|Max selections|Include subfolders/.test(l)))}`);
    await page.click("[aria-label='Ref folder for F MultiRef']"); await tick(page, 800);
    say(`M-22 picker popover right after opening: ${J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].filter((b) => b.closest("[role=dialog]").innerText.startsWith("Any folder")).map((b) => (b.getAttribute("aria-label") || b.innerText.trim()))))}`);
    const pop = () => [...document.querySelectorAll("[role=dialog]")].find((x) => x.innerText.startsWith("Any folder"));
    await page.evaluate(() => { const p = [...document.querySelectorAll("[role=dialog]")].find((x) => x.innerText.startsWith("Any folder")); p.querySelector("button[aria-label='Expand Workspace']").click(); }); await tick(page, 600);
    say(`M-22 picker entries after expanding Workspace: ${J(await page.evaluate(() => { const e = [...document.querySelectorAll("[role=dialog]")].find((x) => x.innerText.startsWith("Any folder")); return [...e.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || b.innerText.trim())); }))}`);
    await page.evaluate(() => { const p = [...document.querySelectorAll("[role=dialog]")].find((x) => x.innerText.startsWith("Any folder")); [...p.querySelectorAll("button")].find((x) => x.innerText.trim() === "Characters").click(); }); await tick(page, 1500);
    say(`M-22 after choosing Characters: button text=${J(await page.$eval("[aria-label='Ref folder for F MultiRef']", (e) => e.innerText))}; include-subfolders checkbox present=${await page.locator("[aria-label='Include subfolders for F MultiRef']").count()}`);
    await closeSettings(page);
    await reopen(page, "Meta Two", "Scene Two");
    await page.click("input[aria-label=multi-resource-ref-input]"); await page.keyboard.type("a", { delay: 100 }); await tick(page, 1200);
    say(`M-22 Multi Ref field scoped to Characters, suggestions for "a" (Scene Two selected; Paris and Scene One contain an "a"): ${J(await page.$$eval("[role=option]", (o) => o.map((x) => x.textContent)))}`);
    const saved = (await import("./task5-lib.mjs")).projectJson(h);
    void saved;
  });
});
