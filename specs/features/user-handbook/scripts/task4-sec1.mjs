// Task 4, web build: write/editor.md rows F-08..F-11 and write/search.md rows SE-01..SE-05. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, html, footer, waitSaved, newProjectWithDoc, reopenDoc, plainHtml } from "./task4-lib.mjs";
await withWeb("t4sec1", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Editor Test", "Doc One");
  await step("F-08", async () => {
    say(`F-08 editor element: count=${await page.locator(".ProseMirror").count()} contenteditable=${await pm(page).getAttribute("contenteditable")}`);
    await pm(page).click();
    await page.keyboard.type("Plain words here");
    say(`F-08 after typing, editor text: ${J(await pm(page).innerText())}`);
  });
  await step("F-09", async () => {
    say(`F-09 toolbar button labels: ${J(await page.$$eval("button[aria-label]", (bs) => bs.map((b) => b.getAttribute("aria-label")).filter((l) => /^(Bold|Italic|Underline|Strikethrough|Inline code|Align |Heading|Bullet|Ordered|Blockquote|Horizontal|Highlight|Undo|Redo|Insert|Edit as)/.test(l))))}`);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Plain words here");
    await waitSaved(page);
    for (const label of ["Bold", "Italic", "Underline", "Strikethrough", "Inline code"]) {
      for (let trial = 1; trial <= 2; trial++) {
        await reopenDoc(page, "Editor Test", "Doc One");
        await pm(page).locator("p").first().click({ clickCount: 3 });
        const sel = await page.evaluate(() => window.getSelection().toString());
        await page.click(`button[aria-label="${label}"]`);
        await page.waitForTimeout(300);
        say(`F-09 ${label} button, trial ${trial}, selection before click=${J(sel)}: ${await plainHtml(page)}`);
      }
    }
  });
  await step("F-10", async () => {
    for (const [name, combo] of [["bold", "B"], ["italic", "I"], ["underline", "U"]]) {
      for (const mod of ["Control", "Meta"]) {
        for (let trial = 1; trial <= 2; trial++) {
          await reopenDoc(page, "Editor Test", "Doc One");
          await pm(page).locator("p").first().click({ clickCount: 3 });
          const sel = await page.evaluate(() => window.getSelection().toString());
          await page.keyboard.press(`${mod}+${combo}`);
          await page.waitForTimeout(250);
          say(`F-10 ${mod}+${combo} (${name}), trial ${trial}, selection=${J(sel)}: ${await plainHtml(page)}`);
        }
      }
    }
    say(`navigator.platform in the run: ${await page.evaluate(() => navigator.platform)}`);
  });
  await step("F-11", async () => {
    await pm(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("One two three.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Four five six seven.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Eight.");
    await page.waitForTimeout(250);
    say(`F-11 footer 250 ms after typing 3 paragraphs / 8 words / ${"One two three.\nFour five six seven.\nEight.".length} chars: ${J(await footer(page))}`);
    say(`F-11 whole-window text lines containing 'har' or 'ara' or 'Words': ${J((await bodyText(page)).split("\n").filter((l) => /har|ara|Words/i.test(l)))}`);
    await page.keyboard.type(" Nine ten.");
    await page.waitForTimeout(250);
    say(`F-11 footer after 2 more words: ${J(await footer(page))}`);
  });
  // search
  await step("SE", async () => {
    await createDoc(page, "Alpha Scene");
    await createDoc(page, "Beta Chapter");
    await createDoc(page, "Gamma Note");
    await openDoc(page, "Alpha Scene");
    say(`SE header after opening Alpha Scene: ${J((await bodyText(page)).split("\n").filter((l) => /Alpha Scene|Beta Chapter|Gamma Note/.test(l)).slice(0, 6))}`);
    say(`SE search affordance text near search box: ${J((await bodyText(page)).split("\n").filter((l) => /⌘|Ctrl|K$/.test(l)))}`);
    for (const key of ["Control+k", "Meta+k"]) {
      await pm(page).click();
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
      const active = await page.evaluate(() => document.activeElement && (document.activeElement.getAttribute("aria-label") || document.activeElement.placeholder || document.activeElement.tagName));
      say(`SE-01 ${key} from the editor: focused element = ${J(active)}`);
      await page.keyboard.type("beta");
      await page.waitForTimeout(900);
      say(`SE-02 after typing "beta" (${key}): result-like text ${J((await bodyText(page)).split("\n").filter((l) => /Beta|beta/.test(l)))}`);
      say(`SE-02 listbox/option elements: ${J(await page.$$eval("[role=option], [role=listbox] *, [role=menuitem]", (e) => e.map((x) => (x.textContent || "").trim().slice(0, 40)).slice(0, 8)))}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
      say(`SE-03 after Enter (${key}): header lines ${J((await bodyText(page)).split("\n").filter((l) => /^(Alpha Scene|Beta Chapter|Gamma Note)$/.test(l)))}; editing doc title area ${J((await bodyText(page)).split("\n").filter((l) => /EDITING/.test(l)))}`);
      await openDoc(page, "Alpha Scene");
    }
    // mouse click on a result
    await pm(page).click();
    await page.keyboard.press("Meta+k");
    await page.keyboard.type("gamma");
    await page.waitForTimeout(900);
    const res = page.locator("text=Gamma Note").last();
    say(`SE-03 click path: result count for 'Gamma Note' text elements=${await page.locator("text=Gamma Note").count()}`);
    await res.click();
    await page.waitForTimeout(1500);
    say(`SE-03 after clicking the result: ${J((await bodyText(page)).split("\n").filter((l) => /EDITING|^Gamma Note$|^Alpha Scene$/.test(l)))}`);
    await page.screenshot({ path: "/tmp/getwrite-handbook/logs/t4sec1-search.png" });
  });
});
