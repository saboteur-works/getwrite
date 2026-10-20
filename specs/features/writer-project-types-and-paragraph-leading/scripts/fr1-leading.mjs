#!/usr/bin/env node
/**
 * Feature 90 Task 2 (FR-1): paragraph leading across save and reopen, on the
 * UNCHANGED tree. Web dev server only; no Electron.
 *
 * Usage: node fr1-leading.mjs <scratch-root> <base-url>
 *   <scratch-root>  the throwaway root; the dev server must have been started with
 *                   GETWRITE_PROJECTS_DIR=<scratch-root>/projects (the harness asserts
 *                   that every project the server reports lives under it before it
 *                   drives any page, and exits otherwise).
 *
 * Reads files only under <scratch-root>/projects. Never reads or lists the repo's
 * projects/, ~/Library/Application Support/{getwrite-electron,GetWrite},
 * ~/Library/Logs/*, or ~/Documents/GetWrite. Prints one JSON object of observed values.
 * Run OUTSIDE the command sandbox (it talks to a local dev server).
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "/Users/jedaisaboteur/Repositories/getwrite/frontend/node_modules/playwright/index.mjs";

const [scratchArg, base] = process.argv.slice(2);
if (!scratchArg || !base) { console.error("usage: fr1-leading.mjs <scratch-root> <base-url>"); process.exit(2); }

const FORBIDDEN = ["getwrite-electron", "Library/Application Support/GetWrite", "Library/Logs", "Documents/GetWrite", "/getwrite/projects"];
const root = realpathSync(scratchArg);
const projectsRoot = path.join(root, "projects");
const tmp = realpathSync(os.tmpdir());
if (!(root.startsWith(tmp + path.sep) || root.startsWith("/private/tmp/")) || FORBIDDEN.some((f) => root.includes(f))) {
  console.error("throwaway root assertion failed"); process.exit(5);
}

const out = { base, root, projectsRoot };
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
};

// ---- assertion BEFORE the first mutating request: every project the server lists lives under the throwaway root
{
  const list = await api("GET", "/api/projects");
  const paths = (Array.isArray(list.json) ? list.json : []).map((p) => p?.project?.rootPath);
  out.preexistingProjectRootPaths = paths;
  if (list.status !== 200 || !paths.every((p) => typeof p === "string" && realpathSync(p).startsWith(projectsRoot + path.sep))) {
    console.error("server projects folder is not the throwaway root; stopping"); process.exit(5);
  }
}

// ---- throwaway projects
const mk = async (name, lineHeight) => {
  const r = await api("POST", "/api/projects", { name, projectType: "blank" });
  const proj = r.json.project;
  if (!realpathSync(proj.rootPath).startsWith(projectsRoot + path.sep)) { console.error("created project outside throwaway root"); process.exit(5); }
  if (lineHeight) {
    const u = await api("POST", "/api/project/editor-config", { projectId: path.basename(proj.rootPath), body: { lineHeight } });
    out[`editorConfigUpdate_${name}`] = { status: u.status };
  }
  const pj = JSON.parse(readFileSync(path.join(proj.rootPath, "project.json"), "utf8"));
  return { name, rootPath: proj.rootPath, bodyLineHeightOnDisk: pj.config?.editorConfig?.body?.lineHeight ?? null };
};
const A = await mk("T2 Main");
const B = await mk("T2 Body22", "2.2");
out.projects = { A: { name: A.name, bodyLineHeightOnDisk: A.bodyLineHeightOnDisk }, B: { name: B.name, bodyLineHeightOnDisk: B.bodyLineHeightOnDisk } };

// ---- disk readers (throwaway only)
const walk = (d, acc = []) => { for (const e of readdirSync(d)) { const f = path.join(d, e); (statSync(f).isDirectory() ? walk(f, acc) : acc.push(f)); } return acc; };
const paras = (node, acc = []) => {
  if (node && node.type === "paragraph") acc.push({ text: (node.content ?? []).map((c) => c.text ?? "").join(""), has: node.attrs ? Object.prototype.hasOwnProperty.call(node.attrs, "paragraphLeading") : false, type: node.attrs && node.attrs.paragraphLeading !== undefined ? (node.attrs.paragraphLeading === null ? "null" : typeof node.attrs.paragraphLeading) : "absent", literal: node.attrs && node.attrs.paragraphLeading !== undefined ? JSON.stringify(node.attrs.paragraphLeading) : null });
  for (const c of node?.content ?? []) paras(c, acc);
  return acc;
};
const diskDump = (proj) => {
  const files = walk(proj.rootPath).filter((f) => f.endsWith(".tiptap.json"));
  return files.map((f) => {
    const rel = path.relative(proj.rootPath, f);
    let doc; try { doc = JSON.parse(readFileSync(f, "utf8")); } catch (e) { return { rel, error: "unparseable" }; }
    return { rel, paragraphs: paras(doc.doc ?? doc) };
  });
};
const revDump = (proj) => walk(proj.rootPath).filter((f) => f.endsWith("/metadata.json") && /\/revisions\//.test(f)).map((f) => {
  const m = JSON.parse(readFileSync(f, "utf8"));
  let doc; try { doc = JSON.parse(readFileSync(path.join(path.dirname(f), "content.bin"), "utf8")); } catch { doc = null; }
  return { rel: path.relative(proj.rootPath, path.dirname(f)), versionNumber: m.versionNumber, isCanonical: m.isCanonical, paragraphs: doc ? paras(doc.doc ?? doc) : "unparseable" };
});
const revisionMeta = (proj) => walk(proj.rootPath).filter((f) => /revisions\/.*\.(json)$/.test(f) && !f.endsWith(".tiptap.json")).map((f) => ({ rel: path.relative(proj.rootPath, f), body: readFileSync(f, "utf8").slice(0, 400) }));

// ---- browser
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleLines = [];
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
const pm = page.locator(".ProseMirror").first();
const domLeading = () => page.$$eval(".ProseMirror p", (ps) => ps.map((p) => ({ text: p.textContent, inline: p.style.lineHeight || "", computed: getComputedStyle(p).lineHeight, fontSize: getComputedStyle(p).fontSize })));
const fieldValue = () => page.locator('input[aria-label="Line Height"]').first().inputValue();
const openProject = async (name) => {
  await page.goto(base + "/"); await page.waitForTimeout(2500);
  await page.click(`button[aria-label="Open ${name}"]`); await page.waitForTimeout(3000);
};
const expandAll = async () => { for (let i = 0; i < 40; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await page.waitForTimeout(150); } };
const openResource = async (title) => {
  const ti = page.locator(`[role=treeitem][aria-label="${title}"]`);
  if (!(await ti.count())) await expandAll();
  if (await ti.count()) await ti.first().click(); else await page.click(`text=${title} >> nth=0`);
  await page.waitForTimeout(2500);
};
const createResource = async (title) => {
  await page.click('button[aria-label="Workspace options"]');
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
  await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
  await page.waitForTimeout(2500);
};
const clickPara = async (i) => { await page.locator(".ProseMirror p").nth(i).click(); await page.waitForTimeout(400); };
const AUTOSAVE_WAIT = 5000;

try {
  // ===== Project A: three paragraphs
  await openProject(A.name);
  await createResource("Doc");
  await openResource("Doc");
  await pm.click();
  await page.keyboard.insertText("First paragraph.");
  await page.keyboard.press("Enter"); await page.keyboard.insertText("Second paragraph.");
  await page.keyboard.press("Enter"); await page.keyboard.insertText("Third paragraph.");
  await page.waitForTimeout(AUTOSAVE_WAIT);
  out.A_afterTyping = { dom: await domLeading(), disk: diskDump(A) };

  // a non-canonical revision, created through the revision route from the stored content (no content in the body)
  {
    const rid = diskDump(A)[0].rel.split("/")[1];
    const r = await api("POST", `/api/resource/revision/${rid}`, { projectId: path.basename(A.rootPath), isCanonical: false, metadata: { name: "T2 non-canonical" } });
    out.A_createNonCanonicalRevision = { status: r.status, versionNumber: r.json?.versionNumber, isCanonical: r.json?.isCanonical };
    out.A_revisionsAfterCreate = revDump(A);
  }

  await clickPara(1);
  out.A_fieldShownInPara2BeforeEdit = await fieldValue();
  const lh = page.locator('input[aria-label="Line Height"]').first();
  await lh.fill("1.2"); await page.waitForTimeout(500);
  out.A_afterSet = { dom: await domLeading() };
  await page.waitForTimeout(AUTOSAVE_WAIT);
  out.A_afterSetAndAutosave = { dom: await domLeading(), disk: diskDump(A), revisions: revDump(A) };

  // (d) a paragraph created after opening: Enter at the end of the third paragraph
  // (done in a second step after reopen too, so the pre-reopen stored values stay comparable)
  // ===== close and reopen: full page reload, project reopened, resource reopened
  await page.goto(base + "/"); await page.waitForTimeout(1500);
  await openProject(A.name);
  await openResource("Doc");
  await page.waitForTimeout(1500);
  out.A_afterReopen = { dom: await domLeading(), disk: diskDump(A), revisions: revDump(A) };
  await page.waitForTimeout(AUTOSAVE_WAIT);
  out.A_afterReopenPlusWait = { disk: diskDump(A) };

  // ===== (d) Enter at end of third paragraph
  await clickPara(2);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter"); await page.keyboard.insertText("Fourth paragraph, created after opening.");
  await page.waitForTimeout(AUTOSAVE_WAIT);
  out.A_afterNewParagraph = { dom: await domLeading(), disk: diskDump(A), revisions: revDump(A) };

  // revision file listing for the record
  out.A_revisionFileList = walk(A.rootPath).map((f) => path.relative(A.rootPath, f)).filter((f) => f.startsWith("revisions"));

  // ===== Project B: body line height 2.2
  await openProject(B.name);
  await createResource("Doc");
  await openResource("Doc");
  await pm.click();
  await page.keyboard.insertText("Only paragraph in the 2.2 project.");
  await page.keyboard.press("Enter"); await page.keyboard.insertText("Second one.");
  await page.waitForTimeout(AUTOSAVE_WAIT);
  out.B_afterTyping = { dom: await domLeading(), disk: diskDump(B) };
  await page.goto(base + "/"); await page.waitForTimeout(1500);
  await openProject(B.name);
  await openResource("Doc");
  await page.waitForTimeout(1500);
  out.B_afterReopen = { dom: await domLeading(), disk: diskDump(B), revisions: revDump(B) };
} catch (e) {
  out.harnessError = String(e && e.message).split("\n")[0];
  await page.screenshot({ path: path.join(root, "error.png") }).catch(() => {});
}
out.pageErrors = consoleLines;
await browser.close();
console.log(JSON.stringify(out, null, 2));
