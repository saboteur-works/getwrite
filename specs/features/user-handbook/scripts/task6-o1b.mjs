// Task 6, web build: views/organizer.md O-03..O-09, O-23 (second part). Run OUTSIDE the sandbox.
import { reloadProject, withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, clickTab, typeInto, openSettings, closeSettings, dialogText, treeRows, outline, expandAll, cards, dumpButtons, sidecars, addSidebarField } from "./task6-lib.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
await withWeb("t6-o1b", {}, async ({ h, page }) => {
  await createProject(page, h, "Org", "Blank");
  const png = path.join(h.run.dir, "p.png"), mp3 = path.join(h.run.dir, "t.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=1", mp3]);
  await createNode(page, "Doc A", "text"); await createNode(page, "Pic", "image", "Workspace", png);
  await createNode(page, "Tune", "audio", "Workspace", mp3);
  await typeInto(page, "Doc A", "Alpha opens the book with a long sentence about the river that runs past the mill and keeps on running for a very long way, well past what a short card could show, so the preview must be cut somewhere along the road. ".repeat(3));
  await createNode(page, "Texts", "folder", "Workspace"); await createNode(page, "Mixed", "folder", "Workspace");
  await reloadProject(page, "Org");
  await createNode(page, "T1", "text", "Texts"); await createNode(page, "T2", "text", "Texts");
  await createNode(page, "M1", "text", "Mixed"); await createNode(page, "MP", "image", "Mixed", png);
  await reloadProject(page, "Org");
  await step("sidebar fields", async () => {
    await treeClick(page, "Doc A");
    say("sidebar inputs: " + J(await page.evaluate(() => [...document.querySelectorAll("textarea,input,select")].map((e) => `${e.tagName}|${e.getAttribute("aria-label") || e.name || e.id}|${e.type}`))));
  });
  await step("Pic card html", async () => {
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
    say("Pic card HTML: " + J(await page.evaluate(() => [...document.querySelectorAll("[aria-labelledby^='res-']")].filter((c) => /^Pic/.test(c.innerText)).map((c) => c.innerHTML.replace(/<svg.*?<\/svg>/g, "<svg/>").slice(0, 1500)))));
    say("Tune card HTML: " + J(await page.evaluate(() => [...document.querySelectorAll("[aria-labelledby^='res-']")].filter((c) => /^Tune/.test(c.innerText)).map((c) => c.innerHTML.replace(/<svg.*?<\/svg>/g, "<svg/>").slice(0, 1500)))));
    say("any media on page: " + J(await page.evaluate(() => ({ img: [...document.querySelectorAll("img")].length, audio: [...document.querySelectorAll("audio")].length, bg: [...document.querySelectorAll("[style*=background]")].length }))));
  });
  await step("O-23", async () => {
    for (const f of ["Texts", "Mixed", "Workspace"]) {
      await expandAll(page);
      await page.locator('[role=treeitem][aria-label="Doc A"]').first().click(); await page.waitForTimeout(1200);
      await page.click('[role=tab]:has-text("Edit")'); await page.waitForTimeout(600);
      const before = (await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text);
      await page.locator(`[role=treeitem][aria-label="${f}"]`).first().click(); await page.waitForTimeout(1500);
      say(`O-23 from ${J(before)} on a document, clicked folder ${f} -> selected tab=${J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text))}; cards=${J((await cards(page)).map((c) => c.title + ":" + c.text.split("|")[1].trim()))}`);
    }
  });
  await step("O-08 Status as body", async () => {
    await treeClick(page, "Doc A"); await page.selectOption("select[aria-label=status]", { label: "Draft" }); await page.waitForTimeout(1500);
    await openSettings(page, "Organizer");
    await page.locator("[role=dialog] select:has(option:text-is('Text excerpt'))").selectOption({ label: "Status" }); await page.waitForTimeout(1200);
    await closeSettings(page); await page.waitForTimeout(800);
    await expandAll(page);
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
    say("O-08 cards with Status as the body: " + J((await cards(page)).map((c) => c.text)));
  });
  await step("O-08 custom field as body", async () => {
    await treeClick(page, "Doc A");
    await addSidebarField(page, "mood", "Mood", "Text", "Document");
    await page.fill("input[aria-label=mood]", "tense"); await page.keyboard.press("Tab"); await page.waitForTimeout(1800);
    await openSettings(page, "Organizer");
    say("O-08 body-source options with a custom field: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] select")].filter((s) => [...s.options].some((o) => o.textContent === "Text excerpt")).map((s) => [...s.querySelectorAll("option,optgroup")].map((o) => `${o.tagName}:${o.label || o.textContent}`)))));
    await page.locator("[role=dialog] select:has(option:text-is('Text excerpt'))").selectOption({ label: "Mood" }); await page.waitForTimeout(1200);
    await closeSettings(page); await page.waitForTimeout(800);
    await expandAll(page);
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
    say("O-08 cards with the custom field Mood as the body: " + J((await cards(page)).map((c) => c.text)));
  });
});
