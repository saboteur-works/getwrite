// Task 3, web build: storage statements I-21..I-25. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject } from "./task3-lib.mjs";
import { createRun, cleanupRun } from "./lib/safety.mjs";
import { cpSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const stage = createRun("stage");
function walk(dir, base = dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    const rel = path.relative(base, p).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
    if (statSync(p).isDirectory()) { out.push(rel + "/"); walk(p, base, out); } else out.push(rel);
  }
  return out;
}
try {
  await withWeb("web", {}, async ({ h, page }) => {
    await createProject(page, h, "Store Test", "Blank");
    await page.click("button:has-text('CREATE RESOURCE')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("Stored Doc");
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
    await page.click("text=Stored Doc >> nth=0");
    await page.waitForTimeout(1500);
    await page.locator(".ProseMirror").first().click();
    await page.keyboard.type("Plain text kept on disk.");
    await page.waitForTimeout(4000);
    const entries = readdirSync(h.projectsDir);
    say(`I-21 projects folder entries: ${entries.length} (one folder per project, named by a UUID: ${entries.every((e) => /^[0-9a-f-]{36}$/.test(e))})`);
    const proj = path.join(h.projectsDir, entries[0]);
    const files = walk(proj);
    say(`I-21/24 files under the project folder (uuids abbreviated): ${J(files)}`);
    say(`I-24 project.json is readable text; top-level keys: ${J(Object.keys(JSON.parse(readFileSync(path.join(proj, "project.json"), "utf8"))))}`);
    const contentFile = files.find((f) => /resources\/<uuid>\/content\.txt$/.test(f));
    const realContent = path.join(proj, path.relative(proj, "") , "");
    void realContent;
    const resDir = readdirSync(path.join(proj, "resources"))[0];
    say(`I-24 resources/<uuid>/content.txt (${contentFile ? "present" : "absent"}) reads: ${J(readFileSync(path.join(proj, "resources", resDir, "content.txt"), "utf8"))}`);
    const all = walk(h.projectsDir);
    say(`I-25 files with database extensions under the projects folder: ${J(all.filter((f) => /\.(db|sqlite3?|sql|mdb)$/i.test(f)))}`);
    cpSync(proj, path.join(stage.dir, entries[0]), { recursive: true });
    say(`I-24 backup copy (cp -r of the project folder) staged: ${walk(path.join(stage.dir, entries[0])).length} entries`);
  });
  await withWeb("web", {}, async ({ h, page }) => {
    const { readdirSync: rd } = await import("node:fs");
    for (const n of rd(stage.dir)) cpSync(path.join(stage.dir, n), path.join(h.projectsDir, n), { recursive: true });
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(2000);
    say(`I-24 second, fresh server pointed at a folder holding only the copy: start page lists ${J((await bodyText(page)).split("\n").filter((l) => /ACTIVE|WRITING ASSETS|Store Test|resource/.test(l)))}`);
    await page.click('button[aria-label="Open Store Test"]');
    await page.waitForTimeout(2000);
    await page.click("text=Stored Doc >> nth=0");
    await page.waitForTimeout(2000);
    say(`I-24 copied project opens; document text in editor: ${J(await page.locator(".ProseMirror").first().innerText())}`);
  });
} finally {
  say(`stage removed: ${cleanupRun(stage).removed}`);
}
