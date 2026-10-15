// Task 8, web build: protect-and-finish/compiling.md rows C-01..C-12. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeInto, expandAll, step, openSettings, closeSettings, addSidebarField, reloadProject, tick, dlg, projectDir, walkFiles, makeJpegWithExif, makeMp3, sidebarText, sidecarByName, closeProject, bodyText } from "./task8-lib.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const snap = (pd) => { const h = createHash("sha256"); const files = walkFiles(pd).sort(); for (const f of files) h.update(f + readFileSync(f).length + createHash("sha1").update(readFileSync(f)).digest("hex")); return { files: files.length, digest: h.digest("hex").slice(0, 12) }; };
await withWeb("t8-c1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  const S = async (id, fn) => { await step(id, fn); await page.keyboard.press("Escape"); await page.waitForTimeout(300); await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
  await createProject(page, h, "Cmp One", "Blank");
  const pd = projectDir(h);
  const save = async (d, tag) => { const fp = path.join(h.run.dir, `${tag}-${d.suggestedFilename()}`); await d.saveAs(fp); return fp; };
  const outline = async () => { await expandAll(page); return page.$$eval("[role=treeitem]", (e) => e.map((x) => x.getAttribute("aria-label"))); };
  await S("setup", async () => {
    await createNode(page, "Beta Doc", "text"); await createNode(page, "Alpha Doc", "text"); await createNode(page, "Part", "folder");
    await reloadProject(page, "Cmp One");
    await createNode(page, "Inner Doc", "text", "Part"); await createNode(page, "Gamma Doc", "text");
    await createNode(page, "Pic X", "image", "Workspace", makeJpegWithExif(h.run.dir));
    await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("Root Doc");
    say("parent folder choices: " + J(await page.$$eval("[role=dialog] select, dialog select", (s) => s.map((x) => [...x.options].map((o) => o.textContent)))));
    await page.locator("[role=dialog] select, dialog select").nth(1).selectOption({ label: "Project Root" }).catch((e) => say("no Project Root choice"));
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click(); await tick(page, 2500);
    await reloadProject(page, "Cmp One");
    for (const [t, x] of [["Beta Doc", "Beta text here."], ["Alpha Doc", "Alpha text here."], ["Inner Doc", "Inner text here."], ["Gamma Doc", "Gamma text here."], ["Root Doc", "Root text here."]]) await typeInto(page, t, x);
    say("tree: " + J(await outline()));
  });
  const pick = async (fmt) => { await page.selectOption("#compile-as", fmt); await tick(page, 300); };
  const openDialog = async () => { await page.click('button[aria-label="Open project menu"]'); await page.locator("text=Compile Project").first().click(); await tick(page, 900); };
  await S("C-02/03/05/06 in-project compile", async () => {
    const before = snap(pd);
    await openDialog();
    say("C-03 in-project dialog text: " + J(await dlg(page)));
    say("C-05 dialog controls: " + J(await page.$$eval("[role=dialog] button, dialog button, [role=dialog] input, dialog input", (o) => o.map((x) => (x.getAttribute("aria-label") || x.innerText || x.type || "").trim().slice(0, 30)))));
    await page.click("button:has-text('SELECT ALL')"); await tick(page, 300);
    say("C-05 after SELECT ALL: " + J((await dlg(page)).split("\n").filter(Boolean)));
    for (const fmt of ["txt", "md", "pdf", "docx"]) {
      await pick(fmt);
      await tick(page, 300);
      const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
      await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click();
      const d = await dl;
      if (!d) { say(`C-05 ${fmt}: no download; dialog=${J((await dlg(page)) )}`); continue; }
      const fp = await save(d, "proj"); const buf = readFileSync(fp);
      if (fmt === "txt" || fmt === "md") say(`C-05/06 ${fmt}: ${d.suggestedFilename()} ${buf.length} bytes content=${J(buf.toString("utf8"))}`);
      if (fmt === "pdf") say(`C-05 pdf: ${d.suggestedFilename()} ${buf.length} bytes header=${J(buf.subarray(0, 8).toString("latin1"))} pages(/Type /Page)=${(buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length}`);
      if (fmt === "docx") { const x = execFileSync("unzip", ["-p", fp, "word/document.xml"]).toString(); say(`C-05 docx: ${d.suggestedFilename()} ${buf.length} bytes zip=${J(buf.subarray(0, 2).toString("latin1"))} text=${J(x.replace(/<\/w:p>/g, "\\n").replace(/<[^>]+>/g, "").slice(0, 400))}`); }
      await tick(page, 800);
      say(`C-05 after ${fmt} compile: dialog still open=${J(!!(await dlg(page)))}`);
      if (!(await dlg(page))) { await openDialog(); await page.click("button:has-text('SELECT ALL')"); await tick(page, 300); }
    }
    await page.keyboard.press("Escape"); await tick(page, 600);
    const after = snap(pd);
    say(`C-12 project folder before/after compiling in-project (files, digest): ${J(before)} -> ${J(after)}`);
  });
  await S("C-06 reorder then compile", async () => {
    await expandAll(page);
    const box = async (name) => page.locator(`[role=treeitem][aria-label="${name}"]`).first().boundingBox();
    const a = await box("Gamma Doc"), b = await box("Beta Doc");
    say("tree before drag: " + J(await outline()));
    await page.mouse.move(a.x + 10, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 10, a.y - 5, { steps: 5 }); await page.mouse.move(b.x + 10, b.y + 1, { steps: 15 }); await tick(page, 300); await page.mouse.up(); await tick(page, 1800);
    await reloadProject(page, "Cmp One");
    say("tree after dragging Gamma Doc above Beta Doc and a reload: " + J(await outline()));
    await openDialog();
    say("C-06 dialog list order: " + J((await dlg(page)).split("\n").filter(Boolean)));
    await page.click("button:has-text('SELECT ALL')"); await tick(page, 300);
    await pick("txt");
    const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click();
    const d = await dl; if (d) say("C-06 txt after reorder: " + J(readFileSync(await save(d, "reorder"), "utf8")));
  });
  await S("C-02 Start Page Package", async () => {
    await closeProject(page); await page.reload(); await tick(page, 2000);
    await page.click('button[aria-label="Manage Cmp One"]'); await page.locator("text=Package").first().click(); await tick(page, 1000);
    say("C-02 Start Page Package dialog: " + J((await dlg(page)).split("\n").filter(Boolean)));
    await page.click("button:has-text('SELECT ALL')"); await tick(page, 300);
    const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
    await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click();
    const d = await dl; if (d) say("C-02 Start Page compile (default format) " + d.suggestedFilename() + ": " + J(readFileSync(await save(d, "start"), "utf8").slice(0, 400)));
  });
  await S("entity compile", async () => {
    await page.keyboard.press("Escape");
    await page.reload(); await tick(page, 2000); await page.click('button[aria-label="Open Cmp One"]'); await tick(page, 2000);
    await createNode(page, "Elena", "text");
    await openSettings(page, "Entities"); await page.getByRole("checkbox", { name: /^Entities/ }).first().click(); await tick(page, 1500); await closeSettings(page);
    await treeClick(page, "Elena"); await page.fill("input[aria-label=entity-kind-input]", "character"); await page.locator("input[aria-label=entity-kind-input]").blur(); await tick(page, 2500);
    await typeInto(page, "Inner Doc", "Inner text here, with Elena in it.");
    await typeInto(page, "Beta Doc", "Beta text here, Elena again.");
    await treeClick(page, "Pic X"); await addSidebarField(page, "friend", "Friend", "Ref", "Document");
    await page.fill("input[aria-label=friend]", "Ele"); await tick(page, 900); await page.locator("li:text-is('Elena')").first().click(); await tick(page, 1800);
    await reloadProject(page, "Cmp One"); await treeClick(page, "Elena"); await tick(page, 2000);
    const t = await sidebarText(page); const i = t.indexOf("ENTITY MENTIONS");
    say("C-08 Elena sidebar ENTITY MENTIONS: " + J(t.slice(i, i + 700)));
    const before = snap(pd);
    await page.locator("button:has-text(\"Compile this entity\")").first().click(); await tick(page, 1200);
    say("C-09/10/11 entity compile dialog: " + J(await dlg(page)));
    say("C-09 entity dialog controls: " + J(await page.$$eval("[role=dialog] button, dialog button, [role=dialog] input, dialog input", (o) => o.map((x) => (x.getAttribute("aria-label") || x.innerText || x.type || "").trim().slice(0, 30) + (x.type === "checkbox" ? (x.checked ? "[x]" : "[ ]") + (x.disabled ? "(disabled)" : "") : "")))));
    for (const fmt of ["txt", "pdf"]) {
      await pick(fmt);
      const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
      await page.locator("[role=dialog] button:has-text('COMPILE'), dialog button:has-text('COMPILE')").last().click();
      const d = await dl;
      if (d) { const fp = await save(d, "ent"); const buf = readFileSync(fp); say(`C-09 entity ${fmt}: ${d.suggestedFilename()} ${buf.length} bytes ` + (fmt === "txt" ? J(buf.toString("utf8")) : J(buf.subarray(0, 8).toString("latin1")))); } else say(`C-09 entity ${fmt}: no download; dialog=${J(await dlg(page))}`);
      await tick(page, 600);
      if (!(await dlg(page))) { await page.locator("button:has-text(\"Compile this entity\")").first().click(); await tick(page, 900); }
    }
    await page.keyboard.press("Escape"); await tick(page, 600);
    say(`C-12 entity compile project folder before/after (files, digest): ${J(before)} -> ${J(snap(pd))}`);
  });
});
