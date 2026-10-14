#!/usr/bin/env node
/**
 * Feature 81 CLI method (FR-16): build the CLI and run it against a throwaway
 * project, and print the executable name it answers to.
 *
 * Usage:
 *   node cli.mjs build   run `pnpm cli:build` (run INSIDE the command sandbox)
 *   node cli.mjs proof   --help, `project create` into a throwaway root, then
 *                        `doctor` on it; prints the name from the Usage line
 *                        and the package.json bin name. Writes only under
 *                        /tmp/getwrite-handbook/ (needs write access there,
 *                        so run it outside the sandbox).
 * Import { runCli } for later tasks (prune, reindex, repair-revisions ...).
 * Starts no long-running process and uses no port.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO, assertThrowaway, cleanupRun, createRun, isMain, redact, say } from "./lib/safety.mjs";

export const CLI_JS = path.join(REPO, "cli/dist/bin/getwrite-cli.cjs");

/** Run the built CLI; cwd defaults to the throwaway run dir so nothing lands in the repo. */
export function runCli(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [CLI_JS, ...args], {
    cwd: cwd ?? REPO,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const show = (label, r) => {
  say(`$ ${label}`);
  say(`exit=${r.status}`);
  for (const l of redact(r.stdout + r.stderr).split("\n").slice(0, 14)) say(`  | ${l}`);
};

function build() {
  const r = spawnSync("pnpm", ["cli:build"], { cwd: REPO, encoding: "utf8" });
  say(`$ pnpm cli:build  (cwd=repo root)  exit=${r.status}`);
  for (const l of redact(r.stdout + r.stderr).split("\n").filter(Boolean).slice(-6)) say(`  | ${l}`);
  process.exit(r.status ?? 1);
}

function proof() {
  if (!existsSync(CLI_JS)) {
    console.error("built CLI missing; run `node cli.mjs build` first");
    process.exit(2);
  }
  const bin = JSON.parse(readFileSync(path.join(REPO, "cli/package.json"), "utf8")).bin;
  say(`cli/package.json bin: ${JSON.stringify(bin)}`);
  const run = createRun("cli");
  let code = 0;
  try {
    const help = runCli(["--help"], { cwd: run.dir });
    show("node cli/dist/bin/getwrite-cli.cjs --help", help);
    const usage = help.stdout.match(/^Usage:\s+(\S+)/m);
    say(`executable name the CLI answers to (Usage line): ${usage ? usage[1] : "NOT FOUND"}`);
    const root = path.join(run.dir, "throwaway-project");
    assertThrowaway(run.dir);
    const spec = path.join(REPO, "getwrite-config/templates/project-types/blank_project_type.json");
    const create = runCli(["project", "create", root, "--spec", spec, "-n", "Handbook Proof"], { cwd: run.dir });
    show("getwrite-cli project create <throwaway-root> --spec blank_project_type.json -n \"Handbook Proof\"", create);
    const doctor = runCli(["doctor", root], { cwd: run.dir });
    show("getwrite-cli doctor <throwaway-root>", doctor);
    say(`project.json created: ${existsSync(path.join(root, "project.json"))}`);
    if (create.status !== 0 || doctor.status !== 0 || !usage) code = 1;
  } finally {
    say(`throwaway run folder removed: ${cleanupRun(run).removed}`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) {
  if (process.argv[2] === "build") build();
  else if (process.argv[2] === "proof") proof();
  else {
    console.error("usage: cli.mjs build|proof");
    process.exit(2);
  }
}
