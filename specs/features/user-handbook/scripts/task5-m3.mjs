// Task 5, web build + CLI: story/metadata.md rows M-26..M-47 (subtypes). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, newProjectWithDoc, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, createNode, treeClick, sidecarByName, sidecars, projectJson, projectDir, expandAll, createProject } from "./task5-lib.mjs";
import { runCli } from "./cli.mjs";
import { chips, setField, setOp, matchInfo, queryHelpers } from "./task5-qlib.mjs";
import { assertThrowaway } from "./lib/safety.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const tick = (page, ms = 1500) => page.waitForTimeout(ms);
const reopen = async (page, proj, doc) => { await page.reload(); await tick(page, 2000); await page.click(`button[aria-label="Open ${proj}"]`); await tick(page, 2000); if (doc) await treeClick(page, doc); };
const sub = (h, n) => sidecarByName(h, n)?.json.resourceSubtype;
await withWeb("t5-m3", {}, async ({ h, page }) => {
  const P = "Sub Test";
  await newProjectWithDoc(page, h, P, "Scene A");
  for (const n of ["Scene B", "Outline A", "Plain"]) await createNode(page, n, "text");
  await createNode(page, "Stuff", "folder");
  await reopen(page, P, "Scene A");
  const subSection = () => page.locator("section:has(h2:text-is('Subtypes'))");
  const lst = async () => (await subSection().locator("li span.truncate").allTextContents());
  const S = async (id, fn) => { await page.keyboard.press("Escape"); await step(id, fn); await page.keyboard.press("Escape"); const c = page.locator("[role=dialog] button:text-is('Close'), dialog button:text-is('Close')"); if (await c.count()) { await c.first().click().catch(() => {}); await tick(page, 500); } };

  await S("M-44 empty list", async () => {
    say(`M-44 no subtypes defined: Subtype select disabled=${await page.locator("select[aria-label=Subtype]").isDisabled()}; sidebar text=${J((await sidebarText(page)).split("\n").filter((l) => /subtype/i.test(l)))}`);
    say(`M-26 project.json config.subtypes at creation: ${J(projectJson(h).config.subtypes)} (key present: ${"subtypes" in projectJson(h).config})`);
  });

  await S("M-28/29/39/41 define", async () => {
    await openSettings(page, "Metadata");
    say(`M-28 order of sections in the Metadata tab: ${J((await dialogText(page)).split("\n").filter((l) => /^(Subtypes|Metadata Fields|Built-in features)$/.test(l)))}`);
    const add = async (t, how) => {
      await page.fill("#subtype-new", t);
      if (how === "enter") await page.press("#subtype-new", "Enter"); else await subSection().locator("button:text-is('Add')").click();
      await tick(page, 1200);
    };
    await add("Scene", "button"); say(`M-29 added "Scene" with the Add button: list=${J(await lst())}; project.json=${J(projectJson(h).config.subtypes)}`);
    await add("Profile", "enter"); say(`M-29 added "Profile" with Enter: list=${J(await lst())}`);
    await add("Outline", "button");
    say(`M-29 list now ${J(await lst())}; controls per entry: ${J(await subSection().locator("li button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label"))))}`);
    await page.click("button[aria-label='Move Outline up']"); await tick(page, 1200);
    say(`M-29 after Move Outline up: list=${J(await lst())}; project.json=${J(projectJson(h).config.subtypes)}`);
    await page.click("button[aria-label='Move Outline down']"); await tick(page, 1200);
    await page.fill("#subtype-new", "scene"); await subSection().locator("button:text-is('Add')").click(); await tick(page, 1000);
    say(`M-39 adding "scene" when "Scene" exists: list=${J(await lst())}; message=${J(await subSection().locator("[role=alert], #subtype-new-error").allTextContents())}`);
    await page.fill("#subtype-new", "  SCENE  "); await page.press("#subtype-new", "Enter"); await tick(page, 1000);
    say(`M-39 adding "  SCENE  ": list=${J(await lst())}; message=${J(await subSection().locator("[role=alert], #subtype-new-error").allTextContents())}`);
    await page.fill("#subtype-new", ""); await page.press("#subtype-new", "Enter"); await tick(page, 600);
    say(`M-29 blank add: message=${J(await subSection().locator("[role=alert], #subtype-new-error").allTextContents())}`);
    say(`M-41 any rename control for a subtype entry (aria-labels containing Rename/Edit in the Subtypes section): ${J(await subSection().locator("[aria-label*=Rename], [aria-label*=Edit], input[type=text]:not(#subtype-new)").count())}`);
    await page.fill("#subtype-new", ""); 
  });

  await S("M-30/31/27 assign", async () => {
    await treeClick(page, "Scene A");
    say(`M-44 after defining: Subtype select disabled=${await page.locator("select[aria-label=Subtype]").isDisabled()}; options=${J(await page.$$eval("select[aria-label=Subtype] option", (o) => o.map((x) => x.textContent)))}; hint present=${J((await sidebarText(page)).includes("No subtypes yet"))}`);
    say(`M-30 sidebar order of sections: ${J((await sidebarText(page)).split("\n").filter((l) => /^(PROSE DIAGNOSTICS|SUBTYPE|DOCUMENT|TAGS)$/.test(l)))}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "Scene" }); await tick(page, 1800);
    say(`M-30 Scene A subtype after choosing Scene: sidecar resourceSubtype=${J(sub(h, "Scene A"))}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "No subtype" }); await tick(page, 1800);
    say(`M-31 after choosing No subtype: sidecar resourceSubtype=${J(sub(h, "Scene A"))}; sidecar keys=${J(Object.keys(sidecarByName(h, "Scene A").json))}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "Scene" }); await tick(page, 1800);
    await treeClick(page, "Scene B"); await page.selectOption("select[aria-label=Subtype]", { label: "Scene" }); await tick(page, 1800);
    await treeClick(page, "Outline A"); await page.selectOption("select[aria-label=Subtype]", { label: "Outline" }); await tick(page, 1800);
    say(`M-27 subtypes now: Scene A=${J(sub(h, "Scene A"))} Scene B=${J(sub(h, "Scene B"))} Outline A=${J(sub(h, "Outline A"))} Plain=${J(sub(h, "Plain"))}; Subtype is a single select (multiple=${await page.$eval("select[aria-label=Subtype]", (s) => s.multiple)})`);
  });

  await S("M-27 image/audio", async () => {
    const { writeFileSync: wf } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const png = path.join(h.run.dir, "p.png"), mp3 = path.join(h.run.dir, "t.mp3");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=1", mp3]);
    await createNode(page, "Pic", "image", "Workspace", png);
    await createNode(page, "Tune", "audio", "Workspace", mp3);
    for (const n of ["Pic", "Tune"]) {
      await treeClick(page, n);
      const dis = await page.locator("select[aria-label=Subtype]").isDisabled();
      await page.selectOption("select[aria-label=Subtype]", { label: "Profile" }); await tick(page, 1800);
      say(`M-27 ${n} (type ${sidecarByName(h, n).json.type}): Subtype select disabled=${dis}; sidecar resourceSubtype=${J(sub(h, n))}`);
    }
  });

  await S("M-32..M-37 applies to", async () => {
    await treeClick(page, "Scene A");
    await addSidebarField(page, "beat", "Beat", "Text", "Document");
    await addSidebarField(page, "gen", "Generic", "Text", "Document");
    const fieldsOf = async (n) => { await treeClick(page, n); return (await sidebarText(page)).split("\n").filter((l) => /^(BEAT|GENERIC|SYNOPSIS|NOTES|STATUS)$/.test(l)); };
    say(`M-25/M-33 before restricting (all custom fields unrestricted): Scene A=${J(await fieldsOf("Scene A"))} Outline A=${J(await fieldsOf("Outline A"))} Plain=${J(await fieldsOf("Plain"))}`);
    await openSettings(page, "Metadata");
    const g = page.getByRole("group", { name: /Applies to subtypes for Beat/ });
    say(`M-32 Applies-to group for Beat: checkboxes=${J(await g.locator("label").allTextContents())}; for Status/Synopsis/Point of View/Story Date present=${J(await Promise.all(["Status", "Synopsis", "Point of View", "Story Date"].map((l) => page.getByRole("group", { name: new RegExp(`Applies to subtypes for ${l}`) }).count())))}`);
    await g.getByLabel("Scene").check(); await tick(page, 1800);
    say(`M-32 after ticking Scene: schema appliesTo=${J(await (async () => { const fs = await import("node:fs"); const dir = projectDir(h); const f = fs.readdirSync(path.join(dir, "meta")).find((x) => /schema/i.test(x)); return f ? JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "meta", f), "utf8")).groups.flatMap((gr) => gr.fields).filter((x) => x.key === "beat" || x.key === "gen").map((x) => [x.key, x.appliesTo])) : "no schema file in meta/: " + fs.readdirSync(path.join(dir, "meta")).join(","); })())}`);
    await closeSettings(page);
    say(`M-34/M-35 after restricting Beat to Scene: Scene A=${J(await fieldsOf("Scene A"))} Scene B=${J(await fieldsOf("Scene B"))} Outline A=${J(await fieldsOf("Outline A"))} Plain=${J(await fieldsOf("Plain"))} Pic(Profile)=${J(await fieldsOf("Pic"))}`);
    // M-37
    await treeClick(page, "Scene A");
    await page.fill("input[aria-label=beat]", "act one"); await page.locator("input[aria-label=beat]").blur(); await tick(page, 2000);
    await page.fill("input[aria-label=gen]", "kept anyway"); await page.locator("input[aria-label=gen]").blur(); await tick(page, 2000);
    await page.selectOption("select[aria-label=Subtype]", { label: "Outline" }); await tick(page, 1800);
    say(`M-37 Scene A changed to Outline: sidebar fields=${J((await sidebarText(page)).split("\n").filter((l) => /^(BEAT|GENERIC)$/.test(l)))}; sidecar userMetadata=${J(sidecarByName(h, "Scene A").json.userMetadata)}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "No subtype" }); await tick(page, 1800);
    say(`M-37 Scene A cleared: sidebar fields=${J((await sidebarText(page)).split("\n").filter((l) => /^(BEAT|GENERIC)$/.test(l)))}; sidecar userMetadata=${J(sidecarByName(h, "Scene A").json.userMetadata)}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "Scene" }); await tick(page, 1800);
    say(`M-37 Scene A set back to Scene: sidebar fields=${J((await sidebarText(page)).split("\n").filter((l) => /^(BEAT|GENERIC)$/.test(l)))}; Beat input value=${J(await page.$eval("input[aria-label=beat]", (i) => i.value))}`);
  });

  await S("M-40/M-42 removal and capitalisation", async () => {
    await openSettings(page, "Metadata");
    await page.click("button[aria-label='Remove Scene']"); await tick(page, 1500);
    say(`M-40 after removing Scene from the list: list=${J(await lst())}; project.json=${J(projectJson(h).config.subtypes)}; Applies-to group for Beat=${J(await page.getByRole("group", { name: /Applies to subtypes for Beat/ }).locator("label").allTextContents())}`);
    await closeSettings(page);
    await treeClick(page, "Scene A");
    say(`M-40 Scene A: Subtype select shows=${J(await page.$eval("select[aria-label=Subtype]", (s) => s.selectedOptions[0].textContent))}; options=${J(await page.$$eval("select[aria-label=Subtype] option", (o) => o.map((x) => x.textContent)))}; sidecar resourceSubtype=${J(sub(h, "Scene A"))}; Beat visible=${J((await sidebarText(page)).includes("BEAT"))}`);
    await treeClick(page, "Scene B");
    say(`M-40 Scene B: Subtype select shows=${J(await page.$eval("select[aria-label=Subtype]", (s) => s.selectedOptions[0].textContent))}; Beat visible=${J((await sidebarText(page)).includes("BEAT"))}`);
    // M-42: add "SCENE" capitalised
    await openSettings(page, "Metadata");
    await page.fill("#subtype-new", "SCENE"); await page.press("#subtype-new", "Enter"); await tick(page, 1500);
    say(`M-42 after adding "SCENE": list=${J(await lst())}; Applies-to group for Beat=${J(await page.getByRole("group", { name: /Applies to subtypes for Beat/ }).locator("label").allTextContents())}; Scene checkbox for Beat checked=${J(await page.getByRole("group", { name: /Applies to subtypes for Beat/ }).locator("input").evaluateAll((i) => i.map((x) => x.checked)))}`);
    await closeSettings(page);
    await treeClick(page, "Scene A");
    say(`M-42 Scene A: Subtype select shows=${J(await page.$eval("select[aria-label=Subtype]", (s) => s.selectedOptions[0].textContent))}; sidecar resourceSubtype=${J(sub(h, "Scene A"))}; Beat visible=${J((await sidebarText(page)).includes("BEAT"))}`);
  });

  await S("M-43 move and entity", async () => {
    await treeClick(page, "Plain");
    await page.selectOption("select[aria-label=Subtype]", { label: "Profile" }); await tick(page, 1800);
    await page.click(`button[aria-label="Plain options"]`);
    say(`M-43 resource context menu items: ${J(await page.$$eval(".resource-context-menu-item", (o) => o.map((x) => x.textContent.trim())))}`);
    await page.keyboard.press("Escape");
    // entities feature
    await openSettings(page, "Entities");
    const cb = page.getByRole("checkbox", { name: /^Entities/ }).first();
    say(`M-43 Entities tab text: ${J((await dialogText(page)).split("\n").filter((l) => /Entities|entity/i.test(l)).slice(0, 6))}`);
    await cb.click(); await tick(page, 1500);
    await closeSettings(page);
    await treeClick(page, "Plain");
    say(`M-43 sidebar sections with Entities on: ${J((await sidebarText(page)).split("\n").filter((l) => /^(ENTITY|SUBTYPE|DOCUMENT|TAGS|[A-Z ]*ENTIT[A-Z ]*)$/.test(l)))}; controls=${J(await page.$$eval("input, select", (o) => o.map((x) => x.getAttribute("aria-label") || x.placeholder || x.type).filter((s) => /entity|kind|alias|Subtype/i.test(s))))}`);
  });

  await S("M-43 move + entity kind", async () => {
    await treeClick(page, "Plain");
    await page.click(`button[aria-label="Plain options"]`); await page.click(".resource-context-menu-item:has-text('Move to')"); await tick(page, 1000);
    say(`M-43 Move dialog: ${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? { text: d.innerText.slice(0, 300), buttons: [...d.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.innerText.trim()) } : null; }))}`);
  });
  await S("M-43 move choose", async () => {
    await treeClick(page, "Plain");
    await page.click(`button[aria-label="Plain options"]`); await page.click(".resource-context-menu-item:has-text('Move to')"); await tick(page, 800);
    await page.click("button[aria-label='Destination folder']"); await tick(page, 600);
    say(`M-43 destination picker buttons: ${J(await page.$$eval("button", (b) => b.map((x) => x.getAttribute("aria-label") || x.innerText.trim()).filter((t) => /Expand|Collapse|Stuff|Workspace|Characters/.test(t))))}`);
    await page.evaluate(() => { const ex = [...document.querySelectorAll("button[aria-label='Expand Workspace']")].pop(); if (ex) ex.click(); }); await tick(page, 500);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter((x) => x.innerText.trim() === "Stuff").pop(); b.click(); }); await tick(page, 600);
    await page.locator("button:text-is('Move')").last().click(); await tick(page, 2500);
    const sc = sidecarByName(h, "Plain").json;
    const fdir = (await import("./task4-lib.mjs")).walk(projectDir(h)).filter((p) => /folder\.json$/.test(p)).map((p) => { const j = JSON.parse(readFileSync(p, "utf8")); return [j.id, j.name]; });
    say(`M-43 after moving Plain into Stuff: sidecar folderId=${sc.folderId}; folders=${J(fdir)}; resourceSubtype=${J(sc.resourceSubtype)}`);
  });
  await S("M-43 entity kind", async () => {
    await treeClick(page, "Plain");
    await page.fill("input[aria-label=entity-kind-input]", "character"); await page.locator("input[aria-label=entity-kind-input]").blur(); await tick(page, 2500);
    const sc = sidecarByName(h, "Plain").json;
    say(`M-43 after setting Entity Kind=character on Plain: entityKind=${J(sc.entityKind)}; resourceSubtype=${J(sc.resourceSubtype)}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "Outline" }); await tick(page, 1800);
    const sc2 = sidecarByName(h, "Plain").json;
    say(`M-43 after changing Plain's subtype to Outline: entityKind=${J(sc2.entityKind)}; resourceSubtype=${J(sc2.resourceSubtype)}; Scene A entityKind=${J(sidecarByName(h, "Scene A").json.entityKind)} (never set)`);
  });
  await S("M-46 templates in app", async () => {
    await reopen(page, P, null);
    await page.click(`button[aria-label="Workspace options"]`);
    await page.click(".resource-context-menu-item:has-text('Create')"); await tick(page, 800);
    say(`M-46 Create resource dialog text: ${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : null; }))}; select options=${J(await page.$$eval("select option", (o) => o.map((x) => x.textContent)))}`);
    await page.keyboard.press("Escape"); await tick(page, 500);
    const bodyHas = (await bodyText(page)).toLowerCase().includes("template");
    say(`M-46 the word "template" anywhere in the open app window text: ${bodyHas}`);
    await page.click(`button[aria-label="Open project settings menu"]`);
    say(`M-46 gear menu items: ${J((await bodyText(page)).split("\n").slice(2, 12))}`);
    await page.keyboard.press("Escape");
  });
  await S("M-46 templates CLI", async () => {
    const root = projectDir(h); assertThrowaway(root);
    const idA = sidecarByName(h, "Scene A").json.id;
    const run = (args) => { const r = runCli(args, { cwd: h.run.dir }); say(`$ getwrite-cli ${args.map((a) => (a.includes("getwrite-handbook/") ? "<throwaway project>" : a)).join(" ")} -> exit ${r.status}; out: ${J((r.stdout + r.stderr).trim().split("\n").slice(0, 6))}`); return r; };
    run(["templates", "save-from-resource", root, idA, "tplscene", "--name", "Scene template"]);
    run(["templates", "list", root]);
    const tf = (await import("./task4-lib.mjs")).walk(path.join(root, "meta", "templates")).map((p) => [p.replace(root, ""), readFileSync(p, "utf8").slice(0, 400)]);
    say(`M-46 template file(s): ${J(tf)}`);
    run(["templates", "create", root, "tplscene", "From Template"]);
    const made = sidecars(h).map((x) => x.json).find((j) => j.name === "From Template");
    say(`M-46 resource created from the template: ${J(made ? { name: made.name, resourceSubtype: made.resourceSubtype, userMetadata: made.userMetadata } : "not found")}`);
    await reopen(page, P, null); await expandAll(page);
    await treeClick(page, "From Template");
    say(`M-46 in the app after reload: Subtype select shows=${J(await page.$eval("select[aria-label=Subtype]", (s) => s.selectedOptions[0].textContent))}`);
  });
  await S("M-47 copy and duplicate", async () => {
    await reopen(page, P, null);
    say(`M-47 debug body: ${J((await bodyText(page)).split("\n").slice(0, 25))}`);
    await expandAll(page); say(`M-47 debug after expandAll: ${J((await bodyText(page)).split("\n").slice(3, 16))}; expand buttons=${J(await page.$$eval("button[aria-label^='Expand '], button[aria-label^='Collapse ']", (b) => b.map((x) => x.getAttribute("aria-label"))))}`);
    try { await page.click("text=Scene A >> nth=0", { timeout: 5000 }); } catch (e) { say("DBG " + e.message.slice(0, 900)); await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t5-m3-dbg.png" }); }
    await tick(page, 1000);
    await page.click(`button[aria-label="Scene A options"]`);
    await page.click(".resource-context-menu-item:text-is('Duplicate')"); await tick(page, 2500);
    say(`M-47 Duplicate opens a dialog: ${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? { text: d.innerText.slice(0, 300), title: d.querySelector("input[type=text]")?.value } : null; }))}`);
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click(); await tick(page, 3000);
    say(`M-47 after Duplicate then Create: resources named like Scene A=${J(sidecars(h).map((x) => [x.json.name, x.json.resourceSubtype, x.json.userMetadata]).filter(([n]) => /Scene A/.test(n)))}`);
    await reopen(page, P, null); await expandAll(page); await treeClick(page, "Scene A (Copy)");
    say(`M-47 the duplicate in the app: Subtype select shows=${J(await page.$eval("select[aria-label=Subtype]", (s) => s.selectedOptions[0].textContent))}`);
    await treeClick(page, "Scene A");
    await page.click(`button[aria-label="Scene A options"]`);
    await page.click(".resource-context-menu-item:text-is('Copy')"); await tick(page, 1200);
    say(`M-47 Copy opens: ${J(await page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? { text: d.innerText.slice(0, 300), title: d.querySelector("input[type=text]")?.value } : null; }))}`);
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click(); await tick(page, 3000);
    say(`M-47 after Copy: resources with Scene A in the name=${J(sidecars(h).map((x) => [x.json.name, x.json.resourceSubtype]).filter(([n]) => /Scene A/.test(n)))}`);
  });
  await S("M-38/M-45 queries and subtype", async () => {
    await reopen(page, P, "Scene A");
    say(`M-38 Scene A's subtype right now: ${J(sub(h, "Scene A"))}; Beat visible in its sidebar=${J((await sidebarText(page)).includes("BEAT"))}`);
    await page.selectOption("select[aria-label=Subtype]", { label: "Profile" }); await tick(page, 1800);
    say(`M-38 Scene A is Profile now: Beat hidden in the sidebar=${J(!(await sidebarText(page)).includes("BEAT"))}; stored beat=${J(sidecarByName(h, "Scene A").json.userMetadata.beat)}`);
    const { newQuery, saveAs, run } = queryHelpers(page, h);
    await newQuery();
    await page.click("button.field-picker__trigger"); await tick(page, 400);
    const labels = await page.$$eval("[role=listbox][aria-label='Select a field'] [role=option]", (o) => o.map((x) => x.innerText.split("\n")[0].trim()));
    say(`M-45 query builder field list while subtypes exist (a resource has a subtype): ${J(labels)}; contains a subtype field=${J(labels.some((l) => /subtype/i.test(l)))}`);
    await page.keyboard.press("Escape");
    await setField(page, 0, "Beat"); await setOp(page, 0, "is");
    await chips(page).nth(0).locator("input[aria-label='Value']").fill("act one"); await tick(page, 400);
    await saveAs("Beat is act one");
    say(`M-38 smart folder "Beat is act one" while Scene A's subtype hides Beat: result=${J(await run("Beat is act one"))}`);
  });

});
