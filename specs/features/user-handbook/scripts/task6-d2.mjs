// Task 6, web build: views/data.md D-15 (where the Words figure comes from). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createProject, createNode, treeClick, typeInto, reloadProject, sidecars, projectDir, sidecarByName } from "./task6-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const tbl = (page) => page.evaluate(() => [...document.querySelectorAll("table tr")].map((r) => [...r.children].map((c) => c.innerText.trim()).join(" | ")));
const rows = async (page) => { const l = (await bodyText(page)).split("\n"); return l.filter((x) => /words$/.test(x)); };
const sc = (h, n) => { const s = sidecarByName(h, n).json; return `wordCount=${s.wordCount} keys=${Object.keys(s).join(",")}`; };
await withWeb("t6-d2", {}, async ({ h, page }) => {
  await createProject(page, h, "Wc", "Blank");
  await createNode(page, "X", "text"); await createNode(page, "Y", "text");
  await typeInto(page, "X", "one two three four five six seven eight nine ten");
  await typeInto(page, "Y", "alpha beta gamma delta");
  say("after typing: X " + sc(h, "X") + " ; Y " + sc(h, "Y"));
  await page.click('[role=tab]:has-text("Data")'); await page.waitForTimeout(1500);
  say("Data after typing: table=" + J(await tbl(page)) + " rows=" + J(await rows(page)));
  await treeClick(page, "X"); await page.click('[role=tab]:has-text("Edit")'); await page.waitForTimeout(1000);
  await page.selectOption("select[aria-label=status]", { label: "In review" }); await page.waitForTimeout(2500);
  say("after choosing a Status on X: " + sc(h, "X") + " ; footer=" + J((await bodyText(page)).split("\n").filter((l) => /^Words:/.test(l))));
  await page.click('[role=tab]:has-text("Data")'); await page.waitForTimeout(1500);
  say("Data after choosing a Status on X (no reload): table=" + J(await tbl(page)) + " rows=" + J(await rows(page)));
  await reloadProject(page, "Wc"); await page.click('[role=tab]:has-text("Data")'); await page.waitForTimeout(1500);
  say("Data after reload: table=" + J(await tbl(page)) + " rows=" + J(await rows(page)) + " ; " + sc(h, "X"));
  const dir = projectDir(h); const f = path.join(dir, "meta", `resource-${sidecarByName(h, "Y").json.id}.meta.json`);
  const o = JSON.parse(readFileSync(f, "utf8")); o.wordCount = 777; writeFileSync(f, JSON.stringify(o, null, 2));
  say("hand edit: Y sidecar wordCount set to 777; file now says " + JSON.parse(readFileSync(f, "utf8")).wordCount);
  await reloadProject(page, "Wc"); await page.click('[role=tab]:has-text("Data")'); await page.waitForTimeout(1500);
  say("Data after reload with Y wordCount=777 on disk: table=" + J(await tbl(page)) + " rows=" + J(await rows(page)) + " ; sidecar now " + sc(h, "Y"));
  const txt = (await bodyText(page)).split("\n"); say("overview head: " + J(txt.slice(txt.indexOf("RESOURCES"), txt.indexOf("RESOURCES") + 4)));
});
