// Task 6, web build: views/organizer.md rows O-01..O-09, O-23. Run OUTSIDE the sandbox.
import { reloadProject, withWeb, say, J, bodyText, step, createProject, createNode, treeClick, tabs, clickTab, typeInto, openSettings, closeSettings, dialogText, treeRows, outline, expandAll } from "./task6-lib.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const cardInfo = (page) => page.evaluate(() => [...document.querySelectorAll("[aria-labelledby^='res-']")].map((c) => ({ title: c.innerText.split("\n")[0], text: c.innerText.replace(/\n+/g, " | ").slice(0, 200), img: [...c.querySelectorAll("img")].map((i) => ({ w: i.naturalWidth, src: (i.getAttribute("src") || "").slice(0, 30) })), audio: [...c.querySelectorAll("audio")].map((a) => ({ controls: a.controls })) })));
await withWeb("t6-o1", {}, async ({ h, page }) => {
  await createProject(page, h, "Org", "Blank");
  const png = path.join(h.run.dir, "p.png"), mp3 = path.join(h.run.dir, "t.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=1", mp3]);
  await createNode(page, "Doc A", "text"); await createNode(page, "Pic", "image", "Workspace", png);
  await createNode(page, "Doc B", "text"); await createNode(page, "Tune", "audio", "Workspace", mp3);
  await typeInto(page, "Doc A", "Alpha opens the book with a long sentence about the river that runs past the mill and keeps on running for a very long way, well past what a short card could show, so the preview must be cut somewhere along the road. ".repeat(3));
  await typeInto(page, "Doc B", "Beta is short.");
  await createNode(page, "Texts", "folder", "Workspace"); await createNode(page, "Mixed", "folder", "Workspace");
  await reloadProject(page, "Org");
  await createNode(page, "T1", "text", "Texts"); await createNode(page, "T2", "text", "Texts");
  await createNode(page, "M1", "text", "Mixed"); await createNode(page, "MP", "image", "Mixed", png);
  await reloadProject(page, "Org");
  say("tree outline: " + J(outline(await treeRows(page))));
  await step("O-01..O-05", async () => {
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
    say("O-01 after clicking Workspace: tabs selected=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)));
    say("O-02 card order: " + J((await cardInfo(page)).map((c) => c.title)) + " ; tree order: " + J(outline(await treeRows(page))));
    const ci = await cardInfo(page);
    say("O-03/04/05 cards (default card-body setting): " + J(ci));
    await page.setViewportSize({ width: 1400, height: 900 });
    const pos = await page.evaluate(() => [...document.querySelectorAll("[aria-labelledby^='res-']")].map((c) => { const r = c.getBoundingClientRect(); return `${c.innerText.split("\n")[0]}@x${Math.round(r.left)},y${Math.round(r.top)}`; }));
    say("O-02 card positions: " + J(pos));
  });
  await step("O-07..O-09", async () => {
    await openSettings(page, "Organizer");
    say("O-08 Organizer tab text: " + J(await dialogText(page)));
    say("O-08 select options: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=dialog] select")].map((s) => [...s.querySelectorAll("option,optgroup")].map((o) => `${o.tagName}:${o.label || o.textContent}`)))));
    await closeSettings(page);
  });
  await step("O-08 choose sources", async () => {
    const setSrc = async (label) => {
      await openSettings(page, "Organizer");
      await page.locator("[role=dialog] select:has(option:text-is('Text excerpt'))").selectOption({ label });
      await page.waitForTimeout(1200);
      say(`O-08 selected "${label}"; dialog now: ${J((await dialogText(page)).slice(-300))}`);
      await closeSettings(page);
      await page.waitForTimeout(1200);
    };
    await setSrc("Text excerpt");
    say("O-03/O-08 cards with Text excerpt: " + J(await cardInfo(page)));
    say("O-09 toggle buttons: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => /BODIES/i.test(t)))));
    await page.locator("button:has-text('HIDE BODIES')").click(); await page.waitForTimeout(800);
    say("O-09 after Hide bodies: " + J(await cardInfo(page)) + " ; toggle now: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => /BODIES/i.test(t)))));
    await page.locator("button:has-text('SHOW BODIES')").click(); await page.waitForTimeout(800);
    say("O-09 after Show bodies: " + J((await cardInfo(page)).map((c) => c.text.slice(0, 80))));
    await setSrc("Synopsis");
    say("O-08 cards with a metadata field (Synopsis) as body: " + J(await cardInfo(page)));
    await setSrc("None");
    say("O-08 cards with None: " + J(await cardInfo(page)));
  });
  await step("O-23", async () => {
    for (const f of ["Texts", "Mixed", "Workspace"]) {
      await clickTab(page, "Data").catch(() => {});
      await page.locator(`[role=treeitem][aria-label="${f}"]`).first().click(); await page.waitForTimeout(1500);
      say(`O-23 clicked folder ${f} while on the Data tab -> selected tab=${J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text))}`);
    }
    await page.locator('[role=treeitem][aria-label="Texts"]').first().click(); await page.waitForTimeout(1200);
    await page.click('[role=tab]:has-text("Edit")').catch((e) => say("O-23 Edit tab click: " + e.message.slice(0, 60)));
    say("O-23 tabs with the text-only folder selected: " + J(await tabs(page)));
  });
});
