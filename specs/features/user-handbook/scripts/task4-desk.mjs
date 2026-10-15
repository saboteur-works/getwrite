// Task 4, desktop (Electron dev, fake root): imports show on the Imported line of Today's writing (W-36, W-37). Run OUTSIDE the sandbox.
import { readdirSync, readFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import path from "node:path";
import { REPO, createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
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
  await page.waitForTimeout(2000);
  const fx = path.join(run.dir, "fixtures"); mkdirSync(fx);
  cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "multi-heading.docx"));
  cpSync(path.join(REPO, "frontend/tests/fixtures/scrivener/sample.scriv"), path.join(fx, "sample.scriv"), { recursive: true });
  const stubPicker = (p) => h.app.evaluate(({ dialog }, pp) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pp] }); }, p);
  const dialogNums = async () => {
    await page.click("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(800);
    const t = (await page.locator("[role=dialog]").innerText()).split("\n").filter((l) => /Added|Deleted|Net|Imported|incomplete|Daily|No daily|unavailable/.test(l));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return t;
  };
  const dayEntries = (name) => { for (const d of readdirSync(h.projectsDir)) { const pj = JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")); if (pj.name !== name) continue; const dir = path.join(h.projectsDir, d, "meta", "writing-log"); if (!existsSync(dir)) return "(no meta/writing-log)"; return readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")).entries.map((e) => ({ file: f, ...e }))); } return "(project not found)"; };
  const openFirstResource = async (pick) => {
    await expandAll(page);
    const t = await body();
    const list = t.slice(t.indexOf("RESOURCES"), t.indexOf("SMART FOLDERS")).split("\n").filter(Boolean).slice(1);
    say(`   tree text ${J(list)}`);
    await page.locator(`text=${pick || list[0]}`).nth(0).click();
    await page.waitForTimeout(1800);
  };
  const closeProject = async () => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Close Project"); await page.waitForTimeout(1500); };
  await step("docx", async () => {
    if (process.argv[2] === "scriv") return;
    await stubPicker(path.join(fx, "multi-heading.docx"));
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE DOCUMENT')");
    await page.waitForTimeout(1200);
    await page.click("button[type=submit]");
    await page.waitForTimeout(7000);
    await page.getByRole("button", { name: /open project/i }).first().click();
    await page.waitForTimeout(3000);
    const name = (await body()).split("\n").filter(Boolean)[2];
    say(`W-36 docx import opened project ${J(name)}; day entries ${J(dayEntries(name))}`);
    await openFirstResource();
    say(`W-36 docx import project: dialog ${J(await dialogNums())}; footer ${J((await body()).split("\n").filter((l) => /^Today/.test(l)))}`);
    await closeProject();
  });
  await step("scriv", async () => {
    await stubPicker(path.join(fx, "sample.scriv"));
    await page.click("button[aria-label='Import from Scrivener'], button:has-text('Import from Scrivener')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE SCRIVENER PROJECT')");
    await page.waitForTimeout(1500);
    await page.click("button[type=submit]");
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /open project/i }).first().click();
    await page.waitForTimeout(3000);
    const name = (await body()).split("\n").filter(Boolean)[2];
    say(`W-36 scrivener import opened project ${J(name)}; day entries ${J(dayEntries(name))}`);
    await openFirstResource("Scene One");
    say(`W-36 scrivener import project: dialog ${J(await dialogNums())}; footer ${J((await body()).split("\n").filter((l) => /^Today/.test(l)))}`);
    await closeProject();
  });
} catch (e) {
  say("SCRIPT ERROR(outer) " + errLine(e));
} finally {
  if (h) {
    const o = await stopDesktop(h);
    say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited after app.close"}`);
    say(`listener on 7340 after stop: ${o.listenersOnApp}; throwaway log folder removed: ${o.logDirRemoved}`);
  }
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
