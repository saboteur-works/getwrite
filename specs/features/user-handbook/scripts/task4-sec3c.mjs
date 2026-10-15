// Task 4, web build + built CLI: what the writing log counts, imports, skipped saves, files (W-27..W-45). Run OUTSIDE the sandbox.
// The server runs with a throwaway TZ chosen so the server's local date differs from the UTC date (W-41/W-42).
const hourUTC = new Date().getUTCHours();
process.env.TZ = hourUTC >= 10 ? "Pacific/Kiritimati" : "Etc/GMT+12";
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, newProjectWithDoc, waitSaved, readLog, logFiles, walk, reopenDoc, createProject } from "./task4-lib.mjs";
import { runCli } from "./cli.mjs";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const dlg = (page) => page.locator("[role=dialog]");
const entries = (h, proj) => { const out = []; for (const d of readdirSync(h.projectsDir)) { const p = JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")); if (proj && p.name !== proj) continue; const dir = path.join(h.projectsDir, d, "meta", "writing-log"); if (!existsSync(dir)) continue; for (const f of readdirSync(dir).sort()) out.push(...JSON.parse(readFileSync(path.join(dir, f), "utf8")).entries.map((e) => ({ f, ...e }))); } return out; };
const summ = (es) => es.map((e) => e.skipped ? "skipped" : `+${e.added}/-${e.deleted}/net${e.net}${e.source ? "/" + e.source : ""}`);
async function dialogNums(page) {
  await page.click("button:has-text(\"Today's writing\")");
  await page.waitForTimeout(800);
  const t = (await dlg(page).innerText()).split("\n").filter((l) => /Added|Deleted|Net|Imported|incomplete|Daily|No daily/.test(l));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return t;
}
const projDir = (h, name) => readdirSync(h.projectsDir).map((d) => path.join(h.projectsDir, d)).find((p) => JSON.parse(readFileSync(path.join(p, "project.json"), "utf8")).name === name);
async function replaceAll(page, text) {
  await pm(page).click();
  await page.keyboard.press("ControlOrMeta+A");
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i++) { if (i) await page.keyboard.press("Enter"); await page.keyboard.type(parts[i]); }
}
const hashFile = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12);

await withWeb("t4sec3c", {}, async ({ h, page, browser }) => {
  say(`server TZ=${process.env.TZ}; UTC now ${new Date().toISOString()}; server-local date ${new Date().toLocaleDateString("en-CA")}`);
  await newProjectWithDoc(page, h, "Count Test", "Doc One");
  const step1 = async (label, text, wait = 4500) => {
    const before = entries(h, "Count Test").length;
    await replaceAll(page, text);
    const f = await waitSaved(page, wait);
    const es = entries(h, "Count Test");
    say(`${label}: text=${J(text)} -> new entries ${J(summ(es.slice(before)))}; entries so far ${J(summ(es))}; footer ${J(f.filter((l) => /Today|saved/.test(l)))}`);
    return es;
  };
  await step("a", async () => { await step1("W-27 a: first 5 words", "alpha beta gamma delta epsilon"); });
  await step("b", async () => {
    const rev = () => walk(h.projectsDir).filter((p) => /content\.bin$/.test(p));
    const h0 = rev().map(hashFile);
    await step1("W-31/W-34 b: same five words in reverse order", "epsilon delta gamma beta alpha");
    say(`   revision content.bin hash before/after: ${J(h0)} -> ${J(rev().map(hashFile))} (a changed hash means the save wrote different content)`);
  });
  await step("c", async () => {
    await step1("c: three paragraphs", "P1 one two\nP2 three four\nP3 five six");
    // move paragraph 1 to the end by cut and paste
    const hb = walk(h.projectsDir).filter((p) => /content\.bin$/.test(p)).map(hashFile);
    await pm(page).locator("p").first().click({ clickCount: 3 });
    await page.keyboard.press("ControlOrMeta+X");
    await page.waitForTimeout(200);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+V");
    await page.waitForTimeout(300);
    say(`   after cut/paste, editor paragraphs: ${J(await page.evaluate(() => [...document.querySelectorAll(".ProseMirror p")].map((p) => p.textContent)))}`);
    const before = entries(h, "Count Test").length;
    const f = await waitSaved(page, 4500);
    const es = entries(h, "Count Test");
    say(`W-30 c: paragraph P1 moved to the end -> new entries ${J(summ(es.slice(before)))}; footer ${J(f.filter((l) => /Today|saved/.test(l)))}; content.bin hash ${J(hb)} -> ${J(walk(h.projectsDir).filter((p) => /content\.bin$/.test(p)).map(hashFile))}`);
  });
  await step("d", async () => {
    await step1("W-32 d1: 'three' -> 'Three'", "P2 Three four\nP3 five six\nP1 one two");
    await step1("W-32 d2: 'four' -> 'four,'", "P2 Three four,\nP3 five six\nP1 one two");
    await step1("W-35 e: swap 'five' for 'zzz'", "P2 Three four,\nP3 zzz six\nP1 one two");
    await step1("W-27 f: delete 'P1 one' (2 words)", "P2 Three four,\nP3 zzz six\ntwo");
  });
  await step("g", async () => {
    const before = entries(h, "Count Test").length;
    await pm(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" ephemeral");
    await page.keyboard.press("Backspace".repeat(1));
    for (let i = 0; i < 9; i++) await page.keyboard.press("Backspace");
    const f = await waitSaved(page, 6000);
    say(`W-33 g: typed ' ephemeral' and deleted it again before the autosave: new entries ${J(summ(entries(h, "Count Test").slice(before)))}; footer ${J(f)}; editor text ${J(await pm(page).innerText())}`);
  });
  await step("dialog", async () => {
    const es = entries(h, "Count Test");
    const add = es.reduce((a, e) => a + (e.added || 0), 0), del = es.reduce((a, e) => a + (e.deleted || 0), 0);
    say(`W-27 dialog numbers vs entries: dialog ${J(await dialogNums(page))}; sum of entries added=${add} deleted=${del} net=${add - del}; entries ${J(es.map((e) => ({ added: e.added, deleted: e.deleted, net: e.net })))}`);
  });
  // ---- non-canonical revision (W-28) ----
  await step("W-28", async () => {
    await page.click("button:has-text('Expand')");
    await page.waitForTimeout(600);
    say(`W-28 revision control open: text ${J((await bodyText(page)).split("\n").filter((l) => /REVISION|Revision|Canonical|CANONICAL|v-|V\d|Draft|Initial/.test(l)).slice(0, 14))}`);
    await page.locator('input[placeholder="Revision name"]').fill("Named Revision");
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(1500);
    const revDirs = () => walk(h.projectsDir).filter((p) => /revisions\/.*metadata\.json$/.test(p)).map((p) => { const m = JSON.parse(readFileSync(p, "utf8")); return { v: p.split("/").slice(-2)[0], canonical: m.isCanonical, name: m.name }; });
    say(`W-28 revisions on disk after Save Explicit Revision: ${J(revDirs())}; entries ${J(summ(entries(h, "Count Test")))}`);
    say(`W-28 revision cards text: ${J((await bodyText(page)).split("\n").filter((l) => /Named Revision|Initial Draft|Canonical|Make Canonical|Restore|View|Open|Protect/i.test(l)).slice(0, 14))}`);
    say(`W-28 buttons in revision control: ${J(await page.$$eval("#revision-control-content button", (b) => b.map((x) => (x.getAttribute("aria-label") || x.textContent).trim()).filter(Boolean)))}`);
  });
  await step("W-36", async () => {
    // plain-text import with the built CLI into the throwaway projects folder
    const src = path.join(h.run.dir, "Imported Notes.txt");
    writeFileSync(src, "Seven words of imported plain text.\n\nTwo more.\n");
    const root = path.join(h.projectsDir, "22222222-3333-4444-8555-666666666666");
    const r = runCli(["project", "import-plaintext", src, root]);
    say(`W-36 CLI import-plaintext: exit=${r.status}; ${J((r.stdout + r.stderr).split("\n").filter(Boolean).slice(0, 5))}`);
    const day = readdirSync(path.join(root, "meta", "writing-log"));
    say(`W-36 import project files in meta/writing-log: ${J(day)}; entries ${J(JSON.parse(readFileSync(path.join(root, "meta", "writing-log", day[0]), "utf8")).entries)}`);
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(2000);
    const names = await page.$$eval('button[aria-label^="Open "]', (b) => b.map((x) => x.getAttribute("aria-label")));
    say(`W-36 projects on the Start Page: ${J(names)}`);
    await page.click('button[aria-label="Open Imported Notes"]'); await page.waitForTimeout(2500);
    await openDoc(page, "Imported Notes"); await page.waitForTimeout(1500);
    say(`W-36/W-37 imported project, no goal: dialog ${J(await dialogNums(page))}; footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await page.waitForTimeout(600);
    await dlg(page).locator('[role=tab]:has-text("Writing Goals")').click(); await page.waitForTimeout(400);
    await dlg(page).locator("#daily-word-goal").fill("5");
    await dlg(page).getByRole("button", { name: /Save daily goal/ }).click(); await page.waitForTimeout(800);
    await dlg(page).locator("button:has-text('Close')").first().click(); await page.waitForTimeout(500);
    say(`W-37 imported project with daily goal 5 (imported 9 words): footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}; dialog ${J(await dialogNums(page))}`);
    // W-38: the same document with its log folder removed
    const logDir = path.join(root, "meta", "writing-log");
    const bak = readFileSync(path.join(logDir, day[0]), "utf8");
    const { rmSync } = await import("node:fs");
    rmSync(logDir, { recursive: true, force: true });
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Imported Notes"]'); await page.waitForTimeout(2500);
    await openDoc(page, "Imported Notes"); await page.waitForTimeout(1500);
    say(`W-38 same project with meta/writing-log removed (document still holds its text: ${J((await pm(page).innerText()).slice(0, 40))}): dialog ${J(await dialogNums(page))}; footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}`);
    mkdirSync(logDir, { recursive: true }); writeFileSync(path.join(logDir, day[0]), bak);
  });
  await step("W-45", async () => {
    const d = projDir(h, "Count Test");
    const logDir = path.join(d, "meta", "writing-log");
    const snap = () => readdirSync(logDir).map((f) => `${f}:${hashFile(path.join(logDir, f))}`);
    const before = snap();
    const r = runCli(["reindex", d]);
    say(`W-45 reindex on the Count Test project: exit=${r.status}; output ${J((r.stdout + r.stderr).split("\n").filter(Boolean).slice(0, 4))}`);
    say(`W-45 meta/writing-log before ${J(before)} after ${J(snap())}`);
    say(`W-41/42/43 files: ${J(readdirSync(logDir))}; UTC date ${new Date().toISOString().slice(0, 10)}; server-local date (TZ=${process.env.TZ}) ${new Date().toLocaleDateString("en-CA")}; day file keys ${J(Object.keys(JSON.parse(readFileSync(path.join(logDir, readdirSync(logDir)[0]), "utf8"))))}; entry timestamps ${J(entries(h, "Count Test").map((e) => e.timestamp))}`);
  });
  await step("W-39", async () => {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await createProject(page, h, "Legacy Test", "Blank");
    await createDoc(page, "Leg Doc");
    await openDoc(page, "Leg Doc");
    await pm(page).click();
    await page.keyboard.type("legacy words typed here");
    await waitSaved(page);
    const d = projDir(h, "Legacy Test");
    const bins = walk(d).filter((p) => /content\.bin$/.test(p));
    say(`W-39 files for Leg Doc: ${J(walk(d).filter((p) => /resources|revisions/.test(p)).map((p) => p.replace(d, "")))}`);
    say(`W-39 entries before: ${J(summ(entries(h, "Legacy Test")))}; revision content.bin head: ${J(readFileSync(bins[0], "utf8").slice(0, 60))}`);
    writeFileSync(bins[0], "legacy plain text, not a TipTap document");
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Legacy Test"]'); await page.waitForTimeout(2000);
    await openDoc(page, "Leg Doc"); await page.waitForTimeout(1500);
    say(`W-39 doc opened with a plain-text revision: editor text ${J(await pm(page).innerText())}`);
    await pm(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" more");
    await page.waitForTimeout(2500);
    say(`W-40 toast/status text right after the save: ${J((await bodyText(page)).split("\n").filter((l) => /skip|incomplete|toast|not counted|could not|Could not|writing/i.test(l)))}`);
    const f = await waitSaved(page, 2500);
    say(`W-40 footer after the save: ${J(f)}; entries ${J(summ(entries(h, "Legacy Test")))}; raw entries ${J(entries(h, "Legacy Test").slice(-1))}`);
    say(`W-40 role=status/alert elements: ${J(await page.$$eval("[role=status], [role=alert], [data-sonner-toast], [class*=toast]", (e) => e.map((x) => x.textContent.trim().slice(0, 100)).filter(Boolean)))}`);
    say(`W-40 dialog numbers: ${J(await dialogNums(page))}`);
  });
});
