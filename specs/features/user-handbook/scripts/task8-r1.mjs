// Task 8, web build: protect-and-finish/resources.md rows RS-01..RS-09. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, makeJpegWithExif, makeMp3, expandAll, sidebarText, sidecarByName, sidecars, projectDir, walkFiles, rel, step, openSettings, closeSettings, addSidebarField, reloadProject, tick, pm, expandRevisions, revCards, dlg, clickTab, readPj } from "./task8-lib.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
const ids = (h) => Object.fromEntries(sidecars(h).map((s) => [s.json.name ?? s.json.title, s.json.id]));
await withWeb("t8-r1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Res One", "Blank");
  const pd = projectDir(h);
  const S = async (id, fn) => { await step(id, fn); await page.keyboard.press("Escape"); await page.waitForTimeout(300); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  const jpg = makeJpegWithExif(h.run.dir), mp3 = makeMp3(h.run.dir, 3);
  await S("RS-01 create four kinds", async () => {
    await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')");
    say("RS-01 New resource dialog type options: " + J(await page.$$eval("select option", (o) => o.map((x) => x.textContent))));
    await page.keyboard.press("Escape"); await tick(page, 500);
    await createNode(page, "Chapter Doc", "text");
    await createNode(page, "Map Pic", "image", "Workspace", jpg);
    await createNode(page, "Demo Tune", "audio", "Workspace", mp3);
    await createNode(page, "Box", "folder", "Workspace"); await createNode(page, "Box2", "folder", "Workspace");
    await reloadProject(page, "Res One");
    const sc = sidecars(h).map((s) => `${s.json.name}:${s.json.type}`);
    say("RS-01 sidecars (name:type): " + J(sc));
    say("RS-01 folders on disk: " + J(existsSync(path.join(pd, "folders")) ? readdirSync(path.join(pd, "folders")) : null) + "; resources dirs: " + readdirSync(path.join(pd, "resources")).length);
    say("RS-01 tree items: " + J(await page.$$eval("[role=treeitem]", (e) => e.map((x) => x.getAttribute("aria-label")))));
  });
  await S("RS-04 text in the editor", async () => {
    await treeClick(page, "Chapter Doc");
    await pm(page).click(); await page.keyboard.insertText("Plain words. "); await page.keyboard.insertText("More words.");
    await tick(page, 4500);
    say("RS-04 toolbar buttons: " + J(await page.$$eval("button[aria-label]", (bs) => bs.map((b) => b.getAttribute("aria-label")).filter((l) => /^(Bold|Italic|Underline|Strikethrough|Inline code|Heading|Bullet|Ordered|Blockquote)/.test(l)))));
    say("RS-04 editor html: " + J(await page.evaluate(() => document.querySelector(".ProseMirror").innerHTML)));
    say("RS-04 tabs selected: " + J(await page.$$eval("[role=tab]", (t) => t.filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.innerText.trim()))));
  });
  await S("RS-05 image", async () => {
    await treeClick(page, "Map Pic"); await tick(page, 1500);
    say("RS-05 Work Area for the image: " + J(await page.evaluate(() => ({ imgs: [...document.querySelectorAll("img")].map((i) => ({ w: i.naturalWidth, h: i.naturalHeight, alt: i.alt })), selectedTab: [...document.querySelectorAll("[role=tab]")].filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.innerText.trim()) }))));
    const sb = await sidebarText(page);
    say("RS-05 sidebar IMAGE block: " + J(sb.slice(sb.indexOf("IMAGE"), sb.indexOf("IMAGE") + 120)));
  });
  await S("RS-06 audio", async () => {
    await treeClick(page, "Demo Tune"); await tick(page, 1500);
    say("RS-06 audio widget: " + J(await page.evaluate(() => ({ audio: [...document.querySelectorAll("audio")].map((a) => ({ d: a.duration, paused: a.paused })), buttons: [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).filter((s) => /play|pause|seek/i.test(s || "")), sliders: [...document.querySelectorAll("input[type=range],[role=slider]")].map((r) => (r.getAttribute("aria-label") || "") + "|" + r.type + "|max=" + r.max) }))));
    await page.click('button[aria-label="Play"]'); await tick(page, 900);
    const s1 = await page.evaluate(() => ({ paused: document.querySelector("audio").paused, t: document.querySelector("audio").currentTime, btn: [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).filter((s) => /play|pause/i.test(s || "")) }));
    say("RS-06 after clicking Play: " + J(s1));
    if (s1.btn.includes("Pause")) { await page.click('button[aria-label="Pause"]'); await tick(page, 500); }
    say("RS-06 after clicking Pause: " + J(await page.evaluate(() => ({ paused: document.querySelector("audio").paused, btn: [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).filter((s) => /play|pause/i.test(s || "")) }))));
    const root = page.locator('[aria-label="Seek"]').first().locator("xpath=../..");
    const box = await root.boundingBox();
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2); await tick(page, 600);
    say("RS-06 after clicking 75% along the Seek track (3 s file): " + J(await page.evaluate(() => { const a = document.querySelector("audio"); return { currentTime: a.currentTime, seekableEnd: a.seekable.length ? a.seekable.end(0) : null, valuenow: document.querySelector('[aria-label="Seek"]').getAttribute("aria-valuenow") }; })));
    const sb = await sidebarText(page);
    say("RS-06 sidebar AUDIO block: " + J(sb.slice(sb.indexOf("AUDIO"), sb.indexOf("AUDIO") + 80)));
  });
  await S("RS-07 folder", async () => {
    await expandAll(page);
    await createNode(page, "Inner Doc", "text", "Box");
    await reloadProject(page, "Res One");
    await page.locator('[role=treeitem][aria-label="Box"]').first().click(); await tick(page, 1500);
    say("RS-07 after selecting folder Box: selected tab=" + J(await page.$$eval("[role=tab]", (t) => t.filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.innerText.trim()))) + "; cards=" + J(await page.$$eval("[aria-labelledby^='res-']", (c) => c.map((x) => x.innerText.split("\n")[0]))));
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await tick(page, 1500);
    say("RS-07 after selecting Workspace: cards=" + J(await page.$$eval("[aria-labelledby^='res-']", (c) => c.map((x) => x.innerText.split("\n")[0]))));
  });
  await S("RS-02 identity under rename and move", async () => {
    page.once("dialog", () => {});
    const before = ids(h);
    const folderMap = () => Object.fromEntries(readdirSync(path.join(pd, "folders")).map((d) => { try { const j = JSON.parse(readFileSync(path.join(pd, "folders", d, "folder.json"), "utf8")); return [j.id, j.name]; } catch { return [d, "?"]; } }));
    say("RS-02 folders (id -> name): " + J(Object.fromEntries(Object.entries(folderMap()).map(([k, v]) => [k.slice(0, 8), v]))) + "; Inner Doc folderId before: " + J(sidecarByName(h, "Inner Doc").json.folderId?.slice(0, 8)));
    say("RS-02 ids before: " + J(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.slice(0, 8)]))));
    // add a Ref field on Chapter Doc pointing at Inner Doc
    await treeClick(page, "Chapter Doc");
    await addSidebarField(page, "friend", "Friend", "Ref", "Document");
    await page.fill("input[aria-label=friend]", "Inn"); await tick(page, 900);
    await page.locator("li:text-is('Inner Doc')").first().click(); await tick(page, 1800);
    say("RS-02 Chapter Doc friend stored: " + J(sidecarByName(h, "Chapter Doc").json.userMetadata?.friend));
    await expandAll(page);
    await page.click('button[aria-label="Inner Doc options"]'); await page.click(".resource-context-menu-item:has-text('Rename')"); await tick(page, 600);
    say("RS-02 rename dialog: " + J(await dlg(page)));
    const inp = page.locator("[role=dialog] input[type=text], dialog input[type=text]").first();
    await inp.fill("Inner Renamed");
    await page.locator("[role=dialog] button, dialog button").filter({ hasText: /^(Rename|Save|OK)$/i }).last().click(); await tick(page, 2000);
    say("RS-02 after rename: tree items " + J(await page.$$eval("[role=treeitem]", (e) => e.map((x) => x.getAttribute("aria-label")))));
    await expandAll(page);
    await page.click('button[aria-label="Inner Renamed options"]'); await page.click(".resource-context-menu-item:has-text('Move to')"); await tick(page, 600);
    say("RS-02 move dialog: " + J(await dlg(page)));
    await page.click('button[aria-label="Destination folder"]'); await tick(page, 500);
    say("RS-02 destination choices: " + J(await page.$$eval("[role=dialog] button[aria-pressed], dialog button[aria-pressed]", (o) => o.map((x) => x.innerText))));
    await page.locator("[role=dialog] button[aria-pressed]:has-text('Workspace'), dialog button[aria-pressed]:has-text('Workspace')").first().click(); await tick(page, 400);
    await page.locator("[role=dialog] button:text-is('MOVE'), dialog button:text-is('MOVE'), [role=dialog] button:text-is('Move'), dialog button:text-is('Move')").first().click(); await tick(page, 2000);
    say("RS-02 after clicking Move: dialog=" + J(await dlg(page)) + "; toasts/status=" + J((await page.evaluate(() => document.body.innerText)).split("\n").filter((l) => /moved|move/i.test(l)).slice(0, 4)));
    await reloadProject(page, "Res One");
    const after = ids(h);
    say("RS-02 ids after rename + move: " + J(Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v.slice(0, 8)]))));
    say("RS-02 same id: " + J(before["Inner Doc"] === after["Inner Renamed"]));
    const sc = sidecarByName(h, "Inner Renamed")?.json; say("RS-02 Inner Renamed sidecar name/folderId after: " + J([sc?.name, sc?.folderId?.slice(0, 8), sc?.folderId ? folderMap()[sc.folderId] : null]));
    await expandAll(page); await page.locator('[role=treeitem][aria-label="Inner Renamed"]').first().click({ trial: true }).catch(() => {});
    say("RS-02 tree after move: " + J(await page.$$eval("[role=treeitem]", (e) => e.map((x) => x.getAttribute("aria-label")))));
    await treeClick(page, "Chapter Doc");
    say("RS-02 Chapter Doc friend input after rename of its target: " + J(await page.locator("input[aria-label=friend]").inputValue()) + " ; stored " + J(sidecarByName(h, "Chapter Doc").json.userMetadata?.friend));
  });
  await S("RS-08 metadata", async () => {
    await openSettings(page, "Metadata");
    for (const n of ["Synopsis", "Notes", "Timeline"]) { const c = page.getByRole("checkbox", { name: new RegExp("^" + n) }).first(); if (!(await c.isChecked().catch(() => false))) await c.click().catch(() => {}); await tick(page, 700); }
    await closeSettings(page);
    await treeClick(page, "Chapter Doc");
    const sb = await sidebarText(page);
    say("RS-08 sidebar section headings: " + J(sb.split("\n").filter((l) => /^[A-Z][A-Z /()-]+$/.test(l))));
    await page.selectOption("select[aria-label=status]", { label: "Published" }).catch(async () => say("status select missing"));
    if (await page.locator("textarea[aria-label=notes]").count()) { await page.fill("textarea[aria-label=notes]", "a note"); await page.locator("textarea[aria-label=notes]").blur(); }
    await tick(page, 2000);
    say("RS-08 sidecar userMetadata: " + J(sidecarByName(h, "Chapter Doc").json.userMetadata));
    for (const nm of ["Map Pic", "Demo Tune"]) {
      await treeClick(page, nm);
      await page.selectOption("select[aria-label=status]", { label: "Published" }).catch(() => say(`RS-08 ${nm}: no status select`));
      if (await page.locator("textarea[aria-label=notes]").count()) { await page.fill("textarea[aria-label=notes]", `note on ${nm}`); await page.locator("textarea[aria-label=notes]").blur(); }
      await tick(page, 1800);
      say(`RS-08 ${nm} sidebar headings: ` + J((await sidebarText(page)).split("\n").filter((l) => /^[A-Z][A-Z /()-]+$/.test(l))) + " ; userMetadata=" + J(sidecarByName(h, nm).json.userMetadata) + " ; story date input present=" + (await page.locator("input[aria-label=story-date-input]").count()));
    }
    await treeClick(page, "Chapter Doc");
    say("RS-08 story date inputs in the sidebar: " + J(await page.$$eval("input,select,textarea", (o) => o.map((x) => x.getAttribute("aria-label")).filter((l) => /date|time|duration|notes|status/i.test(l || "")))));
  });
  await S("RS-09 revision history", async () => {
    await treeClick(page, "Chapter Doc"); await expandRevisions(page);
    const doc = sidecarByName(h, "Chapter Doc").json.id;
    say("RS-09 Chapter Doc revision dirs: " + J(readdirSync(path.join(pd, "revisions", doc))));
    for (const n of ["Draft A", "Draft B"]) { await page.locator("#revision-control-content input[placeholder='Revision name']").fill(n); await page.locator("#revision-control-content button:has-text('Save')").click(); await tick(page, 1500); }
    say("RS-09 revision dirs after two named saves: " + J(readdirSync(path.join(pd, "revisions", doc))));
    say("RS-09 cards: " + J((await revCards(page)).map((c) => c.name + (c.badges.length ? " [" + c.badges + "]" : ""))));
    for (const nm of ["Map Pic", "Demo Tune"]) { const id = sidecarByName(h, nm).json.id; say(`RS-09 ${nm} revisions dir exists: ` + existsSync(path.join(pd, "revisions", id))); }
    await treeClick(page, "Map Pic");
    say("RS-09 Revision Control on the image: " + J(await page.locator("button[aria-controls=revision-control-content]").count()));
  });
});
