// Task 3, desktop (Electron dev, fake root): Start Page import buttons, App Settings, Project Type Manager. Run OUTSIDE the sandbox.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO, createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine, sleep } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { expandAll, treeRows, outline } from "./task3-lib.mjs";
const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
const run = createRun("desktop");
let h;
try {
  h = await startDesktop(run);
  const page = h.page;
  say(`electron pid ${h.app.process().pid}; isPackaged=${h.info.packaged}; userData is throwaway: ${h.sameUd}`);
  const body = () => page.evaluate(() => document.body.innerText);
  await step("S-10/12", async () => {
    await page.waitForTimeout(2000);
    say(`D start page url ${new URL(page.url()).pathname}; buttons: ${J(await page.$$eval("button,a", (e) => e.map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim()).filter(Boolean)))}`);
    say(`D start page text: ${J((await body()).split("\n").filter(Boolean).slice(0, 22))}`);
  });
  await step("S-10 dialog", async () => {
    await page.click("button:has-text('Import'):not(:has-text('Word'))");
    await page.waitForTimeout(800);
    say(`D Import dialog text: ${J((await body()).split("\n").filter(Boolean).slice(-14))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });
  await step("S-12 dialog", async () => {
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(800);
    say(`D Import Word dialog text: ${J((await body()).split("\n").filter(Boolean).slice(-14))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });
  const fx = path.join(run.dir, "fixtures"); mkdirSync(fx);
  const { cpSync } = await import("node:fs");
  cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "multi-heading.docx"));
  cpSync(path.join(REPO, "frontend/tests/fixtures/scrivener/sample.scriv"), path.join(fx, "sample.scriv"), { recursive: true });
  {
    const JSZip = createRequire(path.join(REPO, "frontend/package.json"))("jszip");
    const zip = await JSZip.loadAsync(readFileSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx")));
    const doc = await zip.file("word/document.xml").async("string");
    const open = doc.match(/<w:document[^>]*>/)[0];
    const p = (style, t) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${t}</w:t></w:r></w:p>`;
    const bodyXml = ["Alpha", "Beta", "Gamma"].map((n) => p("Heading1", `Chapter ${n}`) + p(null, `${n} body text.`)).join("");
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${open}<w:body>${bodyXml}</w:body></w:document>`);
    writeFileSync(path.join(fx, "three-chapters.docx"), await zip.generateAsync({ type: "nodebuffer" }));
  }
  const rootList = async () => { const t = await body(); const a = t.indexOf("RESOURCES"); const b = t.indexOf("SMART FOLDERS"); return t.slice(a, b).split("\n").filter(Boolean); };
  const stubPicker = (p) => h.app.evaluate(({ dialog }, pp) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pp] }); }, p);
  const dialogLines = async () => (await body()).split("\n").filter(Boolean).slice(-16);
  const wordImport = async (typeValue, file) => {
    await stubPicker(path.join(fx, file));
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE DOCUMENT')");
    await page.waitForTimeout(1200);
    if (typeValue) await page.locator("select").nth(1).selectOption(typeValue);
    say(`D Word import dialog before Start: ${J(await dialogLines())}`);
    say(`D Word import dialog options: split ${J(await page.$$eval("select", (ss) => ss.map((s) => [...s.options].map((o) => o.value + "=" + o.textContent))))}`);
    await page.click("button[type=submit]");
    await page.waitForTimeout(7000);
    say(`D Word import (type ${typeValue || "default"}) after Start: ${J((await dialogLines()).slice(-8))}`);
  };
  const fullDialog = async () => page.$$eval("[role=dialog], dialog", (ds) => ds.map((d) => d.innerText.split("\n").filter(Boolean)));
  await step("S-13 word import", async () => { await wordImport(null, "three-chapters.docx"); });
  await step("S-13 report", async () => {
    say(`D Word import result dialog (full): ${J((await fullDialog()).map((d) => d.map((l) => l.replace(run.dir, "<run-dir>"))))}`);
    await page.getByRole("button", { name: /open project/i }).first().click();
    await page.waitForTimeout(3000);
    await expandAll(page);
    say(`D Word import opened project: header ${J((await body()).split("\n").filter(Boolean).slice(2, 4))}; tree (resource names) ${J(await rootList())}`);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
    say(`D start page after Word import: ${J((await body()).split("\n").filter(Boolean).filter((l) => /ACTIVE|ASSETS|FOLDERS|resource|multi/i.test(l)))}`);
  });
  const projList = () => readdirSync(h.projectsDir).map((d) => { try { return JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")).name; } catch { return "?"; } });
  say(`D projects dir after Word import (project.json names): ${J(projList())}`);
  await step("S-11 scrivener import", async () => {
    await stubPicker(path.join(fx, "sample.scriv"));
    await page.click("button[aria-label='Import from Scrivener'], button:has-text('Import from Scrivener')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE SCRIVENER PROJECT')");
    await page.waitForTimeout(1500);
    say(`D Scrivener import after picking: ${J((await fullDialog()))}`);
    say(`D Scrivener controls: ${J(await page.$$eval("[role=dialog] button, [role=dialog] input, [role=dialog] select, dialog button, dialog input, dialog select", (e) => e.map((x) => x.tagName + ":" + (x.type||"") + ":" + (x.value || x.textContent || "").trim().slice(0, 40))))}`);
    await page.click("button[type=submit]");
    await page.waitForTimeout(8000);
    say(`D Scrivener import result dialog (full): ${J(await fullDialog())}`);
    say(`D Scrivener buttons: ${J(await page.$$eval("button", (e) => e.map((x) => (x.textContent || "").trim()).filter(Boolean)))}`);
    await page.getByRole("button", { name: /open project/i }).first().click();
    await page.waitForTimeout(3000);
    await expandAll(page);
    say(`D Scrivener import opened project: header ${J((await body()).split("\n").filter(Boolean).slice(2, 4))}; tree ${J(outline(await treeRows(page)))}`);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
  });
  say(`D projects dir after Scrivener import (project.json names): ${J(projList())}`);
  await step("S-12 folder import", async () => {
    const folder = path.join(fx, "docx-folder"); mkdirSync(folder);
    cpSync(path.join(fx, "three-chapters.docx"), path.join(folder, "a-one.docx"));
    cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(folder, "b-two.docx"));
    await stubPicker(folder);
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE FOLDER')");
    await page.waitForTimeout(1200);
    say(`D Word folder import after picking: ${J((await dialogLines()).slice(-8))}`);
    await page.click("button[type=submit]");
    await page.waitForTimeout(7000);
    say(`D Word folder import result (first lines): ${J((await fullDialog())[0].slice(0, 4))}`);
    await page.getByRole("button", { name: /open project/i }).first().click();
    await page.waitForTimeout(3000);
    await expandAll(page);
    say(`D Word folder import opened project: tree ${J(await rootList())}`);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
  });
  await step("S-14/16", async () => {
    await page.click('button[aria-label="App Settings"]');
    await page.waitForTimeout(800);
    say(`D App Settings dialog lines (noise-word part): ${J((await body()).split("\n").filter(Boolean).filter((l) => /App Settings|Settings here|noise|No login|Add/i.test(l)))}`);
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("desktopword");
    await page.click("[role=dialog] button:has-text('Add'), dialog button:has-text('Add')");
    await page.waitForTimeout(800);
    say(`D App Settings list after add: ${J((await body()).split("\n").filter(Boolean).filter((l) => /desktopword|zorblat|quillfeather|No noise words/.test(l)))}`);
    await page.click("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')");
  });
  await step("P-12 desktop", async () => {
    await page.click('button[aria-label="Open project settings menu"]');
    await page.waitForTimeout(400);
    say(`D gear menu: ${J(await page.$$eval("[role=menuitem]", (e) => e.map((x) => x.textContent.trim())))}`);
    await page.click("text=Project Type Manager");
    await page.waitForTimeout(1500);
    say(`D Project Type Manager buttons: ${J(await page.$$eval("[role=dialog] button, dialog button", (e) => e.map((x) => (x.textContent || "").trim().slice(0, 30)).filter(Boolean)))}`);
    say(`D Project Type Manager header: ${J((await body()).split("\n").filter(Boolean).filter((l) => /Project Type Management|View, create/.test(l)))}`);
    await page.click("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')");
  });
  say(`D projects dir (throwaway fake root) entries: ${readdirSync(h.projectsDir).length}`);
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  if (h) {
    const o = await stopDesktop(h);
    say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited after app.close"}`);
    say(`listener on 7340 after stop: ${o.listenersOnApp}; throwaway log folder removed: ${o.logDirRemoved}`);
  }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
