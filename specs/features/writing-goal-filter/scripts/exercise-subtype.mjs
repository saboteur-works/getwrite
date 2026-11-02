// Runs FR-43 (Subtype field) in the built web server as a writer would, on a throwaway projects folder.
// Usage: node exercise-subtype.mjs <screenshot-dir>. Run OUTSIDE the sandbox, after pnpm build and copying .next/static.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, cleanupRun, createRun, say } from "../../user-handbook/scripts/lib/safety.mjs";
import { startWeb, stopWeb } from "../../user-handbook/scripts/web-standalone.mjs";

const { chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const J = (x) => JSON.stringify(x);
const SHOTS = process.argv[2];
mkdirSync(SHOTS, { recursive: true });
const run = createRun("g98-subtype");
const web = await startWeb(run);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const wait = (ms) => page.waitForTimeout(ms);
const dlg = () => page.locator("[role=dialog]").first();
const lines = async () => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter(Boolean);
const footer = async () => (await lines()).filter((l) => /^Today|Counting selected|No documents match|unavailable|incomplete/i.test(l));
const pm = () => page.locator(".ProseMirror").first();
const expandAll = async () => { for (let i = 0; i < 10; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await wait(150); } };
const open = async (t) => { await expandAll(); await page.locator(`[role=treeitem]:has-text("${t}")`).first().click(); await wait(1500); };
const create = async (t) => { await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')"); await page.locator("[role=dialog] input[type=text]").first().fill(t); await page.locator("[role=dialog] button:has-text('Create')").last().click(); await wait(2500); };
const settings = async (tab) => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await wait(800); await dlg().locator(`[role=tab]:has-text("${tab}")`).click(); await wait(500); };
const closeDlg = async () => { await page.keyboard.press("Escape"); await wait(500); };
const section = () => dlg().locator("section[aria-labelledby='goal-filter-heading']");
const setSubtype = async (doc, label) => { await open(doc); await page.locator('[aria-label="Subtype"]').first().selectOption({ label }); await wait(1200); };
const chooseSubtypeField = async (scope) => {
  await scope.locator("button[aria-label*='ield' i]").first().click(); await wait(300);
  await page.fill('[aria-label="Search fields"]', "subtype"); await wait(300);
  const opts = await page.locator('[aria-label="Select a field"] [role=option]').allInnerTexts();
  say(`field picker, searching "subtype": ${J(opts)}`);
  await page.locator('[aria-label="Select a field"] [role=option]').first().click(); await wait(400);
};
let code = 0;
try {
  await page.goto(web.baseUrl); await wait(1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await wait(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Goals");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await wait(2500);
  await create("Keep"); await create("Skip");
  await open("Keep"); await pm().click(); await page.keyboard.type("one two three four five"); await wait(4000);
  await open("Skip"); await pm().click(); await page.keyboard.type("six seven eight"); await wait(4000);

  await settings("Metadata");
  for (const label of ["Scene", "Outline"]) { await page.fill("#subtype-new", label); await dlg().getByRole("button", { name: /^add/i }).first().click(); await wait(800); }
  await closeDlg();
  await setSubtype("Keep", "Scene"); await setSubtype("Skip", "Outline");

  await settings("Writing Goals");
  await dlg().getByLabel("Daily word goal").fill("20"); await dlg().getByRole("button", { name: /save daily goal/i }).click(); await wait(800);
  await closeDlg();
  say(`footer with no filter: ${J(await footer())}`);

  await settings("Writing Goals");
  await section().getByRole("button", { name: /add group/i }).click(); await wait(400);
  await chooseSubtypeField(section());
  const value = section().locator('[aria-label="Value"]').first();
  say(`Value options: ${J(await value.locator("option").allInnerTexts())}`);
  await value.selectOption({ label: "Scene" }); await wait(300);
  await page.screenshot({ path: path.join(SHOTS, "goal-filter-subtype.png") });
  await section().getByRole("button", { name: "Save goal filter" }).click(); await wait(1200);
  say(`after save: status=${J(await section().locator("[role=status]").allInnerTexts())}; alert=${J(await section().locator("[role=alert]").allInnerTexts())}`);
  const dirName = readdirSync(web.projectsDir)[0];
  say(`stored: ${J(JSON.parse(readFileSync(path.join(web.projectsDir, dirName, "project.json"), "utf8")).config.goalFilter)}`);
  await closeDlg();
  await open("Keep"); await wait(1000);
  say(`footer with Subtype is Scene: ${J(await footer())}`);
  await page.screenshot({ path: path.join(SHOTS, "footer-filtered.png") });

  await setSubtype("Skip", "Scene"); await wait(1000);
  say(`footer after giving Skip the subtype Scene: ${J(await footer())}`);
  await setSubtype("Skip", "Outline"); await wait(1000);
  say(`footer after setting Skip back to Outline: ${J(await footer())}`);

  await settings("Writing Goals");
  const chip = await section().innerText();
  say(`reopened tab mentions Subtype: ${/subtype/i.test(chip)}; Value=${await section().locator('[aria-label="Value"]').first().inputValue()}`);
  await closeDlg();

  const query = await page.evaluate(async ([id]) => {
    const r = await fetch("/api/project/query/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: id, definition: { op: "eq", field: "resourceSubtype", value: "Outline" } }) });
    return { status: r.status, body: await r.text() };
  }, [dirName]);
  say(`smart-folder query route, Subtype is Outline: ${query.status} ${query.body.slice(0, 200)}`);

  await page.click('button[aria-label="Workspace options"]'); await wait(300);
  say(`workspace menu: ${J(await page.locator(".resource-context-menu-item").allInnerTexts())}`);
  await page.locator(".resource-context-menu-item", { hasText: /smart folder/i }).first().click(); await wait(1200);
  say(`after Workspace menu > New Smart Folder: builder open=${await page.getByRole("button", { name: /add group/i }).count()}; selected resources header=${J((await lines()).slice(0, 4))}`);
  say(`smart folder buttons: ${J(await page.locator("button[aria-label*='smart' i], button[aria-label*='query' i]").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label"))))}`);
  await page.locator("button[aria-label*='smart' i], button[aria-label*='query' i]").first().click(); await wait(1200);
  await page.getByRole("button", { name: /add group/i }).first().click(); await wait(400);
  await chooseSubtypeField(page.locator("main, body").first());
  say(`smart-folder builder Value options: ${J(await page.locator('[aria-label="Value"]').first().locator("option").allInnerTexts())}`);
  await page.screenshot({ path: path.join(SHOTS, "smart-folder-subtype.png") });
} catch (e) {
  code = 1;
  say(`ERROR ${String(e.message).split("\n").slice(0, 4).join(" | ")}`);
  await page.screenshot({ path: path.join(SHOTS, "error.png") }).catch(() => {});
} finally {
  await browser.close();
  say(`server stop: ${J((await stopWeb(web)).listenersOnPort)}`);
  cleanupRun(run);
}
process.exit(code);
