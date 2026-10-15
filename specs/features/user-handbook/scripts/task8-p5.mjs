// Task 8, web build: project-configuration.md row PC-29 (what a schema-invalid project.json does). Run OUTSIDE the sandbox.
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
  await probe("both projects valid");
  for (const [label, mut] of [
    ["config.maxRevisions = 'abc'", (o) => { o.config.maxRevisions = "abc"; }],
    ["config.statuses = 'oops'", (o) => { o.config.statuses = "oops"; }],
    ["config.features.timeline = 'yes'", (o) => { o.config.features = { timeline: "yes" }; }],
    ["top-level maxRevisions = 'abc'", (o) => { o.maxRevisions = "abc"; }],
  ]) {
    const orig = readPj(bd); const o = JSON.parse(JSON.stringify(orig)); mut(o); writePj(bd, o);
    await probe(`Broken One has ${label}`);
    writePj(bd, orig);
  }
  await probe("Broken One restored");
  const log = path.join(LOG_DIR, `${h.run.runId}-server.log`);
  say("PC-29 server log (lines mentioning projects/error, throwaway paths replaced): " + J(existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => /rror|fail|invalid|valid/i.test(l)).slice(0, 8).map((l) => l.replaceAll(/\/(private\/)?tmp\/getwrite-handbook\/[^\s"]*/g, "<throwaway>").slice(0, 300)) : null));
});
