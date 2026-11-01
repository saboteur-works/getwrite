// Handbook re-run, group 2 (OQ-8), desktop (Electron dev, fake root): the write-page statements checked in the
// desktop window, including typing then closing the window within the autosave wait. Run OUTSIDE the sandbox.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRun, cleanupRun, say, preflight, protectedPortsState, repoProjectsStatus, errLine, sleep } from "./lib/safety.mjs";
import { startDesktop, stopDesktop } from "./desktop-dev.mjs";
import { expandAll } from "./task3-lib.mjs";

const J = (x) => JSON.stringify(x);
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
const pm = (page) => page.locator(".ProseMirror").first();
const dlg = (page) => page.locator("[role=dialog]").first();
const lines = async (page) => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter(Boolean);

say(`ports before: ${preflight([7340])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
const run = createRun("g2-desk");
let h;
const stop = async () => { if (!h) return; const o = await stopDesktop(h); say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited"}; listener on 7340 after: ${o.listenersOnApp}`); h = null; };
const textOf = () => {
  const dir = path.join(h.projectsDir, readdirSync(h.projectsDir)[0]);
  const out = {};
  for (const id of readdirSync(path.join(dir, "resources"))) { const p = path.join(dir, "resources", id, "content.txt"); out[id.slice(0, 6)] = existsSync(p) ? readFileSync(p, "utf8").trim() : null; }
  return { dir, out };
};
const openDoc = async (page, title) => { await expandAll(page); await page.click(`text=${title} >> nth=0`); await page.waitForTimeout(1500); };
const createDoc = async (page, title) => {
  await page.click('button[aria-label="Workspace options"]');
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text]").first().fill(title);
  await page.locator("[role=dialog] button:has-text('Create')").last().click();
  await page.waitForTimeout(2500);
};
const reopenAfterRestart = async (page) => { await page.waitForTimeout(1500); await page.click('button[aria-label="Open Desk Test"]'); await page.waitForTimeout(2500); await openDoc(page, "Doc One"); };
try {
  h = await startDesktop(run);
  let page = h.page;
  say(`A electron pid ${h.app.process().pid}; isPackaged=${h.info.packaged}; userData throwaway=${h.sameUd}`);
  await page.waitForTimeout(1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Desk Test");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  await createDoc(page, "Doc One");
  await openDoc(page, "Doc One");
  await step("format", async () => {
    await pm(page).click(); await page.keyboard.type("Plain words here today");
    for (const [k, l] of [["B", "bold"], ["I", "italic"], ["U", "underline"]]) {
      await pm(page).locator("p").first().click({ clickCount: 3 });
      await page.keyboard.press(`Meta+${k}`); await page.waitForTimeout(200);
      say(`Cmd+${k} (${l}): ${(await page.evaluate(() => document.querySelector(".ProseMirror").innerHTML)).replace(/<p[^>]*>/g, "<p>")}`);
      await page.keyboard.press(`Meta+${k}`); await page.waitForTimeout(200);
    }
    for (const label of ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"]) {
      await pm(page).locator("p").first().click({ clickCount: 3 });
      await page.click(`button[aria-label="${label}"]`); await page.waitForTimeout(200);
      say(`${label} button: ${(await page.evaluate(() => document.querySelector(".ProseMirror").innerHTML)).replace(/<p[^>]*>/g, "<p>")}`);
      await pm(page).locator("p").first().click({ clickCount: 3 });
      await page.click(`button[aria-label="${label}"]`); await page.waitForTimeout(200);
    }
    say(`footer: ${J((await lines(page)).filter((l) => /^Words:|^Today|saved/i.test(l)))}`);
  });
  await step("search", async () => {
    for (const k of ["Meta+K", "Control+K"]) {
      await page.locator("h1,h2,body").first().click({ position: { x: 2, y: 2 } }).catch(() => {});
      await page.keyboard.press(k); await page.waitForTimeout(500);
      say(`${k}: focused=${J(await page.evaluate(() => { const e = document.activeElement; return [e.tagName, e.getAttribute("placeholder"), e.getAttribute("aria-label")]; }))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      await pm(page).click();
    }
  });
  await step("headings-body", async () => {
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await page.waitForTimeout(800);
    await dlg(page).locator('[role=tab]:has-text("Editor")').click(); await page.waitForTimeout(500);
    await dlg(page).locator('[aria-label="H1 Font Size"]').fill("60");
    await dlg(page).getByRole("button", { name: "Save Changes" }).first().click(); await page.waitForTimeout(1200);
    await dlg(page).locator('[aria-label="Body Font Size"]').fill("18");
    await dlg(page).getByRole("button", { name: "Save Changes" }).nth(1).click(); await page.waitForTimeout(1200);
    const cfg = JSON.parse(readFileSync(path.join(textOf().dir, "project.json"), "utf8")).config.editorConfig;
    say(`after a heading save then a body save: headings.h1=${J(cfg.headings?.h1)} body=${J(cfg.body)}`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  });
  await step("writing-log", async () => {
    await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" more"); await page.waitForTimeout(4500);
    say(`footer: ${J((await lines(page)).filter((l) => /^Words:|^Today|saved/i.test(l)))}`);
    await page.click("button:has-text(\"Today's writing\")"); await page.waitForTimeout(700);
    say(`Today's writing window: ${J((await dlg(page).innerText()).split("\n").filter(Boolean))}`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  });
  await step("close-window-within-wait", async () => {
    await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" lastwords");
    await page.waitForTimeout(100);
    const proc = h.app.process();
    await h.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); });
    await sleep(6000);
    say(`typed then closed the window 100ms later (switch off): app exited=${proc.exitCode !== null || proc.signalCode !== null}; files=${J(textOf().out)}`);
  });
  await stop().catch((e) => say(`A stop: ${errLine(e)}`));
  h = await startDesktop(run, { reuse: true });
  page = h.page;
  await step("after-restart", async () => {
    await reopenAfterRestart(page);
    say(`B after restart: editor text=${J(await pm(page).innerText())}; files=${J(textOf().out)}`);
  });
  await step("quit-within-wait", async () => {
    await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" quitwords");
    await page.waitForTimeout(100);
    const proc = h.app.process();
    await h.app.evaluate(({ app }) => { app.quit(); });
    await sleep(6000);
    say(`typed then quit 100ms later: app exited=${proc.exitCode !== null || proc.signalCode !== null}; files=${J(textOf().out)}`);
  });
  await stop().catch((e) => say(`B stop: ${errLine(e)}`));
} catch (e) {
  say(`SCRIPT ERROR ${errLine(e)}`);
} finally {
  await stop().catch(() => {});
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
}
process.exit(0);
