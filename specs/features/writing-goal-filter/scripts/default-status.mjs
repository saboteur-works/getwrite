// A new document's Status shows a value the writer never chose. Does a filter or a smart folder on that value match it?
// Usage: node default-status.mjs. Web build, throwaway folder. Run OUTSIDE the sandbox.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { withWeb, say, J, createProject, createDoc, expandAll } from "../../user-handbook/scripts/task4-lib.mjs";
await withWeb("g98-status", {}, async ({ h, page }) => {
  await createProject(page, h, "S", "Blank");
  await createDoc(page, "Fresh");
  await expandAll(page);
  await page.locator('[role=treeitem]:has-text("Fresh")').first().click(); await page.waitForTimeout(1200);
  const dir = readdirSync(h.projectsDir)[0];
  const root = path.join(h.projectsDir, dir);
  const id = readdirSync(path.join(root, "resources"))[0];
  say(`status control shows: ${J(await page.locator('[aria-label="status"]').first().evaluate((s) => s.options[s.selectedIndex].textContent))}`);
  say(`sidecar userMetadata: ${J(JSON.parse(readFileSync(path.join(root, "meta", `resource-${id}.meta.json`), "utf8")).userMetadata ?? null)}`);
  const evalAst = (ast) => page.evaluate(async ([d, a]) => { const r = await fetch("/api/project/query/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: d, definition: a }) }); return [r.status, await r.text()]; }, [dir, ast]);
  say(`smart-folder evaluate, status is Draft: ${J(await evalAst({ op: "eq", field: "status", value: "Draft" }))}`);
  await page.evaluate(async ([d]) => { await fetch("/api/project/goal-filter", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: d, goalFilter: { op: "eq", field: "status", value: "Draft" } }) }); }, [dir]);
  say(`stored: ${J(JSON.parse(readFileSync(path.join(root, "project.json"), "utf8")).config.goalFilter ?? null)}`);
  say(`goal total, status is Draft: ${J(await page.evaluate(async (d) => (await fetch(`/api/project/goal-filtered-total?projectId=${d}`)).json(), dir))}`);
  await page.locator('[aria-label="status"]').first().selectOption({ label: "In review" }); await page.waitForTimeout(800);
  await page.locator('[aria-label="status"]').first().selectOption({ label: "Draft" }); await page.waitForTimeout(1000);
  say(`smart-folder evaluate after choosing by hand: ${J(await evalAst({ op: "eq", field: "status", value: "Draft" }))}`);
  say(`after choosing Draft by hand: sidecar userMetadata ${J(JSON.parse(readFileSync(path.join(root, "meta", `resource-${id}.meta.json`), "utf8")).userMetadata ?? null)}; goal total ${J(await page.evaluate(async (d) => (await fetch(`/api/project/goal-filtered-total?projectId=${d}`)).json(), dir))}`);
});
process.exit(0);
