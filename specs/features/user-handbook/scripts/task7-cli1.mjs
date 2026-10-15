// Task 7, built CLI: prune --help (RV-22, RV-29). Run OUTSIDE the sandbox (writes nothing but the throwaway run folder).
import { createRun, cleanupRun, say } from "./lib/safety.mjs";
import { cli } from "./task7-lib.mjs";
const run = createRun("cli");
try {
  cli(["prune", "--help"], run.dir);
  cli(["--help"], run.dir);
} finally { say(`removed: ${cleanupRun(run).removed}`); }
