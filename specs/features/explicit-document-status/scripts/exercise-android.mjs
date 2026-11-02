// Runs Feature 99 on the owner's Android phone (debug build of the branch) inside a throwaway project
// "F99 check". Owner decision 2026-11-02: run in a throwaway project, leave it for the owner to delete;
// existing projects are not opened. Needs `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`.
// Usage: node exercise-android.mjs <screenshot-dir>. Run OUTSIDE the sandbox.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const { chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const SHOTS = process.argv[2];
mkdirSync(SHOTS, { recursive: true });
const PKG = "works.saboteur.getwrite";
const NAME = "F99 check";
const J = (x) => JSON.stringify(x);
const say = (s) => console.log(s);
const adb = (cmd) => execSync(`adb shell run-as ${PKG} ${cmd}`, { encoding: "utf8" });
const shot = (n) => execSync(`adb exec-out screencap -p > ${path.join(SHOTS, n)}`);
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages()[0];
const wait = (ms) => page.waitForTimeout(ms);
const visible = (sel) => page.locator(`${sel} >> visible=true`).first();
const lines = async () => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter(Boolean);

let projectDir = null;
const findProject = () => {
  for (const d of adb("ls files/projects").split(/\s+/).filter(Boolean)) {
    try { if (JSON.parse(adb(`cat files/projects/${d}/project.json`)).name === NAME) return `files/projects/${d}`; } catch {}
  }
  return null;
};
const configStatuses = () => J(JSON.parse(adb(`cat ${projectDir}/project.json`)).config?.statuses ?? null);
const stored = (title) => {
  for (const f of adb(`ls ${projectDir}/meta`).split(/\s+/).filter((x) => x.startsWith("resource-"))) {
    const s = JSON.parse(adb(`cat ${projectDir}/meta/${f}`));
    if (s.name === title || s.title === title) return J(s.userMetadata ?? null);
  }
  return "not found";
};
const drawerOpen = async () => (await page.locator("[role=treeitem] >> visible=true").count()) > 0;
const openDrawer = async () => { if (!(await drawerOpen())) { await visible('button[aria-label="Open resource sidebar"]').click(); await wait(800); } };
const closeDrawer = async () => { if (await drawerOpen()) { await visible('button[aria-label="Close resources drawer"]').click(); await wait(600); } };
const expandAll = async () => { for (let i = 0; i < 10; i++) { const b = visible('button[aria-label^="Expand "]'); if (!(await b.count())) break; await b.click(); await wait(200); } };
const openDoc = async (t) => { await openDrawer(); await expandAll(); await visible(`[role=treeitem]:has-text("${t}")`).click(); await wait(1500); await closeDrawer(); };
const metadataPanel = async () => { const b = visible('button[aria-label="Open metadata sidebar"]'); if (await b.count()) { await b.click(); await wait(800); } };
const statusSel = () => visible('select[aria-label="status"]');
const RESUME = process.argv[3] === "resume"; // continue inside the existing throwaway project at step 3's Beta
const choose = async (label) => { await metadataPanel(); const s = statusSel(); await s.scrollIntoViewIfNeeded(); await s.selectOption({ label }); await wait(1800); };
const sidebar = async () => {
  await metadataPanel();
  const s = statusSel();
  await s.scrollIntoViewIfNeeded();
  const opts = await s.locator("option").allInnerTexts();
  const shown = await s.evaluate((el) => el.options[el.selectedIndex]?.text ?? null);
  const id = await s.getAttribute("aria-describedby");
  const hint = id ? await page.locator(`#${id}`).allInnerTexts() : [];
  return `shown=${J(shown)} options=${J(opts)} hint=${J(hint)}`;
};
const closeOverlays = async () => { await page.keyboard.press("Escape"); await wait(500); };
const settingsMetadata = async () => {
  await closeOverlays(); await closeDrawer();
  await visible('button[aria-label="Open project settings menu"]').click(); await wait(500);
  await visible("text=Project Settings").click(); await wait(900);
  await visible('[role=dialog] [role=tab]:has-text("Metadata")').click(); await wait(600);
};
const addStatus = async (label) => {
  const input = visible("#status-new");
  await input.scrollIntoViewIfNeeded(); await input.fill(label);
  await input.locator("xpath=following::button[normalize-space()='Add'][1]").click(); await wait(1000);
};
const createDoc = async (t) => {
  await openDrawer();
  await visible('button[aria-label="Workspace options"]').click(); await wait(400);
  await visible(".resource-context-menu-item:has-text('Create')").click(); await wait(500);
  await visible("[role=dialog] input[type=text]").fill(t);
  await page.locator("[role=dialog] button:has-text('Create') >> visible=true").last().click(); await wait(2500);
};

let code = 0;
try {
  say(`start url=${page.url()}`);
  if (RESUME) {
    projectDir = findProject();
    if (!projectDir) throw new Error("resume: no throwaway project found");
    say(`resuming in ${NAME} at ${projectDir}`);
  } else {
  if (!(await page.locator("text=START A NEW PROJECT").count())) throw new Error("not on the start page; refusing to navigate away from an open project");
  if (findProject()) throw new Error(`a project named ${NAME} already exists; stopping rather than reusing it`);
  await page.click("text=START A NEW PROJECT"); await wait(600);
  await page.fill('input:not([aria-label="Filter project types"])', NAME);
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await wait(3000);
  projectDir = findProject();
  say(`created ${NAME} at ${projectDir}`);
  await createDoc("Alpha"); await createDoc("Beta"); await createDoc("Gamma");

  say("== 1. No statuses");
  await openDoc("Alpha");
  say(`sidebar: ${await sidebar()}; Alpha stored=${stored("Alpha")}; config.statuses=${configStatuses()}`);
  shot("android-1-blank.png");
  await closeOverlays();

  say("== 2. Statuses editor");
  await settingsMetadata();
  await addStatus("Outline"); await addStatus("Draft");
  say(`stored after adding Outline, Draft: ${configStatuses()}`);
  await addStatus("draft ");
  say(`duplicate: error=${J(await page.locator("#status-new-error").allInnerTexts())}; stored=${configStatuses()}`);
  await visible('button[aria-label="Move Draft up"]').click(); await wait(1000);
  say(`after Move Draft up: ${configStatuses()}`);
  shot("android-2-editor.png");
  await closeOverlays();

  say("== 3. Choose and clear");
  await openDoc("Alpha");
  say(`Alpha: ${await sidebar()}`);
  await choose("Draft");
  say(`after Draft: ${await sidebar()}; stored=${stored("Alpha")}`);
  await choose("No status");
  say(`after No status: ${await sidebar()}; stored=${stored("Alpha")}`);
  await choose("Outline");
  await closeOverlays();
  }
  await openDoc("Beta");
  await choose("Draft");
  say(`Alpha=${stored("Alpha")} Beta=${stored("Beta")} Gamma=${stored("Gamma")}`);
  await closeOverlays();

  say("== 4. Remove Draft from the list");
  await settingsMetadata();
  await visible('button[aria-label="Remove Draft"]').click(); await wait(1000);
  say(`list=${configStatuses()}; Beta stored=${stored("Beta")}`);
  await closeOverlays();
  await openDoc("Beta");
  say(`Beta: ${await sidebar()}`);
  shot("android-4-offlist.png");
  await closeOverlays();

  say("== 5. Organizer");
  await openDrawer();
  await visible(`[role=treeitem]:has-text("Workspace")`).click(); await wait(1200);
  await closeDrawer();
  await visible("[role=tab][data-value=organizer]").click(); await wait(1500);
  const cards = async () => page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Open" && b.getBoundingClientRect().width > 0).map((b) => { let n = b; while (n && !/\d+\/\d+\/\d+/.test(n.innerText)) n = n.parentElement; return n ? n.innerText.replace(/\s+/g, " ").trim().slice(0, 80) : "?"; }));
  say(`cards: ${J(await cards())}`);
  await visible("text=Filters").click(); await wait(500);
  const filter = visible('select[aria-label="Filter by status"]');
  say(`filter options: ${J(await filter.locator("option").allInnerTexts())}`);
  for (const label of ["Outline", "No status"]) { await filter.selectOption({ label }); await wait(900); say(`filter ${label}: ${J(await cards())}`); }
  await filter.selectOption({ label: "All statuses" }); await wait(500);
  shot("android-5-organizer.png");
} catch (e) {
  code = 1;
  say(`ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`);
  shot("android-error.png");
}
await browser.close();
process.exit(code);
