// Task 8, web build: project-configuration.md row PC-29, second run: the visible text and console while a schema-invalid project.json is present. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, tick, readPj, writePj, bodyText, closeDlg, step } from "./task8-lib.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { LOG_DIR } from "./lib/safety.mjs";
import path from "node:path";
await withWeb("t8-p5", {}, async ({ h, page }) => {
  page.setDefaultTimeout(12000);
  await createProject(page, h, "Good One", "Blank");
  await page.goto(h.baseUrl + "/"); await tick(page, 1500);
  await createProject(page, h, "Broken One", "Blank");
  const dirOf = (n) => readdirSync(h.projectsDir).map((x) => path.join(h.projectsDir, x)).find((x) => { try { return readPj(x).name === n; } catch { return false; } });
  const bd = dirOf("Broken One");
  const probe = async (label) => {
    await page.goto(h.baseUrl + "/"); await tick(page, 2500);
    const api = await page.evaluate(async () => { const r = await fetch("/api/projects"); const t = await r.text(); return { status: r.status, body: t.slice(0, 400) }; });
    say(`PC-29 ${label}: Start Page lines=${J((await bodyText(page)).split("\n").filter((l) => /ACTIVE PROJECT|Good One|Broken One|error|could not/i.test(l)))}; GET /api/projects -> ${J(api)}`);
  };
  const consoleMsgs = []; page.on("console", (m) => { if (/error|warn/i.test(m.type())) consoleMsgs.push(m.type() + ": " + m.text().slice(0, 200)); });
  const orig = readPj(bd); const o = JSON.parse(JSON.stringify(orig)); o.config.statuses = "oops"; writePj(bd, o);
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(3000);
  say("PC-29 visible text with Broken One config.statuses='oops': " + J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 40)));
  say("PC-29 console error/warn messages: " + J(consoleMsgs));
  say("PC-29 toasts/alerts in the page: " + J(await page.$$eval("[role=alert],[role=status],[data-sonner-toast],[class*=toast]", (e) => e.map((x) => x.innerText.slice(0, 200)))));
  writePj(bd, orig);
  await page.goto(h.baseUrl + "/"); await page.waitForTimeout(2500);
  say("PC-29 after restoring the file: " + J((await bodyText(page)).split("\n").filter((l) => /ACTIVE PROJECT|Good One|Broken One$/.test(l))));
  const log = path.join(LOG_DIR, `${h.run.runId}-server.log`);
  say("PC-29 server log (lines mentioning projects/error, throwaway paths replaced): " + J(existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => /rror|fail|invalid|valid/i.test(l)).slice(0, 8).map((l) => l.replaceAll(/\/(private\/)?tmp\/getwrite-handbook\/[^\s"]*/g, "<throwaway>").slice(0, 300)) : null));
});
