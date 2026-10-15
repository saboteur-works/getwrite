// Task 7, web build: protect-and-finish/revisions.md rows RV-01..RV-19, RV-21 (revision UI). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, typeAndSave, expandRevisions, revText, revCards, projectDir, walkFiles, rel, tick, openSettings, closeSettings, sidebarText, pm } from "./task7-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
const card = (page, n) => page.locator("article.revision-control-card").filter({ has: page.locator("p", { hasText: new RegExp(`^v${n} •`) }) });
const revDirs = (h) => { const pd = projectDir(h); const rs = path.join(pd, "revisions"); return walkFiles(rs).filter((p) => p.endsWith("metadata.json")).sort((a, b) => parseInt(a.match(/v-(\d+)/)[1]) - parseInt(b.match(/v-(\d+)/)[1])); };
const metas = (h) => revDirs(h).map((p) => ({ v: p.match(/v-(\d+)/)[1], meta: JSON.parse(readFileSync(p, "utf8")) }));
const brief = (h) => metas(h).map((m) => { const { filePath, resourceId, ...rest } = m.meta; return `v${m.v}:${J(rest)}`; });
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll("[role=status]")].map((e) => e.innerText).filter(Boolean));
const edText = (page) => pm(page).innerText();
await withWeb("t7-rv1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Rev A", "Blank");
  await createNode(page, "Doc", "text");
  await typeAndSave(page, "Doc", "Alpha one.");
  await expandRevisions(page);
  say("S1 cards after first text: " + J(await revCards(page)));
  say("S1 metadata files: " + J(brief(h)));
  say("RV-04/03 canonical badges count: " + (await page.locator(".revision-control-badge").count()));
  const side = await sidebarText(page);
  say("RV-05 sidebar (METADATA panel) mentions revision? " + J(side.split("\n").filter((l) => /revision/i.test(l))));
  say("RV-05 revision panel position: panel header text above editor? " + J(await page.evaluate(() => { const s = document.querySelector("section.revision-control-root"); const e = document.querySelector(".ProseMirror"); const side = [...document.querySelectorAll("*")].find((x) => x.innerText && x.innerText.startsWith("METADATA")); return { panelTop: Math.round(s.getBoundingClientRect().top), panelLeft: Math.round(s.getBoundingClientRect().left), editorTop: Math.round(e.getBoundingClientRect().top), metadataLeft: side ? Math.round(side.getBoundingClientRect().left) : null }; })));

  // RV-08..RV-11: explicit named revision
  const input = page.locator("#revision-control-content input[placeholder='Revision name']");
  say("RV-08 Save disabled with empty name: " + (await page.locator("#revision-control-content button:has-text('Save')").isDisabled()));
  await input.fill("Milestone One");
  await page.locator("#revision-control-content button:has-text('Save')").click(); await tick(page, 2500);
  say("RV-08 cards after Save with name 'Milestone One': " + J(await revCards(page)));
  say("RV-09 metadata files: " + J(brief(h)));
  say("RV-08 input after save: " + J(await input.inputValue()));
  // an unnamed one: save through API with empty name?
  const ids = await page.evaluate(async () => null);
  await typeAndSave(page, "Doc", " Beta two.", 6000);
  await input.fill("Milestone Two");
  await page.locator("#revision-control-content button:has-text('Save')").click(); await tick(page, 2500);
  say("S3 cards after more typing and a second named revision: " + J(await revCards(page)));
  say("S3 metadata files: " + J(brief(h)));
  say("S3 editor: " + J(await edText(page)));

  // RV-06: set an earlier revision canonical, edit, save
  const cv1 = card(page, 2);
  say("RV-06 v2 card buttons: " + J(await cv1.locator("button").evaluateAll((b) => b.map((x) => (x.getAttribute("aria-label") || "") + "/" + x.innerText.trim()))));
  await cv1.locator("button:has-text('Set as Canonical Revision')").click(); await tick(page, 3000);
  say("RV-06 toasts: " + J(await toasts(page)));
  say("RV-06 cards after Set as Canonical on v2: " + J(await revCards(page)));
  say("RV-06 editor now: " + J(await edText(page)));
  say("RV-06 metadata: " + J(brief(h)));
  await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.insertText(" Gamma three."); await tick(page, 6500);
  say("RV-06 after typing into the earlier (now canonical) revision: cards " + J(await revCards(page)));
  say("RV-06 metadata: " + J(brief(h)));
  say("RV-06 revision dirs: " + J(walkFiles(path.join(projectDir(h), "revisions")).map((p) => rel(projectDir(h), p).replace(/^revisions\/[^/]+\//, ""))));

  // RV-01/02 restore by Roll Back
  const cm = card(page, 3);
  await cm.locator("button:has-text('View Revision')").click(); await tick(page, 2000);
  say("RV-01 View Revision on v3: " + J(await cm.innerText()));
  await cm.locator("button:has-text('Roll Back to Revision')").click(); await tick(page, 3000);
  say("RV-02 toasts after Roll Back: " + J(await toasts(page)));
  say("RV-02 cards after Roll Back on v3: " + J(await revCards(page)));
  say("RV-02 editor now: " + J(await edText(page)));
  say("RV-02 metadata: " + J(brief(h)));

  // RV-07: canonical cannot be deleted
  const cards = await revCards(page);
  const can = cards.find((c) => c.badges.includes("CANONICAL"));
  say("RV-07 canonical card buttons: " + J(can));
  const canVer = parseInt(can.sub.match(/v(\d+)/)[1]);
  const meta = metas(h);
  const canId = await page.evaluate(() => null);
  say("RV-07 canonical version = v" + canVer);

  // RV-12: no rename
  say("RV-12 inputs inside revision cards: " + (await page.locator("article.revision-control-card input").count()) + "; all button labels across cards: " + J([...new Set(cards.flatMap((c) => c.buttons.map((b) => b.replace(/ v\d+/, ""))))]));
  await page.locator("article.revision-control-card h4").first().dblclick(); await tick(page, 600);
  say("RV-12 after double-click on a card heading, inputs in cards: " + (await page.locator("article.revision-control-card input").count()));
  await page.locator("article.revision-control-card h4").first().click({ button: "right" }); await tick(page, 600);
  say("RV-12 after right-click on heading, menus: " + J(await page.$$eval("[role=menu], .resource-context-menu-item", (e) => e.map((x) => x.innerText))));
  await page.keyboard.press("Escape");

  // RV-13..RV-19: protect
  const other = cards.find((c) => !c.badges.includes("CANONICAL"));
  const ov = parseInt(other.sub.match(/v(\d+)/)[1]);
  const dirOf = (v) => path.dirname(revDirs(h).find((p) => p.includes(`/v-${v}/`)));
  const snap = (v) => ({ meta: JSON.parse(readFileSync(path.join(dirOf(v), "metadata.json"), "utf8")), contentSha: sha(path.join(dirOf(v), "content.bin")) });
  const b0 = snap(ov);
  await card(page, ov).locator(`button[aria-label="Protect revision v${ov}"]`).click(); await tick(page, 2000);
  const b1 = snap(ov);
  say(`RV-13/15 non-canonical v${ov} before: ${J(b0)} ; after Protect: ${J(b1)}`);
  say("RV-15/17 card after Protect: " + J((await revCards(page)).find((c) => c.sub.startsWith("v" + ov + " "))));
  await card(page, ov).locator(`button[aria-label="Unprotect revision v${ov}"]`).click(); await tick(page, 2000);
  const b2 = snap(ov);
  say(`RV-13 after Unprotect: ${J(b2)} ; name unchanged=${b2.meta.name === b0.meta.name}, content unchanged=${b2.contentSha === b0.contentSha}`);
  // protected canonical
  const cb0 = snap(canVer);
  await card(page, canVer).locator(`button[aria-label="Protect revision v${canVer}"]`).click(); await tick(page, 2000);
  say("RV-15/17 protected canonical card: " + J((await revCards(page)).find((c) => c.sub.startsWith("v" + canVer + " "))) + " ; meta " + J(snap(canVer).meta) + " ; before " + J(cb0.meta));
  say("RV-17 badge elements: " + J(await card(page, canVer).locator(".revision-control-protected-badge").evaluateAll((e) => e.map((x) => ({ text: x.innerText.trim(), svg: !!x.querySelector("svg"), svgAriaHidden: x.querySelector("svg")?.getAttribute("aria-hidden") })))));
  await card(page, canVer).locator(`button[aria-label="Unprotect revision v${canVer}"]`).click(); await tick(page, 1500);
  // delete refusal
  await card(page, ov).locator(`button[aria-label="Protect revision v${ov}"]`).click(); await tick(page, 1500);
  const delBtn = card(page, ov).locator("button:has-text('Delete Revision')");
  say(`RV-18 Delete Revision button on protected v${ov}: count=${await delBtn.count()} disabled=${await delBtn.isDisabled()}`);
  const before = (await revCards(page)).length;
  await delBtn.click(); await tick(page, 1500);
  const ptxt = await page.evaluate(() => [...document.querySelectorAll("p,div,[role=status],[role=alert]")].filter((e) => e.children.length === 0 && /Protected revisions cannot|Failed to delete/.test(e.innerText)).map((e) => e.className + ":" + e.innerText));
  say(`RV-18 after click: messages ${J(ptxt)}; cards before ${before}, after ${(await revCards(page)).length}; dirs still: ${revDirs(h).length}`);
  await card(page, ov).locator(`button[aria-label="Unprotect revision v${ov}"]`).click(); await tick(page, 1500);
  await card(page, ov).locator("button:has-text('Delete Revision')").click(); await tick(page, 2500);
  say(`RV-19 after Unprotect then Delete: cards ${J((await revCards(page)).map((c) => c.sub))}; toasts ${J(await toasts(page))}; dirs ${J(revDirs(h).map((p) => p.match(/v-(\d+)/)[1]))}`);
  // RV-07 API probe on canonical (probe sent from the page against the throwaway server)
  const res = await page.evaluate(async ({ projectId, resId, vid }) => {
    const r = await fetch(`/api/resource/revision/${resId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, revisionId: vid }) });
    return { status: r.status, body: await r.text() };
  }, await (async () => {
    const pd = projectDir(h); const resId = readFileSync(path.join(pd, "project.json"), "utf8") && walkFiles(path.join(pd, "revisions"))[0].split("/revisions/")[1].split("/")[0];
    const projectId = path.basename(pd);
    const canMeta = metas(h).find((m) => m.meta.isCanonical);
    return { projectId, resId, vid: canMeta.meta.id };
  })());
  say("RV-07 API DELETE of the canonical revision: " + J(res) + " ; dirs after: " + J(revDirs(h).map((p) => p.match(/v-(\d+)/)[1])));

  // RV-21: Project Settings: any revision setting
  await openSettings(page);
  const tabs = await page.$$eval("[role=dialog] [role=tab], dialog [role=tab]", (t) => t.map((x) => x.innerText));
  say("RV-21 Project Settings tabs: " + J(tabs));
  for (const t of tabs) {
    await page.click(`[role=dialog] [role=tab]:has-text("${t}"), dialog [role=tab]:has-text("${t}")`); await tick(page, 500);
    const d = await page.evaluate(() => (document.querySelector("[role=dialog], dialog")?.innerText || ""));
    const hits = d.split("\n").filter((l) => /revision|prune|maximum|limit|keep/i.test(l));
    say(`RV-21 tab ${t}: lines matching revision|prune|maximum|limit|keep = ${J(hits)}`);
  }
  await closeSettings(page);
  const menu = await (async () => { await page.click('button[aria-label="Open project settings menu"]'); const t = await page.$$eval("[role=menu] *, .resource-context-menu-item", (e) => e.map((x) => x.innerText).filter(Boolean)); await page.keyboard.press("Escape"); return t; })();
  say("RV-21 project settings menu entries: " + J([...new Set(menu)]));
  const pj = JSON.parse(readFileSync(path.join(projectDir(h), "project.json"), "utf8"));
  say("RV-28 project.json config keys: " + J(Object.keys(pj.config)) + " ; maxRevisions=" + J(pj.config.maxRevisions) + " autoPrune=" + J(pj.config.autoPrune) + " defaultRevisionName=" + J(pj.config.defaultRevisionName));
});
