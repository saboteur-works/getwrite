// Task 8, web build + built CLI: project-configuration.md rows PC-05, PC-06, PC-28 (maxRevisions, autoPrune, prune --max). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, treeClick, typeAndSave, expandRevisions, projectDir, tick, cli, step, readPj, writePj } from "./task8-lib.mjs";
import { readFileSync, cpSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
function count(root) {
  const out = {}; const names = {};
  for (const f of readdirSync(path.join(root, "meta"))) { const m = f.match(/^resource-(.*)\.meta\.json$/); if (m) names[m[1]] = JSON.parse(readFileSync(path.join(root, "meta", f), "utf8")).name; }
  const rv = path.join(root, "revisions"); if (!existsSync(rv)) return out;
  for (const id of readdirSync(rv)) out[names[id] ?? id] = readdirSync(path.join(rv, id)).filter((d) => /^v-\d+$/.test(d)).length;
  return out;
}
async function saveNamed(page, name) {
  const input = page.locator("#revision-control-content input[placeholder='Revision name']");
  await input.fill(name); await page.locator("#revision-control-content button:has-text('Save')").click();
  for (let i = 0; i < 40; i++) { if ((await input.inputValue()) === "") break; await page.waitForTimeout(150); }
  await page.waitForTimeout(250);
}
await withWeb("t8-p7", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Prune Cfg", "Blank");
  await createNode(page, "Many", "text"); await typeAndSave(page, "Many", "Body of Many.", 4500);
  await treeClick(page, "Many"); await expandRevisions(page);
  for (let i = 1; i <= 52; i++) await saveNamed(page, `M${i}`);
  const pd = projectDir(h);
  say("PC-06 live project (autoPrune " + J(readPj(pd).config.autoPrune) + ", config.maxRevisions " + J(readPj(pd).config.maxRevisions) + ") after 52 named saves: revisions per resource " + J(count(pd)));
  await typeAndSave(page, "Many", " More typing after the saves.", 6000);
  await page.reload(); await tick(page, 2000);
  say("PC-06 same project after more typing and a reload: " + J(count(pd)) + " ; autoPrune/maxRevisions still " + J([readPj(pd).config.autoPrune, readPj(pd).config.maxRevisions]));
  const run = h.run.dir;
  const copy = (n, mut) => { const d = path.join(run, n); cpSync(pd, d, { recursive: true }); if (mut) { const o = readPj(d); mut(o); writePj(d, o); } return d; };
  const c1 = copy("c1"), c2 = copy("c2", (o) => { o.config.maxRevisions = 3; }), c3 = copy("c3", (o) => { o.maxRevisions = 3; o.autoPrune = false; }), c4 = copy("c4"), c5 = copy("c5", (o) => { o.config.maxRevisions = 3; o.config.autoPrune = false; });
  say("before prune, revisions in each copy: " + J([c1, c2, c3, c4, c5].map((c) => count(c))));
  const help = cli(["prune", "--help"], run);
  for (const [lbl, c, args] of [["C1 unmodified, no --max", c1, []], ["C2 config.maxRevisions=3, no --max", c2, []], ["C3 top-level maxRevisions=3 and autoPrune=false, no --max", c3, []], ["C4 unmodified, --max 5", c4, ["--max", "5"]], ["C5 config.maxRevisions=3 and config.autoPrune=false, no --max", c5, []]]) {
    const r = cli(["prune", c, ...args], run);
    say(`PC-05/28 ${lbl}: exit ${r.status}; revisions after: ${J(count(c))}; project.json maxRevisions/autoPrune now: ${J([readPj(c).maxRevisions, readPj(c).autoPrune, readPj(c).config.maxRevisions, readPj(c).config.autoPrune])}`);
  }
  say("PC-05 live project untouched by the copies' prune runs: " + J(count(pd)));
});
