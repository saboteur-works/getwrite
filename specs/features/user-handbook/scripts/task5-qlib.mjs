// Shared setup and helpers for the Task 5 query runs (web build). Builds on task5-lib.mjs.
import { say, J, bodyText, step, newProjectWithDoc, createNode, openSettings, closeSettings, dialogText, sidebarText, addSidebarField, treeClick, sidecarByName, projectJson, projectDir, pm } from "./task5-lib.mjs";
export * from "./task5-lib.mjs";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
export const tick = (page, ms = 1500) => page.waitForTimeout(ms);
export const words = (n, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i % 7}`).join(" ");
export async function typeInto(page, text) {
  for (let i = 0; i < 40; i++) { if (!((await page.evaluate(() => document.querySelector(".ProseMirror")?.innerText || "")).trim())) break; await page.waitForTimeout(250); }
  await pm(page).click(); await page.keyboard.insertText(text); await tick(page, 6000);
}
export const chips = (page) => page.locator("[role=group][aria-label='Filter condition']");
export async function setField(page, i, label) {
  await chips(page).nth(i).locator("button.field-picker__trigger").click(); await tick(page, 300);
  const labels = await page.$$eval("[role=listbox][aria-label='Select a field'] [role=option]", (o) => o.map((x) => x.innerText.split("\n")[0].trim().toLowerCase()));
  const idx = labels.indexOf(label.toLowerCase());
  if (idx < 0) throw new Error("field not in picker: " + label + " among " + labels.join(","));
  await page.locator("[role=listbox][aria-label='Select a field'] [role=option]").nth(idx).click(); await tick(page, 500);
}
export const setOp = async (page, i, label) => { await chips(page).nth(i).locator("select[aria-label=Operator]").selectOption({ label }); await tick(page, 400); };
export async function matchInfo(page) {
  const t = await bodyText(page);
  const m = t.match(/\[\s*(\d+) (match|matches)\s*\]/);
  const lines = t.split("\n");
  const ri = lines.findIndex((l) => /^Resources$/.test(l));
  const names = []; for (let k = ri; k >= 0 && k < lines.length; k++) { if (/^(text|image|audio|folder)$/.test(lines[k]) && lines[k - 1]) names.push(lines[k - 1]); if (/^METADATA$/.test(lines[k])) break; }
  return { counter: m ? m[0] : null, listed: names };
}
export const SC = async (page, n) => { await treeClick(page, n); };

export async function setupData(page, h, P) {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, P, "Scene A");
  for (const n of ["Scene B", "Scene C", "Scene D", "Mara", "Elena"]) await createNode(page, n, "text");
  await openSettings(page, "Manage Tags");
  await page.fill("input[aria-label='New tag name']", "flashback"); await page.locator("button:text-is('Add Tag')").click(); await tick(page, 1800);
  say(`tag creation: dialog lines=${J((await dialogText(page)).split("\n").filter((l) => /flashback|No tags/i.test(l)))}; project.json config.tags=${J(projectJson(h).config.tags)}`);
  await closeSettings(page);
  say(`sidebar Tags section right after creating the tag in Project Settings (dialog closed, no reload): ${J((await sidebarText(page)).split("\n").filter((l) => /No tags yet|FLASHBACK/i.test(l)))}`);
  await openSettings(page, "Metadata");
  for (const n of [/^Timeline/, /Point of View/]) { await page.getByRole("checkbox", { name: n }).first().click(); await tick(page, 1000); }
  await closeSettings(page);
  await treeClick(page, "Scene A");
  await addSidebarField(page, "fsel", "F Select", "Select", "Document");
  await addSidebarField(page, "fmulti", "F Multi", "Multi", "Document");
  await openSettings(page, "Metadata");
  await page.fill("textarea[aria-label='Options for F Select']", "Red\nGreen"); await page.locator("textarea[aria-label='Options for F Select']").blur(); await tick(page, 1200);
  await page.fill("textarea[aria-label='Options for F Multi']", "Alpha\nBeta"); await page.locator("textarea[aria-label='Options for F Multi']").blur(); await tick(page, 1200);
  await closeSettings(page);
  // statuses: set by hand in the throwaway project.json (see Q-11), then reload so the tag list and statuses load
  const pj = path.join(projectDir(h), "project.json"); const j = JSON.parse(readFileSync(pj, "utf8")); j.config.statuses = ["Draft", "In review", "Published"]; writeFileSync(pj, JSON.stringify(j, null, 2));
  await page.reload(); await tick(page, 2000); await page.click(`button[aria-label="Open ${P}"]`); await tick(page, 2000);
  const setMeta = async (name, { pov, status, date, sel, multi, tag, text }) => {
    await SC(page, name);
    if (pov) { await page.fill("input[aria-label=pov-input]", pov.slice(0, 3)); await tick(page, 900); await page.locator(`[role=option]:has-text('${pov}')`).first().click(); await tick(page, 1500); }
    if (status) { await page.selectOption("select[aria-label=status]", { label: status }); await tick(page, 1500); }
    if (date) { await page.fill("input[aria-label=story-date-input]", date); await page.locator("input[aria-label=story-date-input]").blur(); await tick(page, 1500); }
    if (sel) { await page.selectOption("select[aria-label=fsel]", { label: sel }); await tick(page, 1200); }
    if (multi) { await page.selectOption("select[aria-label=fmulti]", multi.map((label) => ({ label }))); await tick(page, 1200); }
    if (tag) { const tb = page.locator(`button:text-is('${tag}')`); if (!(await tb.count())) say(`tag button missing on ${name}; sidebar tail: ${J((await sidebarText(page)).split("\n").slice(-12))}`); else { await tb.first().click(); await tick(page, 1500); } }
    if (text) await typeInto(page, text);
  };
  await setMeta("Scene A", { text: words(50), pov: "Mara", status: "Draft", date: "2026-01-05", sel: "Red", multi: ["Alpha", "Beta"], tag: "flashback" });
  await setMeta("Scene B", { text: words(600), pov: "Mara", status: "In review", date: "2026-03-01", sel: "Green", multi: ["Alpha"], tag: "flashback" });
  await setMeta("Scene C", { text: words(40), pov: "Elena", status: "Draft", date: "2026-02-01", multi: ["Beta"] });
  await setMeta("Scene D", { text: "See [[Scene A]] for more." });
  for (const n of ["Scene A", "Scene B", "Scene C", "Scene D"]) { const x = sidecarByName(h, n).json; say(`data ${n}: wordCount=${x.wordCount} userMetadata=${J(Object.fromEntries(Object.entries(x.userMetadata).map(([k, v]) => [k, v && v.name ? v.name : v])))}`); }
  say(`config.tags=${J(projectJson(h).config.tags)}; tagAssignments=${J(projectJson(h).config.tagAssignments)}`);
  say(`meta/backlinks.json (id -> ids it links to): ${J(JSON.parse(readFileSync(path.join(projectDir(h), "meta/backlinks.json"), "utf8")))}; ids: ${J(Object.fromEntries(["Scene A", "Scene B", "Scene C", "Scene D", "Mara", "Elena"].map((n) => [n, sidecarByName(h, n).json.id.slice(0, 8)])))}`);
}
export const queryHelpers = (page, h) => {
  const newQuery = async () => { await page.click("button[aria-label='New smart folder']"); await tick(page, 1000); };
  const saveAs = async (name) => {
    await page.locator("button:has-text('SAVE QUERY')").click(); await tick(page, 600);
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(name);
    await page.locator("[role=dialog] button:has-text('Save'), dialog button:has-text('Save')").last().click(); await tick(page, 1800);
  };
  const run = async (name) => { await page.locator(`text=${name}`).first().click(); await tick(page, 2500); return (await matchInfo(page)).listed; };
  const addChip = async () => { await page.locator("button:has-text('ADD CONDITION')").first().click(); await tick(page, 500); };
  const pickRef = async (i, text, opt) => { await chips(page).nth(i).locator("input[aria-label='Search resource']").first().fill(text); await tick(page, 800); await page.locator(`[role=option]:has-text('${opt}')`).first().click(); await tick(page, 800); };
  const pickValue = async (i, label) => chips(page).nth(i).locator("select[aria-label=Value]").selectOption({ label });
  return { newQuery, saveAs, run, addChip, pickRef, pickValue };
};
