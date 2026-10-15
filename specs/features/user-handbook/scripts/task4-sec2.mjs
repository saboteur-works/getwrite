// Task 4, web build: write/headings.md rows H-01..H-15 and write/editor-appearance.md rows A-01..A-11. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, html, newProjectWithDoc, waitSaved, reopenDoc, createProject } from "./task4-lib.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { runCli } from "./cli.mjs";
import path from "node:path";

const dlg = (page) => page.locator("[role=dialog]");
const vis = (loc) => loc.filter({ visible: true });
async function openSettings(page) {
  for (let i = 0; i < 3 && (await page.locator("[role=dialog]").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings");
  await page.waitForTimeout(600);
  await dlg(page).locator('[role=tab]:has-text("Editor")').click();
  await page.waitForTimeout(500);
}
async function closeSettings(page) { await dlg(page).locator("button:has-text('Close')").first().click(); await page.waitForTimeout(500); }
const hStyle = (page, sel) => page.evaluate((s) => { const e = document.querySelector(".ProseMirror " + s); if (!e) return null; const c = getComputedStyle(e); return { size: c.fontSize, family: c.fontFamily, weight: c.fontWeight, ls: c.letterSpacing, color: c.color, lh: c.lineHeight }; }, sel);
const pStyle = (page) => page.evaluate(() => { const ps = [...document.querySelectorAll(".ProseMirror p")]; const c = getComputedStyle(ps[0]); const gaps = ps.slice(1).map((p, i) => Math.round((p.getBoundingClientRect().top - ps[i].getBoundingClientRect().bottom) * 10) / 10); return { family: c.fontFamily, size: c.fontSize, lh: c.lineHeight, color: c.color, mt: c.marginTop, mb: c.marginBottom, pt: c.paddingTop, pb: c.paddingBottom, inlineStyle: ps[0].getAttribute("style"), gaps }; });
const projJson = (h) => { const d = readdirSync(h.projectsDir)[0]; return JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")); };

await withWeb("t4sec2", { copyTemplates: true }, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Head Test", "Doc One");
  // ---------- body defaults (A-03..A-05, A-08) ----------
  await pm(page).click();
  await page.keyboard.type("First paragraph.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second paragraph.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Third paragraph.");
  await waitSaved(page);
  await step("A-03", async () => {
    say(`A-03/04/05/08 default body p style on a Blank project: ${J(await pStyle(page))}`);
    say(`A-03/04/05 project.json config keys: ${J(Object.keys(projJson(h).config || {}))}; editor-related: ${J(Object.fromEntries(Object.entries(projJson(h).config || {}).filter(([k]) => /edit|body|head|typo/i.test(k))))}`);
    say(`A-05 toolbar Line Height field value: ${J(await page.$eval('input[aria-label="Line Height"]', (e) => e.value))}`);
  });
  // ---------- headings H-01 / H-04: toolbar buttons on the current line ----------
  await step("H-01", async () => {
    await page.keyboard.press("Enter");
    const tags = [];
    for (let n = 1; n <= 6; n++) {
      await page.keyboard.type(`Heading line ${n}`);
      await page.click(`button[aria-label="Heading ${n}"]`);
      await page.waitForTimeout(200);
      const tag = await page.evaluate((n) => { const e = [...document.querySelectorAll(".ProseMirror > *")].find((x) => x.textContent === `Heading line ${n}`); return e && e.tagName; }, n);
      tags.push(tag);
      await page.locator(".ProseMirror").click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Enter");
      // after Enter from a heading the new line is a paragraph or heading; record
    }
    say(`H-01/H-04 caret in one line (no selection), clicked Heading 1..6: tags ${J(tags)}`);
    say(`H-04 editor structure: ${J(await page.evaluate(() => [...document.querySelectorAll(".ProseMirror > *")].map((e) => e.tagName + ":" + e.textContent)))}`);
    await waitSaved(page);
  });
  await step("H-01b", async () => {
    // default heading look in the editor before any change
    say(`H-07..H-11 default h1 style: ${J(await hStyle(page, "h1"))}; h2: ${J(await hStyle(page, "h2"))}; h3: ${J(await hStyle(page, "h3"))}; h4: ${J(await hStyle(page, "h4"))}`);
  });
  // ---------- settings: where, tab name ----------
  await step("H-05", async () => {
    await page.click('button[aria-label="Open project settings menu"]');
    say(`H-05 gear menu items: ${J(await page.$$eval("[role=menuitem], [role=menu] button", (e) => [...new Set(e.map((x) => (x.textContent || "").trim()).filter(Boolean))]))}`);
    await page.click("text=Project Settings");
    await page.waitForTimeout(600);
    say(`H-05 Project Settings tab buttons: ${J(await vis(dlg(page).locator("button")).evaluateAll((bs) => bs.map((b) => b.textContent.trim()).slice(0, 14)))}`);
    say(`H-05 any tab/button named exactly 'Heading Styles': ${await dlg(page).locator('[role=tab]:has-text("Heading Styles")').count()}; text 'Heading Styles' occurrences in dialog: ${await dlg(page).locator("text=Heading Styles").count()}`);
    await dlg(page).locator('[role=tab]:has-text("Editor")').click();
    await page.waitForTimeout(500);
    say(`H-03/H-12 Editor tab visible text: ${J((await dlg(page).innerText()).split("\n").filter(Boolean).slice(13, 30))}`);
    say(`H-07..H-11 controls (labels, default values): ${J(await page.$$eval('[role=dialog] input[aria-label^="H"], [role=dialog] select[aria-label^="H"], [role=dialog] button[aria-label^="Choose"]', (els) => els.map((e) => e.tagName + ":" + e.getAttribute("aria-label") + "=" + (e.value ?? "") + (e.placeholder ? "|ph=" + e.placeholder : ""))))}`);
    say(`H-09 H1 weight options: ${J(await page.$$eval('[role=dialog] select[aria-label="H1 Font Weight"] option', (o) => o.map((x) => x.value + ":" + x.textContent)))}`);
    say(`H-08 H1 Font Family control type: ${J(await page.$eval('[role=dialog] input[aria-label="H1 Font Family"]', (e) => ({ type: e.type, list: e.getAttribute("list"), tag: e.tagName })))}`);
    await closeSettings(page);
  });
  // ---------- pipette ----------
  await step("H-11a", async () => {
    await openSettings(page);
    const color = dlg(page).locator('input[aria-label="H1 Color"]');
    say(`H-11 Color control: ${J(await color.evaluate((e) => ({ type: e.type, value: e.value })))}; pipette button label 'Choose H1 color' present: ${await dlg(page).locator('button[aria-label="Choose H1 color"]').count()}`);
    const before = await page.$$eval('[role=dialog] input', (e) => e.length);
    await dlg(page).locator('button[aria-label="Choose H1 color"]').click();
    await page.waitForTimeout(700);
    say(`H-11 clicked the pipette button in headless Chromium: dialog input count ${before} -> ${await page.$$eval('[role=dialog] input', (e) => e.length)}; H1 Color value ${J(await color.inputValue())}; page text lines containing 'color' or 'Color': ${J((await dlg(page).innerText()).split("\n").filter((l) => /color/i.test(l)).slice(0, 5))}`);
    await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t4sec2-pipette.png" });
    await closeSettings(page);
  });
  // ---------- staged edits: H-13, H-14 ----------
  await step("H-13", async () => {
    await openSettings(page);
    const size = () => dlg(page).locator('input[aria-label="H1 Font Size"]');
    const sp = () => dlg(page).locator('input[aria-label="H1 Letter Spacing"]');
    const before = await hStyle(page, "h1");
    await size().fill("99"); await sp().fill("0.2");
    await page.waitForTimeout(500);
    say(`H-13 typed H1 size 99 and spacing 0.2 without Save: editor h1 before=${J(before)} after=${J(await hStyle(page, "h1"))}; dialog preview style: ${J(await page.evaluate(() => { const p = [...document.querySelectorAll("[role=dialog] *")].find((e) => e.textContent === "The quick brown fox jumps over the lazy dog" && e.children.length === 0); const c = p && getComputedStyle(p); return c && { size: c.fontSize, ls: c.letterSpacing }; }))}`);
    await vis(dlg(page).getByRole("button", { name: "Cancel", exact: true })).first().click();
    await page.waitForTimeout(600);
    say(`H-14 after clicking the headings Cancel: dialog count=${await dlg(page).count()}; editor h1=${J(await hStyle(page, "h1"))}`);
    await openSettings(page);
    say(`H-14 reopened after Cancel: H1 size=${J(await size().inputValue())}, spacing=${J(await sp().inputValue())}`);
    await size().fill("99");
    await closeSettings(page);
    await openSettings(page);
    say(`H-14 typed 99, clicked Close (no Save), reopened: H1 size=${J(await size().inputValue())}; editor h1 size=${(await hStyle(page, "h1")).size}`);
    await closeSettings(page);
  });
  // ---------- save: H-06, H-07..H-11, H-15 ----------
  await step("H-06", async () => {
    await openSettings(page);
    await dlg(page).locator('input[aria-label="H1 Font Size"]').fill("60");
    await dlg(page).locator('input[aria-label="H1 Font Family"]').fill("Merriweather");
    await dlg(page).locator('select[aria-label="H1 Font Weight"]').selectOption({ label: "Normal" });
    await dlg(page).locator('input[aria-label="H1 Letter Spacing"]').fill("0.05");
    await dlg(page).locator('input[aria-label="H1 Color"]').evaluate((e) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(e, "#cc0000"); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); });
    await dlg(page).locator('input[aria-label="H2 Font Size"]').fill("33");
    await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).first().click();
    await page.waitForTimeout(800);
    say(`H-06/07..11 right after Save (dialog still open): h1=${J(await hStyle(page, "h1"))}; h2=${J(await hStyle(page, "h2"))}; h3=${J(await hStyle(page, "h3"))}`);
    say(`H-06 dialog state after Save Changes: dialog open=${await page.locator("[role=dialog]").count()}; visible text containing 'Saved'/'saved': ${J((await bodyText(page)).split("\n").filter((l) => /saved|Saved/.test(l)))}`);
    await closeSettings(page);
    await page.waitForTimeout(300);
    say(`H-06 after closing the dialog (no reload): h1=${J(await hStyle(page, "h1"))}`);
    const j = projJson(h);
    say(`H-06 project.json after save: editor-related config ${J(Object.fromEntries(Object.entries(j.config || {}).filter(([k]) => /edit|body|head|typo/i.test(k))))}`);
    await reopenDoc(page, "Head Test", "Doc One");
    say(`H-06 after reload: h1=${J(await hStyle(page, "h1"))}; h2=${J(await hStyle(page, "h2"))}`);
    // second project is unaffected
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
    await createProject(page, h, "Other Project", "Blank");
    await createDoc(page, "Other Doc");
    await openDoc(page, "Other Doc");
    await pm(page).click();
    await page.keyboard.type("Other heading");
    await page.click('button[aria-label="Heading 1"]');
    await page.waitForTimeout(300);
    say(`H-06 second project 'Other Project' (Blank, new): h1=${J(await hStyle(page, "h1"))}`);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Head Test"]'); await page.waitForTimeout(2000);
    await openDoc(page, "Doc One");
  });
  await step("H-15", async () => {
    const dark = async () => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=/Switch to (dark|light) mode/"); await page.waitForTimeout(700); };
    const snap = async (tag) => say(`H-15 ${tag}: h1(custom color)=${(await hStyle(page, "h1")).color}; h2(no custom color)=${(await hStyle(page, "h2")).color}; h3=${(await hStyle(page, "h3")).color}; p=${(await pStyle(page)).color}; html class=${J(await page.evaluate(() => document.documentElement.className))}`);
    await snap("light");
    await dark();
    await snap("after 'Switch to dark mode'");
    say(`A-11 p text color light vs dark: see lines above (light vs dark)`);
    await dark();
    await snap("after switching back");
  });
  // ---------- H-12: add / remove H4..H6 ----------
  await step("H-12", async () => {
    await openSettings(page);
    await dlg(page).getByRole("button", { name: "Add H4", exact: true }).click();
    await page.waitForTimeout(400);
    say(`H-12 after Add H4: headings controls ${J(await page.$$eval('[role=dialog] [aria-label$=" Font Size"]', (e) => e.map((x) => x.getAttribute("aria-label"))))}; buttons ${J(await vis(dlg(page).locator("button")).evaluateAll((bs) => bs.map((b) => (b.getAttribute("aria-label") || b.textContent).trim()).filter((t) => /Add H|Remove|H\d/.test(t))))}`);
    await dlg(page).getByRole("button", { name: "Add H5", exact: true }).click();
    await dlg(page).getByRole("button", { name: "Add H6", exact: true }).click();
    await page.waitForTimeout(400);
    say(`H-12 after Add H5, Add H6: ${J(await page.$$eval('[role=dialog] [aria-label$=" Font Size"]', (e) => e.map((x) => x.getAttribute("aria-label"))))}; buttons ${J(await vis(dlg(page).locator("button")).evaluateAll((bs) => bs.map((b) => (b.getAttribute("aria-label") || b.textContent).trim()).filter((t) => /Add H|Remove|H\d/.test(t))))}`);
    say(`H-12 remove controls for H1..H3 present: ${J(await page.$$eval('[role=dialog] button[aria-label*="Remove H"]', (e) => e.map((x) => x.getAttribute("aria-label"))))}`);
    const rem = dlg(page).getByRole("button", { name: "Remove H6", exact: true });
    say(`H-12 Remove H6 buttons: ${await rem.count()}`);
    if (await rem.count()) { await rem.click(); await page.waitForTimeout(400); }
    say(`H-12 after removing H6: ${J(await page.$$eval('[role=dialog] [aria-label$=" Font Size"]', (e) => e.map((x) => x.getAttribute("aria-label"))))}`);
    await dlg(page).locator('input[aria-label="H4 Font Size"]').fill("22");
    await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).first().click();
    await page.waitForTimeout(800);
    say(`H-12 after Save with H4 size 22 (H5 left empty): dialog count=${await dlg(page).count()}; editor h4 style=${J(await hStyle(page, "h4"))}`);
    if (await dlg(page).count()) await closeSettings(page);
    await reopenDoc(page, "Head Test", "Doc One");
    await openSettings(page);
    say(`H-12 after save and reload, heading levels listed: ${J(await page.$$eval('[role=dialog] [aria-label$=" Font Size"]', (e) => e.map((x) => x.getAttribute("aria-label")).filter((l) => /^H\d/.test(l))))}`);
    say(`H-12 toolbar heading buttons now: ${J(await page.$$eval('button[aria-label^="Heading "]', (b) => b.map((x) => x.getAttribute("aria-label"))))}`);
    await closeSettings(page);
  });
  // ---------- body appearance: A-06, A-09 ----------
  await step("A-09", async () => {
    await openSettings(page);
    const fields = ["Font Family", "Font Size", "Line Height", "Paragraph Spacing"];
    say(`A-09 Body Text Styles field default values/placeholders: ${J(await page.$$eval('[role=dialog] input', (els) => els.filter((e) => ["Font Family", "Font Size", "Line Height", "Paragraph Spacing"].includes(e.getAttribute("aria-label"))).map((e) => e.getAttribute("aria-label") + "=" + JSON.stringify(e.value) + "|ph=" + JSON.stringify(e.placeholder))))}`);
    await dlg(page).locator('input[aria-label="Font Size"]').fill("20px");
    await dlg(page).locator('input[aria-label="Line Height"]').fill("2.2");
    await dlg(page).locator('input[aria-label="Paragraph Spacing"]').fill("30px");
    await dlg(page).locator('input[aria-label="Font Family"]').fill("Lato");
    await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).nth(1).click();
    await page.waitForTimeout(900);
    await closeSettings(page);
    say(`A-09 after Body Text Styles Save (size 20px, line height 2.2, paragraph spacing 30px, family Lato): ${J(await pStyle(page))}`);
    say(`A-09 project.json config body: ${J(Object.fromEntries(Object.entries(projJson(h).config || {}).filter(([k]) => /edit|body|head|typo/i.test(k))))}`);
    await reopenDoc(page, "Head Test", "Doc One");
    say(`A-09 after reload: ${J(await pStyle(page))}`);
  });
  await step("A-06", async () => {
    // body line height below 1.8 via both controls
    await openSettings(page);
    await dlg(page).locator('input[aria-label="Line Height"]').fill("1");
    await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).nth(1).click();
    await page.waitForTimeout(900);
    if (await dlg(page).count()) await closeSettings(page);
    say(`A-06 Body Text Styles line height set to 1 and saved: ${J(await pStyle(page))}; project.json body=${J(projJson(h).config.editorConfig.body)}`);
    const tb = page.locator('input[aria-label="Line Height"]').first();
    await tb.fill("1.2");
    await tb.press("Enter");
    await page.waitForTimeout(600);
    say(`A-06 toolbar Line Height field set to 1.2 (+Enter): field value=${J(await tb.inputValue())}; ${J(await pStyle(page))}`);
    await tb.fill("0.5");
    await tb.press("Enter");
    await page.waitForTimeout(600);
    say(`A-06 toolbar Line Height 0.5: field=${J(await tb.inputValue())}; p lh=${J((await pStyle(page)).lh)}`);
  });
  await step("A-10", async () => {
    if (await page.locator("[role=dialog]").count()) await page.keyboard.press("Escape");
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Close Project");
    await page.waitForTimeout(1500);
    // The HTTP project-creation route resolves the type from the repo's getwrite-config (not GETWRITE_TEMPLATES_DIR),
    // which is not edited. A custom spec is run through the built CLI instead, into the throwaway projects folder.
    const spec = JSON.parse(readFileSync(path.join(h.templatesDir, "blank_project_type.json"), "utf8"));
    spec.id = "handbook_custom";
    spec.name = "Handbook Custom";
    spec.editorConfig.body = { fontFamily: "Lato", fontSize: "18px", lineHeight: "2.4", paragraphSpacing: "40px" };
    const specPath = path.join(h.run.dir, "custom-spec.json");
    writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const root = path.join(h.projectsDir, "11111111-2222-4333-8444-555555555555");
    const r = runCli(["project", "create", root, "--spec", specPath, "-n", "Tmpl Test"]);
    say(`A-10 CLI project create --spec <custom spec: body Lato 18px, lineHeight 2.4, paragraphSpacing 40px>: exit=${r.status}; ${J((r.stdout + r.stderr).split("\n").slice(0, 4))}`);
    const cfg = JSON.parse(readFileSync(path.join(root, "project.json"), "utf8"));
    say(`A-10 project.json editorConfig.body of the new project: ${J(cfg.config.editorConfig.body)}`);
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open Tmpl Test"]');
    await page.waitForTimeout(2000);
    await createDoc(page, "Tmpl Doc");
    await openDoc(page, "Tmpl Doc");
    await pm(page).click();
    await page.keyboard.type("One.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Two.");
    await page.waitForTimeout(500);
    say(`A-10 rendered body p in that project: ${J(await pStyle(page))}; toolbar Line Height field=${J(await page.$eval('input[aria-label="Line Height"]', (e) => e.value))}`);
  });
});
