// Task 6, web build: views/data.md rows D-01..D-16. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, clickTab, tabs, typeInto as typeInto6, reloadProject, expandAll, sidecars, projectDir, sidecarByName, createProject as cp } from "./task6-lib.mjs";
import { setupData, queryHelpers, setField, setOp, tick, chips } from "./task5-qlib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const dataText = async (page) => { const t = await bodyText(page); const i = t.indexOf("Overview"); const j = t.lastIndexOf("\nMETADATA\n"); return t.slice(Math.max(0, t.lastIndexOf("\n", i - 1) + 1), j < 0 ? undefined : j); };
const closeProjectIfOpen = async (page) => { await page.goto(page.url().split("/").slice(0, 3).join("/") + "/"); await page.waitForTimeout(1500); };
const openData = async (page) => { await page.click('[role=tab]:has-text("Data")'); await page.waitForTimeout(1500); };
const tbl = async (page) => page.evaluate(() => [...document.querySelectorAll("table tr")].map((r) => [...r.children].map((c) => c.innerText.trim()).join(" | ")));
await withWeb("t6-d1", {}, async ({ h, page }) => {
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
  await setupData(page, h, "Dat");
  page.setDefaultTimeout(15000);
  await step("D-02..D-04", async () => {
    await treeClick(page, "Scene A"); await openData(page);
    say("D-02/03/09 Data tab text: " + J(await dataText(page)));
    say("D-09 table rows: " + J(await tbl(page)));
    say("sidecar wordCounts: " + J(sidecars(h).map((s) => `${s.json.name}:${s.json.type}:wc=${s.json.wordCount}:status=${J(s.json.userMetadata?.status ?? null)}:updatedAt=${s.json.updatedAt}`)));
  });
  await step("D-02 other types", async () => {
    const png = path.join(h.run.dir, "p.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1", png]);
    await createNode(page, "Pic", "image", "Workspace", png); await createNode(page, "Fold", "folder", "Workspace");
    await openData(page);
    const t = await dataText(page);
    say("D-02 after adding one image and one folder: " + J(t.split("\n").slice(0, 12)) + " ; table=" + J(await tbl(page)));
    say("D-14 resource list names: " + J(t.split("\n").filter((l) => /^(text|image|audio|folder)$/.test(l))));
  });
  await step("D-04 recent order", async () => {
    await treeClick(page, "Scene D"); await page.click('[role=tab]:has-text("Edit")'); await page.waitForTimeout(1200); await typeInto6(page, "Scene D", " Newest words typed here.");
    await openData(page);
    const lines = (await dataText(page)).split("\n"); const k = lines.indexOf("NAME");
    say("D-04 list after editing Scene D: " + J(lines.slice(k)));
  });
  await step("D-04 sections and sort", async () => {
    await createNode(page, "W51", "text"); await createNode(page, "W120", "text");
    await page.click('[role=tab]:has-text("Edit")'); await page.waitForTimeout(1200);
    await typeInto6(page, "W51", Array.from({ length: 51 }, (_, i) => "w" + i).join(" "));
    await typeInto6(page, "W120", Array.from({ length: 120 }, (_, i) => "w" + i).join(" "));
    await openData(page);
    const rl = async () => { const l = (await dataText(page)).split("\n"); return l.slice(l.indexOf("Resources")); };
    say("D-04 list with LAST EDITED sort: " + J(await rl()));
    await page.locator("button:has-text('NAME'), button:has-text('Name')").first().click().catch((e) => say("NAME click: " + e.message.slice(0, 50))); await page.waitForTimeout(800);
    say("D-04 after clicking NAME: " + J(await rl()));
    say("D-04 sort buttons: " + J(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter((t) => /LAST EDITED|NAME/i.test(t)))));
    await page.locator("button:has-text('LAST EDITED'), button:has-text('Last edited')").first().click().catch(() => {}); await page.waitForTimeout(500);
  });
  await step("D-16 smart folder", async () => {
    const q = queryHelpers(page, h);
    await q.newQuery(); await setField(page, 0, "Status"); await setOp(page, 0, "is"); await q.pickValue(0, "Draft"); await q.saveAs("Drafts");
    await page.locator("text=Drafts").first().click(); await tick(page, 2000);
    await openData(page);
    say("D-16 Data tab with smart folder Drafts selected (tab selected=" + J((await tabs(page)).filter((t) => t.selected === "true").map((t) => t.text)) + "): table=" + J(await tbl(page)) + " ; text head=" + J((await dataText(page)).split("\n").slice(0, 8)));
  });
  await step("D-10 off-list status", async () => {
    const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config.statuses = ["Draft", "Published"]; writeFileSync(pj, JSON.stringify(j, null, 2));
    await reloadProject(page, "Dat"); await openData(page);
    say("D-10 after removing In review from config.statuses by hand (Scene B still stores In review): table=" + J(await tbl(page)));
    j.config.statuses = ["Published", "Draft", "In review"]; writeFileSync(pj, JSON.stringify(j, null, 2));
    await reloadProject(page, "Dat"); await openData(page);
    say("D-09 order after config.statuses = Published, Draft, In review: table=" + J(await tbl(page)));
    j.config.statuses = []; writeFileSync(pj, JSON.stringify(j, null, 2));
    await reloadProject(page, "Dat"); await openData(page);
    say("D-12 statuses []: text=" + J((await dataText(page)).split("\n").slice(0, 14)) + " table=" + J(await tbl(page)));
    j.config.statuses = ["Draft", "In review", "Published"]; writeFileSync(pj, JSON.stringify(j, null, 2));
  });
  await step("D-15 stored word count", async () => {
    const dir = projectDir(h); const sc = sidecarByName(h, "Scene A"); const f = path.join(dir, "meta", `resource-${sc.json.id}.meta.json`);
    const o = JSON.parse(readFileSync(f, "utf8")); say("Scene A sidecar wordCount before hand edit: " + o.wordCount); o.wordCount = 999; writeFileSync(f, JSON.stringify(o, null, 2));
    await reloadProject(page, "Dat"); await openData(page);
    const ft = await tbl(page);
    say("D-15 after setting Scene A's stored wordCount to 999 by hand (content unchanged): table=" + J(ft) + " ; resource row=" + J((await dataText(page)).split("\n").filter((l) => /words/.test(l))));
    await treeClick(page, "Scene A"); await page.click('[role=tab]:has-text("Edit")'); await page.waitForTimeout(1500);
    say("D-15 editor footer for Scene A: " + J((await bodyText(page)).split("\n").filter((l) => /^Words:/.test(l))));
  });
  await step("D-12/D-13 empty and one-doc projects", async () => {
    await closeProjectIfOpen(page); await createProject(page, h, "Empty", "Blank");
  await openData(page);
  say("D-13/D-01 empty project Data tab text: " + J(await dataText(page)));
  await createNode(page, "Only Doc", "text");
  await openData(page);
  say("D-12 one text resource, no statuses configured, text: " + J(await dataText(page)) + " ; table=" + J(await tbl(page)));
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
  });
});
