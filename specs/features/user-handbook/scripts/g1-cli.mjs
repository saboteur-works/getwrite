// Handbook re-run, group 1 (OQ-8), CLI: saved project types are seen only with GETWRITE_SAVED_PROJECT_TYPES_DIR.
// Run OUTSIDE the sandbox (writes under /tmp/getwrite-handbook/).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO, cleanupRun, createRun, say } from "./lib/safety.mjs";
import { runCli } from "./cli.mjs";
delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
const run = createRun("g1-cli");
try {
  const dir = path.join(run.dir, "saved-types"); mkdirSync(dir);
  const blank = JSON.parse(readFileSync(path.join(REPO, "getwrite-config/templates/project-types/blank_project_type.json"), "utf8"));
  writeFileSync(path.join(dir, "my_type.json"), JSON.stringify({ ...blank, id: "my_type", name: "My Type" }, null, 2));
  writeFileSync(path.join(dir, "bad_type.json"), JSON.stringify({ ...blank, id: "bad_type", name: "" }, null, 2));
  const show = (tag, r) => say(`${tag}: exit ${r.status}; stdout ${JSON.stringify(r.stdout.trim().split("\n"))}; stderr ${JSON.stringify(r.stderr.trim().split("\n").slice(0, 4))}`);
  show("CLI project types, variable unset", runCli(["project", "types"], { cwd: run.dir }));
  show("CLI project types, variable set to the folder", runCli(["project", "types"], { cwd: run.dir, env: { GETWRITE_SAVED_PROJECT_TYPES_DIR: dir } }));
  const root = path.join(run.dir, "projects"); mkdirSync(root);
  show("CLI project create --project-type bad_type (variable set)", runCli(["project", "create", path.join(root, "bad"), "-t", "bad_type", "-n", "Bad"], { cwd: run.dir, env: { GETWRITE_SAVED_PROJECT_TYPES_DIR: dir } }));
  show("CLI project create -t my_type (variable set)", runCli(["project", "create", path.join(root, "mine2"), "-t", "my_type", "-n", "Mine"], { cwd: run.dir, env: { GETWRITE_SAVED_PROJECT_TYPES_DIR: dir } }));
  show("CLI project create -t my_type (variable unset)", runCli(["project", "create", path.join(root, "mine"), "-t", "my_type", "-n", "Mine"], { cwd: run.dir }));
} finally {
  say(`removed: ${cleanupRun(run).removed}`);
}
