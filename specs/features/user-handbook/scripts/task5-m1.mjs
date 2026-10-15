// Task 5, web build: story/metadata.md rows M-01..M-25 (sidebar, system vs user metadata, built-in fields, custom fields, providers).
// Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, createNode, treeClick, sidecars, sidecarByName, projectJson, projectDir, walk, pm } from "./task5-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
await withWeb("t5-m1", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Meta Test", "Scene One");
  await createNode(page, "Scene Two", "text");
  await treeClick(page, "Scene One");

  await step("M-01/M-02/M-10/M-17", async () => {
    const r = await page.evaluate(() => { const el = [...document.querySelectorAll("*")].find((e) => e.innerText && e.innerText.trim().startsWith("METADATA") && e.getBoundingClientRect().width < 600); const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), viewport: innerWidth }; });
    say(`M-02 sidebar box: ${J(r)} (resource selected: Scene One). Text: ${J(await sidebarText(page))}`);
    say(`M-17 form controls in the sidebar of a new Blank project: ${J(await page.$$eval("select, textarea, input:not([aria-label=resource-search]):not([aria-label='Font Size']):not([aria-label='Line Height'])", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.type))))}`);
  });

  await step("M-04/M-05/M-06", async () => {
    const sc = sidecarByName(h, "Scene One");
    say(`M-04 sidecar keys: ${J(Object.keys(sc.json))}; sidecar: ${J(sc.json)}`);
    const side = await sidebarText(page);
    say(`M-04 does the sidebar text contain the resource id, createdAt date, file location or a word count line? id:${side.includes(sc.json.id)} createdAt:${side.includes(sc.json.createdAt.slice(0, 10))} slug/path:${/scene-one|resources\//.test(side)} wordcount-line:${/word count:|words:/i.test(side.replace(/WORD COUNT GOAL/gi, ""))}`);
    const f = (await bodyText(page)).split("\n").filter((l) => /^Words:/.test(l));
    say(`M-04 footer: ${J(f)}`);
    await pm(page).click(); await page.keyboard.type("one two three"); await tick(page, 5500);
    const sc2 = sidecarByName(h, "Scene One");
    say(`M-04 after typing 3 words: sidecar wordCount=${sc2.json.wordCount} updatedAt=${sc2.json.updatedAt}; footer ${J((await bodyText(page)).split("\n").filter((l) => /^Words:/.test(l)))}`);
    say(`M-05 sidebar inputs that edit id/createdAt/location/wordCount: none among ${J(await page.$$eval("[aria-label=status], [aria-label=Subtype], [aria-label=word-count-goal-input]", (o) => o.map((x) => x.getAttribute("aria-label"))))}`);
  });

  await step("M-11 statuses from project.json", async () => {
    // placed after the main M-11 step below
  });
  await step("M-11 statuses", async () => {
    say(`M-11 project.json config.statuses=${J(projectJson(h).config.statuses)}; sidebar Status select options=${J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent)))}; current value=${J(await page.$eval("select[aria-label=status]", (s) => s.value))}`);
    await page.selectOption("select[aria-label=status]", { label: "In review" }); await tick(page, 2500);
    say(`M-11 after choosing In review: sidecar userMetadata=${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    const pd = projectDir(h);
    say(`M-11 files under meta/: ${J(walk(path.join(pd, "meta")).map((p) => p.replace(pd, "")).slice(0, 20))}`);
    await openSettings(page, "Metadata");
    say(`M-11 manager Status options textarea: ${J(await page.$eval("textarea[aria-label='Options for Status']", (t) => t.value))}`);
    await page.fill("textarea[aria-label='Options for Status']", "Draft\nIn review\nPublished\nFinal"); await page.locator("textarea[aria-label='Options for Status']").blur(); await tick(page, 2000);
    await closeSettings(page);
    say(`M-11 after adding Final in the manager: sidebar Status options=${J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent)))}; project.json config.statuses=${J(projectJson(h).config.statuses)}`);
    // experiment: write config.statuses into the throwaway project.json, then reload
    const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config.statuses = ["Alpha", "Beta"]; writeFileSync(pj, JSON.stringify(j, null, 2));
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Meta Test"]'); await tick(page, 2000); await treeClick(page, "Scene One");
    say(`M-11 after setting config.statuses=["Alpha","Beta"] in project.json by hand and reloading: sidebar Status options=${J(await page.$$eval("select[aria-label=status] option", (o) => o.map((x) => x.textContent)))}; current value=${J(await page.$eval("select[aria-label=status]", (s) => s.value))}`);
    j.config.statuses = []; writeFileSync(pj, JSON.stringify(j, null, 2));
  });

  await step("M-12/M-13/M-18/M-19", async () => {
    await openSettings(page, "Metadata");
    say(`M-18 toggles (dialog Metadata tab): ${J(await page.$$eval("input[type=checkbox]", (c) => c.map((x) => (x.closest("label")?.innerText || "?").replace(/\n/g, " ") + "=" + x.checked)))}`);
    await page.getByRole("checkbox", { name: /Synopsis/ }).click(); await tick(page);
    await page.getByRole("checkbox", { name: /Notes/ }).click(); await tick(page);
    await closeSettings(page);
    say(`M-12/13 sidebar after turning Synopsis and Notes on: ${J(await sidebarText(page))}`);
    say(`M-12/13 controls: ${J(await page.$$eval("textarea, input[type=text]", (o) => o.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.placeholder || x.type))))}`);
    const syn = page.locator("textarea").first();
    // fill Synopsis and Notes
    const areas = page.locator("textarea[aria-label=synopsis], textarea[aria-label=notes]");
    say(`M-12 textareas in sidebar: ${await areas.count()}`);
    await page.locator("textarea[aria-label=synopsis]").fill("A short summary of scene one."); await page.locator("textarea[aria-label=synopsis]").blur(); await tick(page, 2500);
    await page.locator("textarea[aria-label=notes]").fill("Remember to add the storm."); await page.locator("textarea[aria-label=notes]").blur(); await tick(page, 2500);
    say(`M-12/13 sidecar userMetadata after typing: ${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    // M-19: hide and show again
    await openSettings(page, "Metadata");
    await page.getByRole("checkbox", { name: /Synopsis/ }).click(); await tick(page); await closeSettings(page);
    say(`M-19 Synopsis switched off: sidebar=${J((await sidebarText(page)).includes("SYNOPSIS"))}; sidecar userMetadata=${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    await openSettings(page, "Metadata");
    await page.getByRole("checkbox", { name: /Synopsis/ }).click(); await tick(page); await closeSettings(page);
    const v = await page.$$eval("textarea", (o) => o.map((x) => x.value));
    say(`M-19 Synopsis switched back on: sidebar textarea values=${J(v)}`);
  });

  await step("M-20 rename/remove built-ins", async () => {
    await openSettings(page, "Metadata");
    const labels = await page.$$eval("[aria-label^='Remove '], [aria-label^='Edit label for '], [aria-label^='Rename key of ']", (o) => o.map((x) => x.getAttribute("aria-label")));
    say(`M-20 manager controls per field: ${J(labels)}`);
    say(`M-20 label buttons: ${J(await page.$$eval("button[aria-label^='Rename ']", (o) => o.map((x) => x.getAttribute("aria-label") + (x.disabled ? " [disabled]" : ""))))}; locked-field label buttons: ${J(await page.$$eval("[role=dialog] button[disabled], dialog button[disabled]", (o) => o.map((x) => x.getAttribute("aria-label")).filter(Boolean)))}`);
    await page.click("button[aria-label='Rename Synopsis']");
    const lab = page.locator("[aria-label='Edit label for synopsis']");
    await lab.fill("Summary"); await lab.press("Enter"); await tick(page, 2000);
    await closeSettings(page);
    say(`M-20 after renaming Synopsis label to Summary: sidebar=${J((await sidebarText(page)).split("\n").filter((l) => /SUMMARY|SYNOPSIS/i.test(l)))}`);
    await openSettings(page, "Metadata");
    const rm = page.locator("[aria-label='Remove Notes']");
    say(`M-20 Remove Notes button present: ${await rm.count()}; Remove Status present: ${await page.locator("[aria-label='Remove Status']").count()}; Remove Point of View present: ${await page.locator("[aria-label='Remove Point of View']").count()}; Remove Summary: ${await page.locator("[aria-label='Remove Summary']").count()}`);
    if (await rm.count()) {
      await rm.click(); await tick(page, 1500);
      say(`M-20 Remove Notes dialog: ${J(await page.evaluate(() => { const ds = [...document.querySelectorAll("[role=dialog], dialog, [role=alertdialog]")]; const d = ds.find((x) => x.innerText.includes("Remove field")); return d ? { text: d.innerText, buttons: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()) } : "none"; }))}`);
      await page.locator("[role=alertdialog] input[type=radio], dialog input[type=radio], [role=dialog] input[type=radio]").nth(1).check();
      say(`M-20 confirm button labels after choosing Clear: ${J(await page.$$eval("[role=alertdialog] button, [role=dialog] button", (b) => b.map((x) => x.textContent.trim()).filter((t) => /Cancel|Clear|Deprecate|Remove/.test(t))))}`);
      await page.locator("button:text-is('Clear'), button:text-is('Clear values'), button:text-is('Remove')").last().click(); await tick(page, 2000);
      say(`M-20 after clicking Remove Notes then Clear: dialog still lists a Notes field=${J((await dialogText(page)).includes("\nnotes\n"))}; dialog lists label "Summary"=${J((await dialogText(page)).includes("Summary"))}; any extra dialog/confirm text=${J(await page.$$eval("[role=alertdialog], [role=dialog] h2, [role=dialog] h3", (o) => o.map((x) => x.textContent)))}`);
    }
    await closeSettings(page);
    say(`M-20 sidebar after rename (Summary) and remove (Notes): ${J((await sidebarText(page)).split("\n").filter((l) => /SUMMARY|SYNOPSIS|NOTES/i.test(l)))}; sidecar userMetadata=${J(sidecarByName(h, "Scene One").json.userMetadata)}`);
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Meta Test"]'); await tick(page, 2000); await treeClick(page, "Scene One");
    say(`M-20 after reload, sidebar lines: ${J((await sidebarText(page)).split("\n").filter((l) => /SUMMARY|SYNOPSIS|NOTES/i.test(l)))}`);
    await openSettings(page, "Metadata");
    say(`M-20 after reload, Synopsis toggle checked=${await page.getByRole("checkbox", { name: /Synopsis/ }).isChecked()}, Notes toggle checked=${await page.getByRole("checkbox", { name: /Notes/ }).isChecked()}; toggles listed: ${J(await page.$$eval("input[type=checkbox]", (c) => c.map((x) => (x.closest("label")?.innerText || "?").replace(/\n/g, " "))))}`);
    await page.getByRole("checkbox", { name: /Notes/ }).click(); await tick(page, 1500);
    say(`M-20 Notes switched on again after removal: manager lists notes field=${J((await dialogText(page)).includes("\nnotes\n"))}`);
    await closeSettings(page);
    say(`M-20 sidebar after switching Notes on again: ${J((await sidebarText(page)).split("\n").filter((l) => /SUMMARY|SYNOPSIS|NOTES/i.test(l)))}; textarea values=${J(await page.$$eval("textarea", (o) => o.map((x) => x.value)))}`);
  });

  await step("M-08 hand edit of the metadata file", async () => {
    const p = (await import("./task5-lib.mjs")).walk(projectDir(h)).find((x) => /meta\/resource-[^/]*\.meta\.json$/.test(x) && JSON.parse(readFileSync(x, "utf8")).name === "Scene One");
    const j = JSON.parse(readFileSync(p, "utf8")); j.userMetadata.synopsis = "Edited in a text editor."; writeFileSync(p, JSON.stringify(j, null, 2));
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Meta Test"]'); await tick(page, 2000); await treeClick(page, "Scene One");
    say(`M-08 after editing userMetadata.synopsis in the resource's metadata file by hand (throwaway project) and reloading: sidebar Synopsis text=${J(await page.$eval("textarea[aria-label=synopsis]", (t) => t.value))}`);
    await page.fill("textarea[aria-label=synopsis]", "Edited in the sidebar."); await page.locator("textarea[aria-label=synopsis]").blur(); await tick(page, 2500);
    say(`M-08 after editing it in the sidebar: file userMetadata.synopsis=${J(JSON.parse(readFileSync(p, "utf8")).userMetadata.synopsis)}`);
  });
});
