/**
 * Experiment E-9 (Feature 93, Task 7). NOT part of the suite.
 * Drives e9-constructions.ts: 5 writer pairs (4 asked for plus the added removeVsRecompute) x 2 start modes x E9_REPS
 * (default 20) repetitions, one fresh temp project per repetition under
 * mkdtemp($TMPDIR). Each repetition is raced against a timer
 * (REP_TIMEOUT_MS) so a hang is recorded. Writes result JSON to
 * $E9_RESULT_OUT when set. runTask against runTask is not run (the queue
 * drains one task at a time).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, it } from "vitest";
import { PAIRS, runRepetition, type Mode, type Outcome, type PairId } from "./e9-constructions";

const REPS = Number(process.env.E9_REPS ?? 20);
const dirs: string[] = [];

afterAll(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

interface Summary {
  repetitions: number;
  lostAny: number;
  lostByName: Record<string, number>;
  unparseable: number;
  rejected: number;
  hung: number;
  gateReadsMin: number;
  gateSeedSnapshotsMin: number;
}

describe("E-9 backlinks writer races (before values)", () => {
  it("records counts", async () => {
    const batch = await fs.mkdtemp(path.join(os.tmpdir(), "f93-e9-"));
    dirs.push(batch);
    const result: Record<string, Summary> & { tempDir?: string } = {};
    for (const pair of PAIRS) {
      for (const mode of ["natural", "gated"] as Mode[]) {
        const s: Summary = {
          repetitions: 0, lostAny: 0, lostByName: {}, unparseable: 0,
          rejected: 0, hung: 0, gateReadsMin: Number.POSITIVE_INFINITY, gateSeedSnapshotsMin: Number.POSITIVE_INFINITY,
        };
        for (let i = 0; i < REPS; i++) {
          const o: Outcome = await runRepetition(pair as PairId, mode, path.join(batch, `${pair}-${mode}-${i}`));
          s.repetitions++;
          if (o.lost.length > 0) s.lostAny++;
          for (const n of o.lost) s.lostByName[n] = (s.lostByName[n] ?? 0) + 1;
          if (o.unparseable) s.unparseable++;
          if (o.rejected) s.rejected++;
          if (o.hung) s.hung++;
          s.gateReadsMin = Math.min(s.gateReadsMin, o.gateReads);
          s.gateSeedSnapshotsMin = Math.min(s.gateSeedSnapshotsMin, o.gateSeedSnapshots);
        }
        result[`${pair}/${mode}`] = s;
      }
    }
    result.tempDir = batch;
    const out = JSON.stringify(result, null, 2);
    console.log(out);
    if (process.env.E9_RESULT_OUT) await fs.writeFile(process.env.E9_RESULT_OUT, out, "utf8");
  });
});
