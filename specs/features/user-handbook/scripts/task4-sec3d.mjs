// Task 4, web build + built CLI: paragraph move (W-30), unreadable previous content (W-39), plain-text import project (W-36..W-38). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, newProjectWithDoc, waitSaved, walk, reopenDoc, createProject } from "./task4-lib.mjs";
import { runCli } from "./cli.mjs";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const dlg = (page) => page.locator("[role=dialog]");
const entries = (h, proj) => { const out = []; for (const d of readdirSync(h.projectsDir)) { const p = JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")); if (proj && p.name !== proj) continue; const dir = path.join(h.projectsDir, d, "meta", "writing-log"); if (!existsSync(dir)) continue; for (const f of readdirSync(dir).sort()) out.push(...JSON.parse(readFileSync(path.join(dir, f), "utf8")).entries); } return out; };
const summ = (es) => es.map((e) => e.skipped ? "skipped" : `+${e.added}/-${e.deleted}/net${e.net}${e.source ? "/" + e.source : ""}`);
async function dialogNums(page) {
  await page.click("button:has-text(\"Today's writing\")");
  await page.waitForTimeout(800);
  const t = (await dlg(page).innerText()).split("\n").filter((l) => /Added|Deleted|Net|Imported|incomplete|Daily|No daily|unavailable/.test(l));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return t;
}
const projDir = (h, name) => readdirSync(h.projectsDir).map((d) => path.join(h.projectsDir, d)).find((p) => JSON.parse(readFileSync(path.join(p, "project.json"), "utf8")).name === name);
const paras = (page) => page.evaluate(() => [...document.querySelectorAll(".ProseMirror p")].map((p) => p.textContent));
const hashAll = (h) => walk(h.projectsDir).filter((p) => /content\.bin$/.test(p)).map((f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 10));

await withWeb("t4sec3d", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Move Test", "Doc One");
  await step("move", async () => {
    await pm(page).click();
    await page.keyboard.type("P1 one two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("P2 three four");
    await page.keyboard.press("Enter");
    await page.keyboard.type("P3 five six");
    await waitSaved(page);
    say(`W-30 setup: paragraphs ${J(await paras(page))}; entries ${J(summ(entries(h, "Move Test")))}`);
    const hb = hashAll(h);
    // drag the first paragraph (selected) below the last one with the mouse
    await pm(page).locator("p").first().click({ clickCount: 3 });
    say(`   selection: ${J(await page.evaluate(() => getSelection().toString()))}`);
    const src = await pm(page).locator("p").first().boundingBox();
    const dst = await pm(page).locator("p").last().boundingBox();
    await page.mouse.move(src.x + 20, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 25, src.y + src.height / 2 + 10, { steps: 5 });
    await page.mouse.move(dst.x + 30, dst.y + dst.height + 4, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    say(`W-30 after dragging P1 below P3: paragraphs ${J(await paras(page))}`);
    const before = entries(h, "Move Test").length;
    const f = await waitSaved(page, 4500);
    say(`W-30 new entries ${J(summ(entries(h, "Move Test").slice(before)))}; content.bin hashes ${J(hb)} -> ${J(hashAll(h))}; footer ${J(f.filter((l) => /Today|saved/.test(l)))}`);
  });
  await step("move2", async () => {
    // keyboard cut and paste, one key at a time
    await replaceAllText(page, ["P1 one two", "P2 three four", "P3 five six"]);
    await waitSaved(page);
    const before = entries(h, "Move Test").length;
    const hb = hashAll(h);
    await pm(page).locator("p").first().click({ clickCount: 3 });
    await page.keyboard.press("Meta+x");
    await page.waitForTimeout(300);
    say(`W-30b after Meta+X: paragraphs ${J(await paras(page))}`);
    await page.keyboard.press("Meta+End");
    await page.waitForTimeout(100);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Meta+v");
    await page.waitForTimeout(500);
    say(`W-30b after End, Enter, Meta+V: paragraphs ${J(await paras(page))}`);
    const f = await waitSaved(page, 4500);
    say(`W-30b new entries ${J(summ(entries(h, "Move Test").slice(before)))}; content.bin hashes ${J(hb)} -> ${J(hashAll(h))}; footer ${J(f.filter((l) => /Today|saved/.test(l)))}`);
  });
  async function replaceAllText(page, lines) {
    await pm(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    for (let i = 0; i < lines.length; i++) { if (i) await page.keyboard.press("Enter"); await page.keyboard.type(lines[i]); }
  }
  await step("unreadable", async () => {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await createProject(page, h, "Missing Test", "Blank");
    await createDoc(page, "M Doc");
    await openDoc(page, "M Doc");
    await pm(page).click();
    await page.keyboard.type("some words here");
    await waitSaved(page);
    const d = projDir(h, "Missing Test");
    const bin = walk(d).find((p) => /content\.bin$/.test(p));
    say(`W-39b entries before: ${J(summ(entries(h, "Missing Test")))}`);
    unlinkSync(bin);
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Missing Test"]'); await page.waitForTimeout(2000);
    await openDoc(page, "M Doc"); await page.waitForTimeout(1500);
    say(`W-39b revision content.bin removed, doc opened: editor text ${J(await pm(page).innerText())}`);
    await pm(page).click();
    await page.keyboard.type("typed after removal");
    await page.waitForTimeout(5000);
    const f = await waitSaved(page, 2000);
    say(`W-39b after typing: footer ${J(f)}; entries ${J(summ(entries(h, "Missing Test")))}; status elements ${J(await page.$$eval("[role=status], [role=alert]", (e) => e.map((x) => x.textContent.trim().slice(0, 100)).filter(Boolean)))}; content.bin exists now: ${existsSync(bin)}`);
  });
  await step("W-36", async () => {
    const src = path.join(h.run.dir, "Imported Notes.txt");
    writeFileSync(src, "Seven words of imported plain text.\n\nTwo more.\n");
    const root = path.join(h.projectsDir, "22222222-3333-4444-8555-666666666666");
    const r = runCli(["project", "import-plaintext", src, root]);
    say(`W-36 CLI import-plaintext exit=${r.status}`);
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Imported Notes"]'); await page.waitForTimeout(2500);
    say(`W-36 tree text: ${J((await bodyText(page)).split("\n").slice(0, 14))}`);
    await page.locator("text=Imported Notes").nth(1).click(); await page.waitForTimeout(1800);
    say(`W-36 opened resource: editor text ${J(await pm(page).innerText())}; editing line ${J((await bodyText(page)).split("\n").filter((l) => /EDITING/.test(l)))}`);
    say(`W-36/W-37 imported project, no goal: dialog ${J(await dialogNums(page))}; footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await page.waitForTimeout(600);
    await dlg(page).locator('[role=tab]:has-text("Writing Goals")').click(); await page.waitForTimeout(400);
    await dlg(page).locator("#daily-word-goal").fill("5");
    await dlg(page).getByRole("button", { name: /Save daily goal/ }).click(); await page.waitForTimeout(800);
    await dlg(page).locator("button:has-text('Close')").first().click(); await page.waitForTimeout(500);
    say(`W-37 imported project with daily goal 5: footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}; dialog ${J(await dialogNums(page))}`);
    const logDir = path.join(root, "meta", "writing-log");
    const day = readdirSync(logDir);
    const bak = readFileSync(path.join(logDir, day[0]), "utf8");
    rmSync(logDir, { recursive: true, force: true });
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Imported Notes"]'); await page.waitForTimeout(2500);
    await page.locator("text=Imported Notes").nth(1).click(); await page.waitForTimeout(1800);
    say(`W-38 same project, meta/writing-log removed; document text ${J((await pm(page).innerText()).slice(0, 36))}: dialog ${J(await dialogNums(page))}; footer ${J((await bodyText(page)).split("\n").filter((l) => /^Today/.test(l)))}`);
    mkdirSync(logDir, { recursive: true }); writeFileSync(path.join(logDir, day[0]), bak);
  });
});
