import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Shape both race-construction modules return per repetition. */
export interface RaceOutcome {
  hung: boolean;
  rejected: boolean;
  unparseable: boolean;
  lost: string[];
}

export const RACE_REPETITIONS = 20;
/** Per-test timeout for the 20-repetition race tests. */
export const RACE_TEST_TIMEOUT_MS = 30000;

/**
 * Runs `reps` repetitions, each in a fresh project directory under a new
 * mkdtemp batch directory, and returns a one-line summary of every
 * repetition that hung, rejected, left an unparseable file or lost a change
 * (empty array when all repetitions kept both changes). The batch directory
 * is removed afterwards.
 */
export async function collectRaceFailures(
  prefix: string,
  reps: number,
  run: (root: string, rep: number) => Promise<RaceOutcome>,
): Promise<string[]> {
  const batch = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const failures: string[] = [];
  try {
    for (let i = 0; i < reps; i++) {
      const o = await run(path.join(batch, `rep-${i}`), i);
      const problems: string[] = [];
      if (o.hung) problems.push("hung past the 5 s timer");
      if (o.rejected) problems.push("a writer rejected");
      if (o.unparseable) problems.push("file did not parse");
      if (o.lost.length > 0) problems.push(`lost: ${o.lost.join(", ")}`);
      if (problems.length > 0)
        failures.push(`rep ${i}: ${problems.join("; ")}`);
    }
  } finally {
    await fs.rm(batch, { recursive: true, force: true });
  }
  return failures;
}
