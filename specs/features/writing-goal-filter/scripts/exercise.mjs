// Runs Feature 98 in a packaged build as a writer would, on a throwaway profile and projects folder.
// Usage: node exercise.mjs <app-path> <screenshot-dir>. Run OUTSIDE the sandbox.
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, Recorder, cleanupRun, createRun, errLine, preflight, protectedPortsState, repoProjectsStatus, say, sleep } from "../../user-handbook/scripts/lib/safety.mjs";

const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const J = (x) => JSON.stringify(x);
const APP = path.resolve(process.argv[2]);
const SHOTS = process.argv[3];
say(`ports before: ${preflight([7340])}`);
const run = createRun("g98-exercise");
const projectsDir = path.join(run.dir, "projects"); mkdirSync(projectsDir);
const userData = path.join(run.dir, "userdata"); mkdirSync(userData);
writeFileSync(path.join(userData, "workspace.json"), J({ projectsDir }));
const app = await _electron.launch({ executablePath: path.join(APP, "Contents/MacOS/GetWrite"), args: [`--user-data-dir=${userData}`], timeout: 60000 });
const rec = new Recorder(); rec.add(app.process().pid, "main");
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); await page.screenshot({ path: path.join(SHOTS, `error-${id}.png`) }).catch(() => {}); for (let i = 0; i < 3 && (await page.locator("[role=dialog]").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); } } };
let page;
const lines = async () => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter(Boolean);
const footer = async () => (await lines()).filter((l) => /^Today|Counting selected|No documents match|unavailable|incomplete/i.test(l));
const dlg = () => page.locator("[role=dialog]").first();
const openGoals = async () => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await page.waitForTimeout(800); await dlg().locator('[role=tab]:has-text("Writing Goals")').click(); await page.waitForTimeout(500); };
const closeDlg = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(500); };
const section = () => dlg().locator("section[aria-labelledby='goal-filter-heading']");
const pm = () => page.locator(".ProseMirror").first();
const expandAll = async () => { for (let i = 0; i < 10; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await page.waitForTimeout(150); } };
const open = async (t) => { await expandAll(); await page.locator(`[role=treeitem]:has-text("${t}")`).first().click(); await page.waitForTimeout(1500); };
const create = async (t) => { await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')"); await page.locator("[role=dialog] input[type=text]").first().fill(t); await page.locator("[role=dialog] button:has-text('Create')").last().click(); await page.waitForTimeout(2500); };
const dataView = async (id) => { await page.click("button:has-text('DATA'), [role=tab]:has-text('DATA'), a:has-text('DATA')"); await page.waitForTimeout(1500); say(`${id} Data view goal area: ${J((await lines()).filter((l) => /words?\b.*\d|\d.*words?|Counting selected|No documents match|Total word count|goal/i.test(l)).slice(0, 8))}`); };
const edit = async () => { await page.click("button:has-text('EDIT'), [role=tab]:has-text('EDIT')"); await page.waitForTimeout(1000); };
const setStatus = async (doc, label) => { await open(doc); const s = page.locator('[aria-label="status"]').first(); await s.selectOption({ label }); await page.waitForTimeout(1200); };
try {
  page = await app.firstWindow();
  for (let i = 0; i < 60; i++) { if (page.url().startsWith("http://localhost:7340") && (await page.evaluate(() => document.readyState)) === "complete") break; await sleep(500); }
  page.on("response", async (r) => { if (r.url().includes("goal-filtered-total")) say(`  [goal-filtered-total] ${r.status()} ${await r.text().catch(() => "(no body)")}`); });
  page.on("console", (m) => { if (m.type() === "error" && /goal|transport|valid/i.test(m.text())) say(`  [console] ${m.text().slice(0, 300)}`); });
  await page.waitForTimeout(1500); rec.walk(process.pid);
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), v: a.getVersion() }));
  if (realpathSync(info.ud) !== realpathSync(userData)) throw new Error("userData is not the throwaway folder");
  await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Goals");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
  await create("Keep"); await create("Skip");
  await open("Keep"); await pm().click(); await page.keyboard.type("one two three four five"); await page.waitForTimeout(4000);
  await open("Skip"); await pm().click(); await page.keyboard.type("six seven eight"); await page.waitForTimeout(4000);
  const statusOpts = await page.locator('[aria-label="status"]').first().evaluate((s) => [...s.options].map((o) => o.textContent)).catch((e) => `no status select: ${e.message.split("\n")[0]}`);
  say(`status options: ${J(statusOpts)}`);
  const [a, b] = statusOpts.filter((o) => o && !/select|none|unset/i.test(o));
  await step("goals", async () => {
    await openGoals();
    await dlg().getByLabel("Daily word goal").fill("20"); await dlg().getByRole("button", { name: /save daily goal/i }).click(); await page.waitForTimeout(800);
    await dlg().getByLabel("Total word-count goal").fill("100"); await dlg().getByRole("button", { name: /save.*word-count goal|save word count|save total/i }).first().click(); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, "tab-empty.png") });
    say(`tab text: ${J((await section().innerText()).split("\n").filter(Boolean).slice(0, 14))}`);
    await closeDlg();
  });
  say(`baseline footer: ${J(await footer())}`);
  await step("baseline-data", async () => { await dataView("baseline"); await edit(); });
  await step("statuses", async () => { await setStatus("Keep", a); await setStatus("Skip", b); });
  await step("set-filter", async () => {
    await openGoals();
    await section().getByRole("button", { name: /add group/i }).click(); await page.waitForTimeout(400);
    say(`section buttons: ${J(await section().locator("button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label") || x.textContent.trim())))}`);
    const fieldBtn = section().locator("button[aria-label*='ield' i]").first();
    say(`field button: ${await fieldBtn.getAttribute("aria-label", { timeout: 5000 })}`);
    await fieldBtn.click(); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, "picker-open.png") });
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    say(`Escape with the picker open: dialog open=${await dlg().isVisible()}; picker open=${await page.locator('[aria-label="Select a field"]').count()}`);
    await fieldBtn.click(); await page.waitForTimeout(300);
    await page.fill('[aria-label="Search fields"]', "status"); await page.waitForTimeout(300);
    await page.locator('[aria-label="Select a field"] [role=option]').first().click(); await page.waitForTimeout(400);
    say(`chip after choosing Status: ${J((await section().innerText()).split("\n").filter(Boolean).slice(0, 16))}`);
    const val = section().locator('[aria-label="Value"]').first();
    say(`value control: ${await val.evaluate((e) => e.tagName)}`);
    if ((await val.evaluate((e) => e.tagName)) === "SELECT") await val.selectOption({ label: a }); else await val.fill(a);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, "filter-set.png") });
    await section().getByRole("button", { name: "Save goal filter" }).click(); await page.waitForTimeout(1200);
    say(`after save: status=${J(await section().locator("[role=status]").allInnerTexts())}; alert=${J(await section().locator("[role=alert]").allInnerTexts())}`);
    const root = path.join(projectsDir, readdirSync(projectsDir)[0]);
    say(`stored: ${J(JSON.parse(readFileSync(path.join(root, "project.json"), "utf8")).config.goalFilter)}`);
    await closeDlg();
  });
  await step("filtered", async () => {
    await open("Keep"); await page.waitForTimeout(1000);
    say(`filtered footer: ${J(await footer())}`);
    await page.click("button:has-text(\"Today's writing\")"); await page.waitForTimeout(700);
    say(`details: ${J((await dlg().innerText()).split("\n").filter(Boolean))}`); await page.screenshot({ path: path.join(SHOTS, "details.png") }); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await dataView("filtered"); await page.screenshot({ path: path.join(SHOTS, "data-filtered.png") }); await edit();
    await open("Keep"); await pm().click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(" nine"); await page.waitForTimeout(4000);
    say(`after typing in a matching document: ${J(await footer())}`);
    await open("Skip"); await pm().click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(" ten"); await page.waitForTimeout(4000);
    say(`after typing in an excluded document: ${J(await footer())}`);
  });
  await step("field-change", async () => {
    await setStatus("Skip", a); await page.waitForTimeout(1500);
    say(`excluded document changed to match, no save of its text: ${J(await footer())}`);
    await setStatus("Skip", b); await page.waitForTimeout(1500);
    say(`changed back: ${J(await footer())}`);
  });
  await step("no-match", async () => {
    await setStatus("Keep", b); await page.waitForTimeout(1500);
    say(`nothing matches: footer=${J(await footer())}`);
    await dataView("no-match"); await page.screenshot({ path: path.join(SHOTS, "data-nomatch.png") }); await edit();
    await setStatus("Keep", a); await page.waitForTimeout(1500);
  });
  await step("failure", async () => {
    const root = path.join(projectsDir, readdirSync(projectsDir)[0]);
    const p = path.join(root, "project.json"); const pj = JSON.parse(readFileSync(p, "utf8"));
    const good = pj.config.goalFilter;
    pj.config.goalFilter = { op: "eq", field: "gone_field", value: "x" };
    writeFileSync(p, JSON.stringify(pj, null, 2));
    await page.reload(); await page.waitForTimeout(2500);
    await page.click('button[aria-label="Open Goals"]'); await page.waitForTimeout(2000);
    await open("Keep"); await pm().click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(" eleven"); await page.waitForTimeout(4000);
    say(`deleted field: footer=${J(await footer())}`);
    await dataView("deleted-field"); await edit();
    await openGoals(); await page.screenshot({ path: path.join(SHOTS, "tab-missing-field.png") });
    say(`deleted field, tab: ${J((await section().innerText()).split("\n").filter((l) => /exist|can't be used|gone_field/i.test(l)))}`); await closeDlg();
    const pj2 = JSON.parse(readFileSync(p, "utf8")); say(`deleted field left as stored: ${J(pj2.config.goalFilter)}`); pj2.config.goalFilter = good; writeFileSync(p, JSON.stringify(pj2, null, 2));
  });
  await step("clear", async () => {
    await page.reload().catch(() => {}); await page.waitForTimeout(2500);
    const opener = page.locator('button[aria-label="Open Goals"]'); if (await opener.count()) { await opener.click(); await page.waitForTimeout(2000); }
    await openGoals();
    await section().getByRole("button", { name: "Clear goal filter" }).click(); await page.waitForTimeout(1200);
    say(`after clear: status=${J(await section().locator("[role=status]").allInnerTexts())}`);
    await closeDlg(); await open("Keep"); await page.waitForTimeout(1000);
    say(`cleared footer: ${J(await footer())}`);
    await dataView("cleared");
  });
} catch (e) {
  say(`ERROR ${errLine(e)}`);
  await page?.screenshot({ path: path.join(SHOTS, "fatal.png") }).catch(() => {});
} finally {
  await Promise.race([app.close(), sleep(10000)]).catch(() => {}); await sleep(800); rec.walk(process.pid); await rec.stop();
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus()}`);
}
process.exit(0);
