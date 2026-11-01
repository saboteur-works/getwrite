// Handbook re-run, group 2 (OQ-8), web build: statements on the write pages that were only read in code
// (Features 90 and 91), plus the Discard button, heading defaults, Markdown switch and a failed save.
// Usage: node g2-web.mjs <section>. Run OUTSIDE the sandbox.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, waitSaved, newProjectWithDoc, projectDirs } from "./task4-lib.mjs";

const dlg = (page) => page.locator("[role=dialog]").first();
const openEditorTab = async (page) => {
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings");
  await page.waitForTimeout(800);
  await dlg(page).locator('[role=tab]:has-text("Editor")').click();
  await page.waitForTimeout(600);
};
const closeSettings = async (page) => { await page.keyboard.press("Escape"); await page.waitForTimeout(500); };
const editorConfig = (h) => JSON.parse(readFileSync(path.join(projectDirs(h)[0], "project.json"), "utf8")).config?.editorConfig;
const bodySection = (page) => dlg(page).locator("section,form,fieldset,div").filter({ hasText: "Body Text Styles" }).filter({ has: page.locator('[aria-label="Body Line Height"]') }).last();
const options = (loc) => loc.evaluate((s) => [...s.options].map((o) => o.textContent));
const saveBody = async (page) => { await bodySection(page).getByRole("button", { name: "Save Changes" }).click(); await page.waitForTimeout(1200); };
const pStyle = (page) => page.evaluate(() => { const p = document.querySelector(".ProseMirror p"); const c = getComputedStyle(p); return { fontFamily: c.fontFamily, fontSize: c.fontSize, lineHeight: c.lineHeight, inline: p.getAttribute("style") }; });
const allStyle = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((p) => { const c = getComputedStyle(p); return { t: p.innerText.slice(0, 12), fontFamily: c.fontFamily, fontSize: c.fontSize, weight: c.fontWeight, lineHeight: c.lineHeight, spacing: c.letterSpacing }; }), sel);
const alerts = (page) => dlg(page).locator("[role=alert]").allInnerTexts();

const sections = {
  async body({ h, page }) {
    await newProjectWithDoc(page, h, "Body Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("A first paragraph."); await page.keyboard.press("Enter"); await page.keyboard.type("A second paragraph.");
    await waitSaved(page);
    say(`paragraph defaults: ${J(await allStyle(page, ".ProseMirror p"))}`);
    await openEditorTab(page);
    say(`Editor tab text: ${J((await dlg(page).innerText()).split("\n").filter(Boolean).slice(0, 80))}`);
    say(`aria-labels in the tab: ${J(await dlg(page).locator("[aria-label]").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label"))))}`);
    const fam = dlg(page).locator('[aria-label="Body Font Family"]');
    await step("list", async () => say(`Body Font Family options: ${J(await options(fam))}`));
    await step("refused-chars", async () => {
      await fam.selectOption({ label: "Other..." }); await page.waitForTimeout(400);
      say(`after Other...: ${J(await dlg(page).locator("input[type=text]").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label"))))}`);
      const field = dlg(page).locator('input[aria-label="Body Font Family other name"]').first();
      for (const c of [`"`, `'`, ";", "{", "}", "\\", "(", ")", "<", ">", ","]) {
        await field.fill(`Bad${c}Name`); await page.waitForTimeout(150);
        say(`typed ${J("Bad" + c + "Name")}: alerts=${J(await alerts(page))} fieldValue=${J(await field.inputValue())}`);
      }
      await field.fill("Bad;Name"); await page.waitForTimeout(200);
      const before = J(editorConfig(h));
      let posts = 0; const count = (r) => { if (r.method() !== "GET") posts++; }; page.on("request", count);
      await saveBody(page);
      page.off("request", count);
      say(`Save Changes with Bad;Name: non-GET requests=${posts}; config unchanged=${before === J(editorConfig(h))}; field=${J(await field.inputValue())}; alerts=${J(await alerts(page))}`);
      await field.fill("My Missing Font"); await page.waitForTimeout(200);
      say(`typed My Missing Font: alerts=${J(await alerts(page))}`);
      await bodySection(page).getByRole("button", { name: "Discard changes" }).click(); await page.waitForTimeout(400);
      say(`after Discard: family=${J(await fam.inputValue())}; settings still open=${await dlg(page).isVisible()}`);
    });
    await step("typed-font", async () => {
      await fam.selectOption({ label: "Other..." }); await page.waitForTimeout(300);
      await dlg(page).locator('input[aria-label="Body Font Family other name"]').first().fill("My Missing Font");
      await saveBody(page);
      say(`saved typed font: config.body=${J(editorConfig(h)?.body)}`);
      await closeSettings(page);
      say(`paragraph with the typed font: ${J(await pStyle(page))}`);
    });
    await step("toolbar-extra", async () => {
      await pm(page).locator("p").first().click(); await page.waitForTimeout(400);
      const tb = page.locator('select[aria-label="Font Family"], select[aria-label="Font family"]').first();
      say(`toolbar font control: value=${J(await tb.evaluate((s) => s.options[s.selectedIndex].textContent))}; options=${J(await options(tb))}`);
    });
    await step("line-height-refused", async () => {
      await openEditorTab(page);
      const lh = dlg(page).locator('[aria-label="Body Line Height"]');
      for (const v of ["1.2", "0", "normal", "150%", "2em", "24px", "1.79"]) {
        const before = J(editorConfig(h)?.body);
        await lh.fill(v); await saveBody(page);
        say(`body line height ${J(v)}: alerts=${J(await alerts(page))} field=${J(await lh.inputValue())} config unchanged=${before === J(editorConfig(h)?.body)}`);
      }
      for (const v of ["1.8", "9", ""]) {
        await lh.fill(v); await saveBody(page);
        say(`body line height ${J(v)}: alerts=${J(await alerts(page))} config.body.lineHeight=${J(editorConfig(h)?.body?.lineHeight)}`);
      }
      await lh.fill("2.4"); await saveBody(page);
      await closeSettings(page);
      say(`after saving 2.4: ${J(await allStyle(page, ".ProseMirror p"))}`);
    });
    await step("toolbar-lh", async () => {
      await pm(page).locator("p").first().click(); await page.waitForTimeout(400);
      const f = page.locator('input[aria-label="Line Height"]').first();
      say(`toolbar Line Height shows ${J(await f.inputValue())} with an unset paragraph (body 2.4)`);
      for (const v of ["0", "-1", ""]) {
        await f.fill(v); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
        const msg = (await bodyText(page)).split("\n").filter((l) => /Line height must/.test(l));
        say(`toolbar ${J(v)}: message=${J(msg)} field=${J(await f.inputValue())}`);
        await page.keyboard.press("Tab"); await page.waitForTimeout(300);
        const msg2 = (await bodyText(page)).split("\n").filter((l) => /Line height must/.test(l));
        say(`  after leaving the field: field=${J(await f.inputValue())} message=${J(msg2)} paragraphs=${J((await allStyle(page, ".ProseMirror p")).map((p) => p.lineHeight))}`);
        await pm(page).locator("p").first().click(); await page.waitForTimeout(200);
      }
      await f.fill("1.2"); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
      say(`toolbar 1.2 (below the settings floor): paragraphs=${J(await allStyle(page, ".ProseMirror p"))}; field=${J(await f.inputValue())}`);
      await openEditorTab(page);
      await dlg(page).locator('[aria-label="Body Line Height"]').fill("3"); await saveBody(page); await closeSettings(page);
      say(`body changed to 3: paragraphs=${J((await allStyle(page, ".ProseMirror p")).map((p) => [p.t, p.lineHeight]))}`);
      await pm(page).locator("p").nth(1).click(); await page.waitForTimeout(300);
      say(`second (unset) paragraph: toolbar Line Height=${J(await f.inputValue())}`);
      await pm(page).locator("p").first().click(); await page.waitForTimeout(300);
      say(`first (own value) paragraph: toolbar Line Height=${J(await f.inputValue())}`);
    });
    await step("toolbar-at-cursor", async () => {
      const tb = page.locator('select[aria-label="Font Family"], select[aria-label="Font family"]').first();
      const size = page.locator('input[aria-label="Font Size"]').first();
      await pm(page).locator("p").nth(1).click(); await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("A heading line");
      await page.click('button[aria-label="Heading 1"]'); await page.waitForTimeout(500);
      say(`in a Heading 1: font=${J(await tb.evaluate((s) => s.options[s.selectedIndex].textContent))} size=${J(await size.inputValue())}; rendered=${J(await allStyle(page, ".ProseMirror h1"))}`);
      await pm(page).locator("p").first().click(); await page.waitForTimeout(400);
      say(`in a paragraph: font=${J(await tb.evaluate((s) => s.options[s.selectedIndex].textContent))} size=${J(await size.inputValue())}`);
    });
  },

  async headings({ h, page }) {
    const external = [];
    page.on("request", (r) => { if (!r.url().startsWith(h.baseUrl) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); });
    await newProjectWithDoc(page, h, "Head Test", "Doc One");
    await pm(page).click();
    for (const l of [1, 2, 3, 4, 5, 6]) { await page.keyboard.type(`Level ${l}`); await page.click(`button[aria-label="Heading ${l}"]`); await page.keyboard.press("End"); await page.keyboard.press("Enter"); }
    await page.keyboard.type("Body paragraph."); await page.click('button[aria-label="Paragraph"]').catch(() => {});
    await waitSaved(page);
    say(`default rendering: ${J(await allStyle(page, ".ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6,.ProseMirror p"))}`);
    await openEditorTab(page);
    const f = (n) => dlg(page).locator(`[aria-label="${n}"]`);
    await step("h-lists", async () => {
      say(`H1 Font Family options: ${J(await options(f("H1 Font Family")))}`);
      for (const fam of ["IBM Plex Serif", "Inter", "Source Serif 4", "Arial", "serif"]) {
        await f("H1 Font Family").selectOption({ label: fam }); await page.waitForTimeout(200);
        say(`H1 weights with ${fam}: ${J(await options(f("H1 Font Weight")))}`);
      }
    });
    await step("h-add", async () => {
      await dlg(page).getByRole("button", { name: "Add H4" }).click(); await page.waitForTimeout(300);
      say(`after Add H4: buttons=${J(await dlg(page).getByRole("button").evaluateAll((b) => b.map((x) => x.textContent.trim()).filter((t) => /Add H|Remove/.test(t))))}`);
      say(`note for empty level: ${J((await dlg(page).innerText()).split("\n").filter((l) => /not kept/.test(l)))}`);
    });
    await step("h-refuse", async () => {
      await f("H2 Font Family").selectOption({ label: "Other..." }); await page.waitForTimeout(300);
      const labels = await dlg(page).locator("input[type=text]").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label")));
      say(`text inputs: ${J(labels)}`);
      const nameField = dlg(page).locator('input[aria-label="H2 Font Family other name"]').first();
      await nameField.fill("Bad;Name"); await page.waitForTimeout(200);
      const before = J(editorConfig(h));
      const headSave = dlg(page).getByRole("button", { name: "Save Changes" }).first();
      await headSave.click(); await page.waitForTimeout(1000);
      say(`heading Save with a refused name: alerts=${J(await alerts(page))} field=${J(await nameField.inputValue())} config unchanged=${before === J(editorConfig(h))}`);
      await dlg(page).getByRole("button", { name: "Discard changes" }).first().click(); await page.waitForTimeout(400);
      say(`after heading Discard: H2 family=${J(await f("H2 Font Family").inputValue())}; H1 family=${J(await f("H1 Font Family").inputValue())}; open=${await dlg(page).isVisible()}`);
    });
    await step("discard-scope", async () => {
      await f("Body Font Size").fill("19");
      await f("H1 Font Size").fill("55");
      await dlg(page).getByRole("button", { name: "Discard changes" }).first().click(); await page.waitForTimeout(400);
      say(`Discard in Heading Styles: H1 size=${J(await f("H1 Font Size").inputValue())}; Body size still=${J(await f("Body Font Size").inputValue())}`);
      await bodySection(page).getByRole("button", { name: "Discard changes" }).click(); await page.waitForTimeout(300);
      say(`Discard buttons in the tab: ${await dlg(page).getByRole("button", { name: "Discard changes" }).count()}; Body size after its Discard=${J(await f("Body Font Size").inputValue())}`);
    });
    await step("save-order", async () => {
      await f("H1 Font Size").fill("60");
      await dlg(page).getByRole("button", { name: "Save Changes" }).first().click(); await page.waitForTimeout(1200);
      say(`dialog open after heading save=${await dlg(page).isVisible()}; config.headings.h1=${J(editorConfig(h)?.headings?.h1)}; rendered h1=${J((await allStyle(page, ".ProseMirror h1")).map((x) => x.fontSize))}`);
      await f("Body Font Size").fill("18"); await saveBody(page);
      say(`after a body save: headings kept=${J(editorConfig(h)?.headings?.h1)}; body=${J(editorConfig(h)?.body)}`);
      await closeSettings(page);
      say(`rendered h1 after body save=${J((await allStyle(page, ".ProseMirror h1")).map((x) => x.fontSize))}`);
    });
    await step("unlisted", async () => {
      const file = path.join(projectDirs(h)[0], "project.json");
      const pj = JSON.parse(readFileSync(file, "utf8"));
      pj.config.editorConfig.headings.h1 = { ...pj.config.editorConfig.headings.h1, fontFamily: "Domine", fontWeight: "lighter" };
      writeFileSync(file, JSON.stringify(pj, null, 2));
      await page.reload(); await page.waitForTimeout(2000);
      await page.click('button[aria-label="Open Head Test"]'); await page.waitForTimeout(2000);
      await openEditorTab(page);
      const fam = f("H1 Font Family");
      say(`stored Domine: select shows ${J(await fam.evaluate((s) => s.options[s.selectedIndex].textContent))}; text inputs=${J(await dlg(page).locator("input[type=text]").evaluateAll((e) => e.map((x) => [x.getAttribute("aria-label"), x.value])))}`);
      say(`stored weight lighter: ${J(await f("H1 Font Weight").evaluate((s) => [s.options[s.selectedIndex].textContent, [...s.options].map((o) => o.textContent)]))}`);
      await closeSettings(page);
      say(`after open and close: stored family=${J(editorConfig(h)?.headings?.h1?.fontFamily)} weight=${J(editorConfig(h)?.headings?.h1?.fontWeight)}`);
    });
    await step("bundled-network", async () => {
      await openEditorTab(page);
      await f("H2 Font Family").selectOption({ label: "Playfair Display" });
      await dlg(page).getByRole("button", { name: "Save Changes" }).first().click(); await page.waitForTimeout(1500);
      await closeSettings(page); await page.waitForTimeout(800);
      const loaded = await page.evaluate(() => [...document.fonts].filter((x) => x.status === "loaded").map((x) => x.family));
      say(`requests to anywhere but this server during the whole run: ${J(external)}; loaded font faces include Playfair: ${loaded.some((x) => /Playfair/i.test(x))}`);
    });
  },

  async defaults({ h, page }) {
    await newProjectWithDoc(page, h, "Scale Test", "Doc One");
    await pm(page).click();
    await page.keyboard.type("Only a paragraph.");
    await waitSaved(page);
    const f = () => page.locator('input[aria-label="Line Height"]').first();
    await pm(page).locator("p").first().click(); await page.waitForTimeout(300);
    say(`new Blank project: paragraph=${J(await allStyle(page, ".ProseMirror p"))}; toolbar Line Height=${J(await f().inputValue())}`);
    await pm(page).press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("Second.");
    await page.waitForTimeout(300);
    say(`gap: ${J(await page.evaluate(() => { const [a, b] = document.querySelectorAll(".ProseMirror p"); return b.getBoundingClientRect().top - a.getBoundingClientRect().bottom; }))}px`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=/Switch to (dark|light) mode/"); await page.waitForTimeout(800);
    say(`color after theme switch: ${await page.evaluate(() => getComputedStyle(document.querySelector(".ProseMirror p")).color)}`);
  },

  async color({ h, page }) {
    await newProjectWithDoc(page, h, "Color Test", "Doc One");
    await pm(page).click();
    for (const l of [1, 2]) { await page.keyboard.type(`Level ${l}`); await page.click(`button[aria-label="Heading ${l}"]`); await page.keyboard.press("End"); await page.keyboard.press("Enter"); }
    await page.keyboard.type("Body words."); await waitSaved(page);
    await openEditorTab(page);
    const c = dlg(page).locator('[aria-label="H1 Color"]');
    say(`H1 Color control: ${J(await c.evaluate((e) => [e.type, e.value]))}; sibling buttons: ${J(await c.evaluate((e) => [...e.parentElement.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent)))}`);
    await c.evaluate((e) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(e, "#123456"); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(300);
    await dlg(page).getByRole("button", { name: "Save Changes" }).first().click(); await page.waitForTimeout(1200);
    say(`saved: headings.h1=${J(editorConfig(h)?.headings?.h1)}`);
    await closeSettings(page);
    const colors = () => page.evaluate(() => ["h1", "h2", "p"].map((t) => [t, getComputedStyle(document.querySelector(".ProseMirror " + t)).color]));
    say(`light: ${J(await colors())}`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=/Switch to (dark|light) mode/"); await page.waitForTimeout(800);
    say(`dark: ${J(await colors())}`);
  },

  async bodysave({ h, page }) {
    await newProjectWithDoc(page, h, "Body Save", "Doc One");
    await pm(page).click(); await page.keyboard.type("One."); await page.keyboard.press("Enter"); await page.keyboard.type("Two."); await waitSaved(page);
    await openEditorTab(page);
    const f = (n) => dlg(page).locator(`[aria-label="${n}"]`);
    await f("Body Font Size").fill("20"); await f("Body Font Family").selectOption({ label: "Lato" }); await f("Body Paragraph Spacing").fill("30");
    await saveBody(page);
    say(`saved: body=${J(editorConfig(h)?.body)}; dialog open=${await dlg(page).isVisible()}`);
    await closeSettings(page);
    const read = () => page.evaluate(() => { const [a, b] = document.querySelectorAll(".ProseMirror p"); const c = getComputedStyle(a); return { family: c.fontFamily, size: c.fontSize, gap: b.getBoundingClientRect().top - a.getBoundingClientRect().bottom }; });
    say(`rendered: ${J(await read())}`);
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Body Save"]'); await page.waitForTimeout(2000);
    await openDoc(page, "Doc One");
    say(`after reload: ${J(await read())}`);
    await openEditorTab(page);
    say(`fields after reload: size=${J(await f("Body Font Size").inputValue())} family=${J(await f("Body Font Family").inputValue())} spacing=${J(await f("Body Paragraph Spacing").inputValue())}`);
  },

  async spacing({ h, page }) {
    await newProjectWithDoc(page, h, "Gap Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("One."); await page.keyboard.press("Enter"); await page.keyboard.type("Two."); await waitSaved(page);
    const gap = () => page.evaluate(() => { const [a, b] = document.querySelectorAll(".ProseMirror p"); return b.getBoundingClientRect().top - a.getBoundingClientRect().bottom; });
    for (const v of ["30px", "30", "2em", "abc", "", "-5px"]) {
      await openEditorTab(page);
      const f = dlg(page).locator('[aria-label="Body Paragraph Spacing"]');
      say(`placeholder=${J(await f.getAttribute("placeholder"))}`);
      await f.fill(v); await saveBody(page);
      say(`Paragraph Spacing ${J(v)}: alerts=${J(await alerts(page))}; stored=${J(editorConfig(h)?.body?.paragraphSpacing)}`);
      await closeSettings(page);
      say(`  gap=${await gap()}px`);
    }
  },

  async hdefaults({ h, page }) {
    await newProjectWithDoc(page, h, "Scale Test", "Doc One");
    await pm(page).click();
    await page.keyboard.type("Body line one.");
    for (const l of [1, 2, 3, 4, 5, 6]) {
      await page.keyboard.press("Enter"); await page.keyboard.type(`Level ${l}`); await page.waitForTimeout(150);
      await page.click(`button[aria-label="Heading ${l}"]`); await page.waitForTimeout(250);
      await pm(page).locator(`h${l}`).last().click(); await page.keyboard.press("End");
    }
    await waitSaved(page);
    say(`rendered: ${J(await allStyle(page, ".ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6,.ProseMirror p"))}`);
    await openEditorTab(page);
    await dlg(page).locator('[aria-label="Body Font Size"]').fill("22"); await saveBody(page); await closeSettings(page);
    say(`with body 22: ${J((await allStyle(page, ".ProseMirror h4,.ProseMirror h5,.ProseMirror h6,.ProseMirror p")).map((x) => [x.t, x.fontSize]))}`);
  },

  async markdown({ h, page }) {
    await newProjectWithDoc(page, h, "Md Test", "Doc One");
    await createDoc(page, "Doc Two");
    await openDoc(page, "Doc One");
    await pm(page).click(); await page.keyboard.type("start words"); await waitSaved(page);
    const dir = projectDirs(h)[0];
    const { readdirSync } = await import("node:fs");
    const textOf = () => Object.fromEntries(readdirSync(path.join(dir, "resources")).map((id) => [id.slice(0, 6), readFileSync(path.join(dir, "resources", id, "content.txt"), "utf8").trim()]));
    const info = await page.$$eval('button[aria-label="Edit as Markdown"], button[aria-label="Toggle Markdown controls"]', (b) => b.map((x) => [x.getAttribute("aria-label"), x.disabled, x.offsetWidth, x.closest("[aria-label]")?.getAttribute("aria-label")]));
    say(`controls: ${J(info)}; width=${await page.evaluate(() => innerWidth)}`);
    const enterMd = async () => {
      await page.locator('button[aria-label="Edit as Markdown"]').first().evaluate((b) => b.click());
      await page.waitForTimeout(800);
      const d = page.locator("[role=dialog],[role=alertdialog]").first();
      if (await d.isVisible().catch(() => false)) {
        say(`switch dialog: ${J((await d.innerText()).split("\n").filter(Boolean))}`);
        await d.locator("button").last().click(); await page.waitForTimeout(800);
      }
    };
    await enterMd();
    say(`after Edit as Markdown: textareas=${await page.locator("textarea:visible").count()}; ProseMirror visible=${await pm(page).isVisible().catch(() => false)}`);
    const ta = page.locator("textarea:visible").first();
    for (let i = 1; i <= 3; i++) {
      const word = `mdword${i}`;
      await ta.click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` ${word}`);
      await page.waitForTimeout(100);
      await openDoc(page, "Doc Two"); await page.waitForTimeout(2500);
      say(`Markdown trial ${i}: typed then opened another document 100ms later: saved to the right document=${Object.values(textOf()).some((t) => t.includes(word))}; files=${J(textOf())}`);
      await openDoc(page, "Doc One"); await page.waitForTimeout(800);
      if (!(await ta.isVisible().catch(() => false))) await enterMd();
    }
  },

  async ptfont({ h, page }) {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500);
    await dlg(page).getByRole("button", { name: "New Project Type" }).click(); await page.waitForTimeout(800);
    const labels = await dlg(page).locator("select,input").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label") || x.id).filter((l) => /font/i.test(l || "")));
    say(`font fields: ${J(labels)}`);
    const fam = dlg(page).locator("select[aria-label*='Font Family']").first();
    say(`first family field=${await fam.getAttribute("aria-label")}; options end=${J((await options(fam)).slice(-2))}`);
    await fam.selectOption({ label: "Other..." }); await page.waitForTimeout(300);
    const name = dlg(page).locator("input[aria-label$='other name']").first();
    await name.fill("Bad;Name"); await page.waitForTimeout(250);
    say(`typed Bad;Name: alerts=${J(await dlg(page).locator("[role=alert]").allInnerTexts())}; field=${J(await name.inputValue())}`);
    const save = dlg(page).getByRole("button", { name: "Save", exact: true }).first();
    await dlg(page).getByLabel("Name", { exact: true }).first().fill("Font Refuse").catch(() => {});
    await save.click(); await page.waitForTimeout(1200);
    const { readdirSync } = await import("node:fs");
    say(`Save with a refused name: saved files=${J(readdirSync(h.savedTypesDir))}; alerts=${J(await dlg(page).locator("[role=alert]").allInnerTexts())}`);
  },

  async ptbody({ h, page }) {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Project Type Manager')"); await page.waitForTimeout(1500);
    await dlg(page).locator("button:has-text('Blank')").first().click(); await page.waitForTimeout(600);
    await dlg(page).locator('[aria-label="Body Font Size"]').fill("18");
    await dlg(page).locator('[aria-label="Body Font Family"]').selectOption({ label: "Lato" });
    await dlg(page).getByRole("button", { name: "Save as copy", exact: true }).click(); await page.waitForTimeout(1500);
    await dlg(page).getByRole("button", { name: "Close", exact: true }).first().click(); await page.waitForTimeout(800);
    await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
    await page.fill('input:not([aria-label="Filter project types"])', "From Type");
    const opts = await page.$$eval("select option", (os) => os.map((o) => o.textContent));
    say(`project type options: ${J(opts)}`);
    await page.selectOption("select", { label: opts.find((o) => /Saved/.test(o)) });
    await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
    await createDoc(page, "Doc One"); await openDoc(page, "Doc One");
    await pm(page).click(); await page.keyboard.type("Typed words."); await waitSaved(page);
    say(`project from the saved type: ${J(await pStyle(page))}`);
    await openEditorTab(page);
    await dlg(page).locator('[aria-label="Body Line Height"]').fill(""); await saveBody(page);
    say(`line height left empty: stored=${J(editorConfig(h)?.body?.lineHeight)}`);
    await closeSettings(page);
    await pm(page).locator("p").first().click(); await page.waitForTimeout(300);
    say(`rendered=${J(await pStyle(page))}; toolbar Line Height=${J(await page.locator('input[aria-label="Line Height"]').first().inputValue())}`);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await page.waitForTimeout(800);
    await dlg(page).locator('[role=tab]:has-text("Default Revision Name")').click(); await page.waitForTimeout(500);
    say(`Default Revision Name section: visible buttons=${J(await dlg(page).getByRole("button").evaluateAll((b) => b.filter((x) => x.offsetWidth).map((x) => x.textContent.trim()).filter((t) => /Discard|Save/.test(t))))}; field=${J(await dlg(page).locator("input[type=text]:visible").first().inputValue().catch(() => null))}`);
    const rev = dlg(page).locator("input[type=text]:visible").first();
    await rev.fill("Changed name"); await dlg(page).getByRole("button", { name: "Discard changes" }).last().click(); await page.waitForTimeout(300);
    say(`after its Discard: field=${J(await rev.inputValue())}`);
  },

  async closeproj({ h, page }) {
    await newProjectWithDoc(page, h, "Close Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("words"); await waitSaved(page);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')");
    for (const ms of [500, 2500, 6000]) {
      await page.waitForTimeout(ms);
      say(`${ms}ms later: url=${page.url().replace(h.baseUrl, "")}; text=${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 14))}; open buttons=${J(await page.locator("button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label") || x.textContent.trim()).filter((t) => /open/i.test(t))))}`);
    }
    await page.getByRole("button", { name: /open project/i }).first().click().catch((e) => say("click failed " + String(e.message).split("\n")[0]));
    await page.waitForTimeout(2500);
    say(`after clicking Open project: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 6))}`);
  },

  async closepending({ h, page }) {
    await newProjectWithDoc(page, h, "Close Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("words"); await waitSaved(page);
    for (let i = 1; i <= 3; i++) {
      await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` more${i}`);
      await page.waitForTimeout(100);
      await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')");
      for (const ms of [500, 2500, 6000]) {
        await page.waitForTimeout(ms);
        say(`trial ${i}, +${ms}ms: url=${page.url().replace(h.baseUrl, "")}; dialogs=${await page.locator("[role=dialog],[role=alertdialog]").count()}; first lines=${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 8))}; open buttons=${J(await page.locator("button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label") || x.textContent.trim()).filter((t) => /^open /i.test(t))))}`);
      }
      const btn = page.locator('button[aria-label="Open Close Test"]');
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(2500); await openDoc(page, "Doc One"); }
      else { say("no Open button; reloading"); await page.reload(); await page.waitForTimeout(2500); await btn.click(); await page.waitForTimeout(2500); await openDoc(page, "Doc One"); }
    }
  },

  async closedialog({ h, page }) {
    await newProjectWithDoc(page, h, "Close Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("words"); await waitSaved(page);
    const d = () => page.locator("[role=dialog],[role=alertdialog]").first();
    const dir = projectDirs(h)[0];
    const { readdirSync } = await import("node:fs");
    const file = () => readFileSync(path.join(dir, "resources", readdirSync(path.join(dir, "resources"))[0], "content.txt"), "utf8").trim();
    const type = async (w) => { await pm(page).click(); await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.type(` ${w}`); await page.waitForTimeout(100); };
    const close = async () => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')"); await page.waitForTimeout(1200); };
    const state = async (label) => say(`${label}: file=${J(file())}; dialogs=${await page.locator("[role=dialog],[role=alertdialog]").count()}; on Start Page=${await page.locator('button[aria-label="Open Close Test"]').count() > 0}`);
    await type("one"); await close();
    say(`dialog text: ${J((await d().innerText()).split("\n").filter(Boolean))}; html role=${await d().getAttribute("role")}; heading=${J(await d().locator("h1,h2,h3").allInnerTexts())}`);
    await state("dialog showing");
    const buttons = await d().locator("button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label") || x.textContent.trim()));
    say(`buttons: ${J(buttons)}`);
    await page.waitForTimeout(4000);
    await state("dialog left open 4s");
    await d().getByRole("button", { name: "Keep Editing" }).click(); await page.waitForTimeout(400);
    await state("after Keep Editing");
    for (let i = 1; i <= 3; i++) {
      await page.waitForTimeout(4000);
      await type(`now${i}`);
      await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')");
      await d().getByRole("button", { name: "Close Project" }).click();
      await page.waitForTimeout(3000);
      await state(`trial ${i}: Close Project chosen straight away, 3s later`);
      say(`  word saved=${file().includes(`now${i}`)}`);
      await page.locator('button[aria-label="Open Close Test"]').click(); await page.waitForTimeout(2500); await openDoc(page, "Doc One");
    }
  },

  async fonts({ h, page }) {
    const external = [];
    page.on("request", (r) => { if (!r.url().startsWith(h.baseUrl) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); });
    await newProjectWithDoc(page, h, "Font Test", "Doc One");
    await pm(page).click(); await page.keyboard.type("Words."); await waitSaved(page);
    for (const fam of ["Inter", "Merriweather", "Playfair Display", "Lato", "Source Serif 4", "Playwrite IE", "Fascinate Inline", "IBM Plex Sans", "IBM Plex Sans Condensed", "IBM Plex Mono", "IBM Plex Serif", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana", "Trebuchet MS", "serif", "sans-serif", "monospace"]) {
      await openEditorTab(page);
      await dlg(page).locator('[aria-label="Body Font Family"]').selectOption({ label: fam });
      await saveBody(page); await closeSettings(page); await page.waitForTimeout(500);
      const r = await page.evaluate((f) => { const faces = [...document.fonts].filter((x) => x.family.replace(/"/g, "").toLowerCase() === f.toLowerCase()); return { faces: faces.length, loaded: faces.filter((x) => x.status === "loaded").length, used: getComputedStyle(document.querySelector(".ProseMirror p")).fontFamily }; }, fam);
      say(`${fam}: ${J(r)}; external requests so far=${external.length}`);
    }
    say(`external requests in the run: ${J(external)}`);
  },

  async saving({ h, page }) {
    await newProjectWithDoc(page, h, "Save Test", "Doc One");
    await createDoc(page, "Doc Two");
    await openDoc(page, "Doc One");
    const dir = projectDirs(h)[0];
    const textOf = async () => {
      const { readdirSync, existsSync } = await import("node:fs");
      const out = {};
      for (const id of readdirSync(path.join(dir, "resources"))) { const p = path.join(dir, "resources", id, "content.txt"); out[id.slice(0, 6)] = existsSync(p) ? readFileSync(p, "utf8").trim() : null; }
      return out;
    };
    await step("delay", async () => {
      await pm(page).click(); await page.keyboard.type("timed words");
      const t0 = Date.now(); let saved = false; const done = page.waitForRequest((r) => r.method() !== "GET" && /resource|revision/.test(r.url()), { timeout: 8000 }).then((r) => { saved = true; return r.url().replace(h.baseUrl, ""); });
      say(`first save request after ${await done.then((u) => `${Date.now() - t0}ms to ${u}`)}; saved=${saved}`);
      await waitSaved(page);
    });
    await step("switch-rich", async () => {
      await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" switched");
      await page.waitForTimeout(100);
      await openDoc(page, "Doc Two"); await page.waitForTimeout(2000);
      say(`typed then opened another document within 100ms: files=${J(await textOf())}`);
      await openDoc(page, "Doc One");
    });
    await step("reload-rich", async () => {
      await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" reloaded");
      await page.waitForTimeout(100);
      await page.reload(); await page.waitForTimeout(2500);
      say(`typed then reloaded within 100ms: files=${J(await textOf())}`);
      await page.click('button[aria-label="Open Save Test"]'); await page.waitForTimeout(2000);
      await openDoc(page, "Doc One");
    });
    await step("close-rich", async () => {
      await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" closed");
      await page.waitForTimeout(100);
      await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')"); await page.waitForTimeout(2500);
      say(`typed then closed the project within 100ms: files=${J(await textOf())}`);
      await page.reload(); await page.waitForTimeout(2500);
      await page.click('button[aria-label="Open Save Test"]'); await page.waitForTimeout(2000);
      await openDoc(page, "Doc One");
    });
    await step("markdown-switch", async () => {
      const cands = await page.locator("button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label") || x.textContent.trim()).filter((t) => /markdown/i.test(t)));
      say(`Markdown controls: ${J(cands)}`);
      await page.click('button[aria-label="Toggle Markdown controls"]'); await page.waitForTimeout(300);
      await page.getByRole("button", { name: /Edit as Markdown/i }).first().click(); await page.waitForTimeout(800);
      say(`Markdown mode: textarea count=${await page.locator("textarea").count()}; lines=${J((await bodyText(page)).split("\n").filter((l) => /markdown|rich text/i.test(l)).slice(0, 6))}`);
      const ta = page.locator("textarea").first();
      await ta.click(); await page.keyboard.press("ControlOrMeta+End"); await page.keyboard.type(" markdownend");
      await page.waitForTimeout(100);
      await openDoc(page, "Doc Two"); await page.waitForTimeout(2500);
      say(`Markdown: typed then opened another document within 100ms: files=${J(await textOf())}`);
      await openDoc(page, "Doc One"); await page.waitForTimeout(800);
    });
    await step("failed-save", async () => {
      const editorVisible = await pm(page).isVisible().catch(() => false);
      if (!editorVisible) { await page.getByRole("button", { name: /rich text|Edit as rich/i }).first().click().catch(() => {}); await page.waitForTimeout(600); }
      await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.type(" failing");
      await page.route("**/*", (route) => (route.request().method() !== "GET" ? route.abort() : route.continue()));
      const before = await bodyText(page);
      await page.waitForTimeout(100);
      await openDoc(page, "Doc Two"); await page.waitForTimeout(2500);
      const had = new Set(before.split("\n"));
      say(`save refused after moving on: new lines=${J((await bodyText(page)).split("\n").filter((l) => l.trim() && !had.has(l)).slice(0, 15))}`);
      await page.unroute("**/*");
    });
  },
};

const name = process.argv[2];
await withWeb(`g2-${name}`, name === "ptfont" || name === "ptbody" ? { savedTypes: true, copyTemplates: true } : {}, sections[name]);
process.exit(0);
