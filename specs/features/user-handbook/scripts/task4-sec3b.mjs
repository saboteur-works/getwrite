// Task 4, web build: writing-log footer, details window and goals (W-01..W-26). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, newProjectWithDoc, waitSaved, readLog, createProject } from "./task4-lib.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const dlg = (page) => page.locator("[role=dialog]");
const cfg = (h) => { const d = readdirSync(h.projectsDir)[0]; return JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")).config; };
const footerLine = async (page) => (await bodyText(page)).split("\n").filter((l) => /^Today|incomplete|unavailable/.test(l));
async function openGoals(page) {
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings");
  await page.waitForTimeout(600);
  await dlg(page).locator('[role=tab]:has-text("Writing Goals")').click();
  await page.waitForTimeout(400);
}
const closeSettings = async (page) => { await dlg(page).locator("button:has-text('Close')").first().click(); await page.waitForTimeout(500); };
// red-ish: r>=150, g<=110, b<=110
const redScan = (page, selector) => page.evaluate((sel) => {
  const roots = sel === "FOOTER" ? [[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Today's writing").parentElement] : [...document.querySelectorAll(sel)];
  const out = new Set(); let n = 0;
  for (const r of roots) for (const e of [r, ...r.querySelectorAll("*")]) {
    const c = getComputedStyle(e);
    for (const v of [c.color, c.backgroundColor, c.borderTopColor, c.borderBottomColor, c.borderLeftColor, c.borderRightColor, c.fill, c.stroke]) {
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(v || ""); if (!m) continue; n++;
      const [R, G, B] = [+m[1], +m[2], +m[3]]; const A = m[4] === undefined ? 1 : +m[4];
      if (A > 0.05 && R >= 150 && G <= 110 && B <= 110) out.add(`${e.tagName}.${(e.className || "").toString().slice(0, 30)}:${v}`);
    }
  }
  return { elements: roots.length, colorValuesChecked: n, redish: [...out].slice(0, 6) };
}, selector);
const lastFooterRoot = "FOOTER";

await withWeb("t4sec3b", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Goal Test", "Doc One");
  await step("W-02", async () => {
    say(`W-04 footer with no goal, before typing: ${J(await footerLine(page))}`);
    await pm(page).click();
    await page.keyboard.type("one two three four five");
    say(`W-04 footer with no goal after saving 5 words: ${J(await waitSaved(page))}`);
    say(`W-02 'Today's writing' sits in the editor footer next to the figure: footer text ${J((await bodyText(page)).split("\n").filter((l) => /^Words|^Node|Today/.test(l)))}`);
  });
  await step("W-05", async () => {
    await page.hover("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(700);
    say(`W-06 tooltip after hover: ${J(await page.$$eval("#editview-writing-log-tip, [role=tooltip]", (e) => e.map((x) => x.textContent.trim())))}`);
    await page.click("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(800);
    say(`W-05/07/08 details window text: ${J((await dlg(page).innerText()).split("\n").filter(Boolean))}`);
    say(`W-10 form controls inside the window: inputs/textarea/select=${await dlg(page).locator("input, textarea, select").count()}; buttons: ${J(await dlg(page).locator("button").evaluateAll((b) => b.map((x) => x.textContent.trim())))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    say(`W-11/12 after Escape: dialogs=${await dlg(page).count()}; focused element text=${J(await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim().slice(0, 30)))}`);
    await page.click("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(600);
    await dlg(page).locator("button:has-text('Close')").last().click();
    await page.waitForTimeout(500);
    say(`W-11/12 after clicking Close: dialogs=${await dlg(page).count()}; focused element text=${J(await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim().slice(0, 30)))}`);
    say(`W-09 'Today's count may be incomplete' visible in a normal state: ${(await bodyText(page)).includes("Today's count may be incomplete")}`);
  });
  await step("W-17", async () => {
    await openGoals(page);
    say(`W-17/22 Writing Goals tab text: ${J((await dlg(page).locator("section:visible, [role=tabpanel]:visible").first().innerText().catch(async () => (await dlg(page).innerText()))).split("\n").filter(Boolean).slice(0, 14))}`);
    say(`W-22 field order (labels in the tab): ${J(await dlg(page).locator("label:visible").evaluateAll((l) => l.map((x) => x.textContent.trim())))}`);
    const daily = dlg(page).locator("#daily-word-goal");
    const trials = ["20", "0", "-5", "2.5", "abc", "1,000", " 12 ", ""];
    for (const v of trials) {
      await daily.fill(v);
      await dlg(page).getByRole("button", { name: /Save daily goal/ }).click();
      await page.waitForTimeout(900);
      const msgs = await dlg(page).locator("#daily-word-goal ~ p:visible, [role=alert]:visible, [role=status]:visible").evaluateAll((p) => p.map((x) => x.textContent.trim()).filter(Boolean));
      say(`W-18 daily goal input ${J(v)} -> message ${J(msgs)}; project.json dailyWordGoal=${J(cfg(h).dailyWordGoal)}`);
    }
    await daily.fill("20");
    await dlg(page).getByRole("button", { name: /Save daily goal/ }).click();
    await page.waitForTimeout(900);
    say(`W-03 project.json dailyWordGoal=${J(cfg(h).dailyWordGoal)}; footer behind the dialog: ${J(await footerLine(page))}`);
    await closeSettings(page);
    say(`W-03 footer with goal 20 after closing, no reload: ${J(await footerLine(page))}`);
    await openGoals(page);
    say(`W-19 reopened Project Settings without reload: Daily word goal field value=${J(await dlg(page).locator("#daily-word-goal").inputValue())} (saved value 20)`);
    await closeSettings(page);
  });
  await step("W-20", async () => {
    await openGoals(page);
    await dlg(page).locator("#project-word-count-goal").fill("1000");
    await dlg(page).getByRole("button", { name: /Save word-count goal/ }).click();
    await page.waitForTimeout(900);
    say(`W-20/22/23 after Save word-count goal 1000: messages ${J(await dlg(page).locator("[role=status]:visible, [role=alert]:visible").evaluateAll((p) => p.map((x) => x.textContent.trim()).filter(Boolean)))}; project.json wordCountGoal=${J(cfg(h).wordCountGoal)}, dailyWordGoal=${J(cfg(h).dailyWordGoal)}`);
    await closeSettings(page);
    say(`W-20 footer after total goal 1000: ${J(await footerLine(page))}`);
    await openGoals(page);
    say(`W-23 reopened without reload: Total word-count goal field=${J(await dlg(page).locator("#project-word-count-goal").inputValue())} (saved 1000); Daily=${J(await dlg(page).locator("#daily-word-goal").inputValue())}`);
    await dlg(page).locator("#project-word-count-goal").fill("");
    await dlg(page).getByRole("button", { name: /Save word-count goal/ }).click();
    await page.waitForTimeout(800);
    say(`W-23 clearing the total goal: messages ${J(await dlg(page).locator("[role=status]:visible, [role=alert]:visible").evaluateAll((p) => p.map((x) => x.textContent.trim()).filter(Boolean)))}; project.json wordCountGoal=${J(cfg(h).wordCountGoal)}`);
    await closeSettings(page);
  });
  await step("W-24", async () => {
    say(`W-24 sidebar for the text resource: lines ${J((await bodyText(page)).split("\n").filter((l) => /WORD COUNT GOAL|Word count goal/i.test(l)))}`);
    const inp = page.locator('input[aria-label="word-count-goal-input"]');
    say(`W-24 progress bar before any resource goal: ${await page.locator('[role=progressbar]').count()}`);
    await inp.fill("10");
    await page.waitForTimeout(1500);
    say(`W-25 after typing 10 in the Word count goal field: progressbars=${await page.locator("[role=progressbar]").count()}; aria=${J(await page.$$eval("[role=progressbar]", (e) => e.map((x) => [x.getAttribute("aria-valuenow"), x.getAttribute("aria-valuemax")])))}; text ${J((await bodyText(page)).split("\n").filter((l) => /words ·/.test(l)))}`);
    await waitSaved(page, 1500);
    const sc = readdirSync(path.join(h.projectsDir, readdirSync(h.projectsDir)[0], "meta")).filter((f) => f.endsWith(".meta.json"));
    say(`W-24 sidecar wordCountGoal on disk: ${J(sc.map((f) => JSON.parse(readFileSync(path.join(h.projectsDir, readdirSync(h.projectsDir)[0], "meta", f), "utf8")).wordCountGoal))}`);
    say(`W-26 footer unchanged by the resource goal: ${J(await footerLine(page))}; footer contains the string 'goal 10' or '/ 10': ${(await footerLine(page)).join(" ").includes("/ 10")}`);
    // image resource: no section
    const imgPath = path.join(h.run.dir, "pic.png"); writeFileSync(imgPath, PNG);
    await page.click('button[aria-label="Workspace options"]');
    await page.click(".resource-context-menu-item:has-text('Create')");
    await page.locator("[role=dialog] input[type=text]").first().fill("Picture");
    await page.selectOption("select", "image");
    await page.setInputFiles("input[type=file]", imgPath);
    await dlg(page).locator("button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
    await openDoc(page, "Picture");
    await page.waitForTimeout(1200);
    say(`W-24 image resource selected: sidebar lines with 'WORD COUNT GOAL': ${J((await bodyText(page)).split("\n").filter((l) => /WORD COUNT GOAL/i.test(l)))}; imgs=${await page.locator("img").count()}`);
    await openDoc(page, "Doc One");
    await page.waitForTimeout(1200);
  });
  await step("W-14", async () => {
    // Daily goal 20, resource goal 10, now write past both
    await pm(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two");
    say(`W-14 footer past the daily goal (22 words written, goal 20): ${J(await waitSaved(page))}`);
    say(`W-14/26 progress bar past the resource goal: ${J((await bodyText(page)).split("\n").filter((l) => /words ·/.test(l)))}`);
    say(`W-14 red scan footer area: ${J(await redScan(page, lastFooterRoot))}`);
    say(`W-26 red scan progress bar section: ${J(await redScan(page, '[role=progressbar], [role=progressbar] *'))}`);
    say(`W-26 red scan of the whole right sidebar goal field: ${J(await redScan(page, 'input[aria-label="word-count-goal-input"]'))}`);
    await page.click("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(700);
    say(`W-14 red scan details window: ${J(await redScan(page, "[role=dialog]"))}`);
    await page.keyboard.press("Escape");
    // for contrast, an element known to be the red token: positive control of the scanner
    say(`scanner positive control (a synthetic div with #D44040): ${J(await page.evaluate(() => { const d = document.createElement("div"); d.id = "ctl"; d.style.color = "#D44040"; d.textContent = "x"; document.body.appendChild(d); return 1; }))} -> ${J(await redScan(page, "#ctl"))}`);
  });
  await step("W-15", async () => {
    // make the day file unreadable in the throwaway project, reload, read footer
    const files = readdirSync(h.projectsDir).map((d) => path.join(h.projectsDir, d, "meta", "writing-log"));
    const dir = files[0];
    const f = path.join(dir, readdirSync(dir)[0]);
    const orig = readFileSync(f, "utf8");
    writeFileSync(f, "{ not json");
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Goal Test"]'); await page.waitForTimeout(2000);
    await openDoc(page, "Doc One"); await page.waitForTimeout(1500);
    say(`W-15 day file replaced by invalid JSON, reloaded: footer ${J(await footerLine(page))}`);
    await page.click("button:has-text(\"Today's writing\")");
    await page.waitForTimeout(800);
    say(`W-15 details window with the unreadable day file: ${J((await dlg(page).innerText()).split("\n").filter(Boolean))}`);
    await page.keyboard.press("Escape");
    writeFileSync(f, orig);
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="Open Goal Test"]'); await page.waitForTimeout(2000);
    await openDoc(page, "Doc One"); await page.waitForTimeout(1500);
    say(`W-15 file restored, reloaded: footer ${J(await footerLine(page))}`);
  });
});
