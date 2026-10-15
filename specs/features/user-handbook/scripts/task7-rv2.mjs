// Task 7, web build + built CLI: revisions.md rows RV-06 (content), RV-14, RV-20, RV-22..RV-29 (many revisions, prune on copies). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, createNode, treeClick, typeAndSave, expandRevisions, revCards, projectDir, walkFiles, rel, tick, pm, cli, step } from "./task7-lib.mjs";
import { readFileSync, writeFileSync, cpSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
const card = (page, n) => page.locator("article.revision-control-card").filter({ has: page.locator("p", { hasText: new RegExp(`^v${n} •`) }) });
/** Summary per resource name from a project root: "v1(C) v2(P) v3 ..." */
function summary(root) {
  const out = {};
  const metaDir = path.join(root, "meta");
  const names = {};
  for (const f of readdirSync(metaDir)) {
    const m = f.match(/^resource-(.*)\.meta\.json$/);
    if (m) names[m[1]] = JSON.parse(readFileSync(path.join(metaDir, f), "utf8")).name;
  }
  const rv = path.join(root, "revisions");
  if (!existsSync(rv)) return out;
  for (const id of readdirSync(rv)) {
    const vs = readdirSync(path.join(rv, id)).filter((d) => /^v-\d+$/.test(d)).map((d) => parseInt(d.slice(2))).sort((a, b) => a - b);
    out[names[id] ?? id] = vs.map((n) => {
      const m = JSON.parse(readFileSync(path.join(rv, id, `v-${n}`, "metadata.json"), "utf8"));
      return `v${n}${m.isCanonical ? "C" : ""}${m.metadata?.preserve ? "P" : ""}`;
    });
  }
  return out;
}
const show = (label, root) => { const s = summary(root); for (const [k, v] of Object.entries(s)) say(`${label} ${k}: ${v.length} revisions: ${v.join(" ")}`); };
async function saveNamed(page, name) {
  const input = page.locator("#revision-control-content input[placeholder='Revision name']");
  await input.fill(name);
  await page.locator("#revision-control-content button:has-text('Save')").click();
  for (let i = 0; i < 40; i++) { if ((await input.inputValue()) === "") break; await page.waitForTimeout(150); }
  await page.waitForTimeout(250);
}
await withWeb("t7-rv2", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Prune A", "Blank");
  for (const n of ["Many", "Other", "Prot", "Third"]) await createNode(page, n, "text");
  for (const n of ["Many", "Other", "Prot", "Third"]) await typeAndSave(page, n, `Body of ${n}.`, 4500);
  // Many: 59 explicit revisions + v1 = 60
  await treeClick(page, "Many"); await expandRevisions(page);
  const t0 = Date.now();
  for (let i = 1; i <= 59; i++) await saveNamed(page, `M${i}`);
  say(`built 59 explicit revisions for Many in ${Math.round((Date.now() - t0) / 1000)} s`);
  say("RV-20 Many cards in the panel after building: " + (await revCards(page)).length);
  // other resources
  for (const [n, k] of [["Other", 5], ["Prot", 7], ["Third", 4]]) { await treeClick(page, n); await expandRevisions(page); for (let i = 1; i <= k; i++) await saveNamed(page, `${n[0]}${i}`); }
  const pd = projectDir(h);
  show("built", pd);
  // protect via UI: Other v3, v5 (worked example: 6 revisions, 2 protected, canonical v1 unprotected); Prot v2..v6; Third canonical v1
  const protect = async (n, vs) => { await treeClick(page, n); await expandRevisions(page); for (const v of vs) { await card(page, v).locator(`button[aria-label="Protect revision v${v}"]`).click(); await tick(page, 700); } };
  await protect("Other", [3, 5]); await protect("Prot", [2, 3, 4, 5, 6]); await protect("Third", [1]);
  show("after Protect clicks", pd);
  // RV-20: app activity with 60 revisions: edit canonical, switch resource and back, set canonical elsewhere, reload
  await treeClick(page, "Many"); await expandRevisions(page);
  await pm(page).click(); await page.keyboard.insertText(" More typing."); await tick(page, 6000);
  say("RV-20 Many after editing: " + summary(pd).Many.length);
  await treeClick(page, "Other"); await treeClick(page, "Many"); await expandRevisions(page);
  say("RV-20 Many after switching away and back: " + summary(pd).Many.length + " ; cards " + (await revCards(page)).length);
  await card(page, 30).locator("button:has-text('Set as Canonical Revision')").click(); await tick(page, 3000);
  say("RV-20 Many after Set as Canonical on v30: " + J(summary(pd).Many.filter((x) => /C/.test(x))) + " count " + summary(pd).Many.length);
  await card(page, 30).locator("article, button").first().isVisible().catch(() => 0);
  await page.reload(); await tick(page, 2000);
  say("RV-20 Many after reload: " + summary(pd).Many.length);
  // RV-06 content of an earlier revision after editing: v30 is canonical now; type and read content.bin
  await page.click(`button[aria-label="Open Prune A"]`); await tick(page, 2000);
  await treeClick(page, "Many");
  await pm(page).click(); await page.keyboard.press("End"); await page.keyboard.insertText(" EDITED-IN-V30."); await tick(page, 6500);
  const resId = readdirSync(path.join(pd, "revisions")).find((id) => JSON.parse(readFileSync(path.join(pd, "meta", `resource-${id}.meta.json`), "utf8")).name === "Many");
  const rd = (v) => readFileSync(path.join(pd, "revisions", resId, `v-${v}`, "content.bin"), "utf8");
  say(`RV-06 v30 content mentions EDITED-IN-V30: ${rd(30).includes("EDITED-IN-V30")}; v60 content mentions it: ${rd(60).includes("EDITED-IN-V30")}; revision count ${summary(pd).Many.length}; canonical: ${J(summary(pd).Many.filter((x) => /C/.test(x)))}`);
  // Put canonical back to v1 for the scenarios
  await expandRevisions(page);
  await card(page, 1).locator("button:has-text('Set as Canonical Revision')").click(); await tick(page, 3000);
  show("state before copies", pd);
  say("project.json config: " + J(Object.fromEntries(Object.entries(JSON.parse(readFileSync(path.join(pd, "project.json"), "utf8")).config).filter(([k]) => /maxRevisions|autoPrune/.test(k)))));

  const copy = (n) => { const d = path.join(h.run.dir, n); cpSync(pd, d, { recursive: true }); return d; };
  const run = h.run.dir;
  // C1: default prune on the whole project (two or more resources)
  const c1 = copy("c1");
  show("C1 before", c1);
  const r1 = cli(["prune", c1], run);
  show("C1 after `prune` (no --max)", c1);
  // C2: --max 3
  const c2 = copy("c2");
  const r2 = cli(["prune", c2, "--max", "3"], run);
  show("C2 after `prune --max 3`", c2);
  // C3: --max 1 (Prot: 5 protected)
  const c3 = copy("c3");
  const r3 = cli(["prune", c3, "-m", "1"], run);
  show("C3 after `prune -m 1`", c3);
  // C4: project.json maxRevisions=2, autoPrune toggled; prune without --max
  const c4 = copy("c4");
  const pj = path.join(c4, "project.json");
  const j = JSON.parse(readFileSync(pj, "utf8")); j.config.maxRevisions = 2; j.config.autoPrune = false; writeFileSync(pj, JSON.stringify(j, null, 2));
  const r4 = cli(["prune", c4], run);
  show("C4 (maxRevisions=2, autoPrune=false in project.json) after `prune`", c4);
  const c5 = copy("c5");
  const pj5 = path.join(c5, "project.json");
  const j5 = JSON.parse(readFileSync(pj5, "utf8")); j5.config.maxRevisions = 2; j5.config.autoPrune = true; writeFileSync(pj5, JSON.stringify(j5, null, 2));
  cli(["prune", c5], run);
  show("C5 (maxRevisions=2, autoPrune=true) after `prune`", c5);
  // C6: prune twice is stable; prune --max 0 / invalid
  const c6 = copy("c6");
  cli(["prune", c6, "--max", "2"], run);
  show("C6 first `prune --max 2`", c6);
  cli(["prune", c6, "--max", "2"], run);
  show("C6 second `prune --max 2`", c6);
  // the live project is unchanged by the copies
  show("live project after all copies", pd);
});
