#!/usr/bin/env node
/**
 * Feature 78, Task 7: reads results/s2/summary-*.json (written by
 * s2-near-simultaneous.mjs, one per variant) and prints the per-variant
 * distribution, the achieved-gap statistics, the order-evidence disagreement
 * counts, the findings counts and the list of non-clean repetitions as markdown
 * and JSON-ish text. Pure file reading; no server, no browser. Usage:
 *   node s2-summary.mjs [--json]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RESULTS_DIR } from "./lib/util.mjs";
import { WORD40 } from "./lib/fixture.mjs";

const dir = path.join(RESULTS_DIR, "s2");
const files = readdirSync(dir).filter((f) => f.startsWith("summary-") && f.endsWith(".json")).sort();
const variants = files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

const stat = (arr) => {
  const a = arr.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y);
  if (!a.length) return "n/a";
  const med = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  const f = (x) => (Math.round(x * 100) / 100).toString();
  return `${f(a[0])} / ${f(med)} / ${f(a.at(-1))}`;
};
const count = (arr, fn) => arr.filter(fn).length;
const tally = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => `${k} x${v}`).join("; ") || "none";
};

const order = ["G0", "G5", "G15", "G30", "G50", "G250", "G1000"];
const key = (v) => {
  const m = /^G(\d+)-P(\d)-(AB|BA)$/.exec(v.variant);
  return [order.indexOf(`G${m[1]}`), Number(m[2]), m[3]];
};
variants.sort((a, b) => {
  const x = key(a);
  const y = key(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
});

const rows = [];
const nonClean = [];
const allReps = [];
const tt = (iso) => (iso ? iso.slice(14, 23) : "-");
for (const v of variants) {
  const reps = v.reps.filter((r) => r.completed !== false && r.order);
  const notDone = v.reps.filter((r) => r.completed === false);
  const pass = count(reps, (r) => r.verdict === "PASS");
  const fail = count(reps, (r) => r.verdict === "FAIL");
  const unstable = count(reps, (r) => r.verdict === "UNSTABLE");
  const gaps = reps.map((r) => r.order.releaseGapMs_secondMinusFirst);
  const failWhy = tally(reps.filter((r) => r.verdict === "FAIL").map((r) => (r.disagreed ?? ["(see reasons)"]).join("+")));
  const unstWhy = tally(reps.filter((r) => r.verdict === "UNSTABLE").map((r) => r.reasonUndetermined ?? "?"));
  const verdictWord =
    v.repetitionsNotRun.length || notDone.length || v.aborted
      ? "not run to completion (counts as unstable)"
      : pass === reps.length && reps.length === v.repetitionsAsked
        ? "PASS (all pass)"
        : fail === reps.length
          ? "FAIL (all fail)"
          : reps.some((r) => r.mixOrUnparseable)
            ? "FAIL (a store was a mix, none or unparseable)"
            : "UNSTABLE (repetitions disagree)";
  const heldA = count(reps, (r) => r.stores.held.length === 1 && r.stores.held[0].startsWith("A#"));
  const heldB = count(reps, (r) => r.stores.held.length === 1 && r.stores.held[0].startsWith("B#"));
  const lastRel = (who) => count(reps, (r) => r.order.lastBy.release === who);
  rows.push({
    variant: v.variant,
    asked: v.asked,
    completed: reps.length,
    notCompleted: notDone.length,
    notRun: v.repetitionsNotRun.length,
    discardedAttempts: v.discardedAttempts.length,
    pass,
    fail,
    unstable,
    verdictWord,
    failWhy,
    unstWhy,
    gaps: stat(gaps),
    arrivalGap: stat(reps.map((r) => r.order.arrivalGapMs_secondMinusFirst)),
    updatedAtGap: stat(reps.map((r) => r.order.updatedAtGapMs_secondMinusFirst)),
    s2r: stat(reps.flatMap((r) => [r.order.sendToResponseMs_fromRelease.A, r.order.sendToResponseMs_fromRelease.B])),
    ties: count(reps, (r) => r.order.updatedAtFirst === "tie"),
    disRU: count(reps, (r) => r.order.disagree.releaseVsUpdatedAt === true),
    disRA: count(reps, (r) => r.order.disagree.releaseVsArrival === true),
    disUA: count(reps, (r) => r.order.disagree.updatedAtVsArrival === true),
    arrivalWithin2ms: count(reps, (r) => (r.order.arrivalGapMs_secondMinusFirst ?? 99) < 2),
    heldFirstReleased: count(reps, (r) => r.stores.held.length === 1 && r.stores.held[0].startsWith(r.order.firstReleased)),
    heldA,
    heldB,
    lastRelA: lastRel("A"),
    lastRelB: lastRel("B"),
    allAgree: count(reps, (r) => r.stores.allAgree),
    mix: count(reps, (r) => r.mixOrUnparseable),
    backup: count(reps, (r) => r.backupCreated),
    logCount: tally(reps.map((r) => r.log.count)),
    logMatch: tally(reps.map((r) => ["A_then_B", "B_then_A", "both_diffed_against_base"].filter((k) => r.log.matches[k]).join("|") || "none")),
    failedSaves: count(reps, (r) => r.failed.A.length + r.failed.B.length > 0),
    edAck: count(reps, (r) => r.editors.rightAfterAck.A === false || r.editors.rightAfterAck.B === false),
    edLater: count(reps, (r) => r.editors.later.A === false || r.editors.later.B === false),
    edReload: count(reps, (r) => r.editors.afterReload.A !== true || r.editors.afterReload.B !== true),
    surfaces: tally(reps.flatMap((r) => [...new Set([...r.surfaceTexts.A, ...r.surfaceTexts.B])]).map((t) => t.replace(/\s*\n\s*/g, " / "))),
    consoleMsgs: count(reps, (r) => r.consoleCounts.A + r.consoleCounts.B > 0),
    changedByReload: count(reps, (r) => r.changedByReload),
    patchCounts: tally(reps.map((r) => `${r.patchCounts.A}/${r.patchCounts.B}`)),
    wall: v.wallSeconds,
    heartbeatMax: v.heartbeat.maxWallGapMs,
    sleep: v.heartbeat.gapsOver3s.length,
    firstRun: reps[0]?.runId,
    lastRun: reps.at(-1)?.runId,
    pre7340none: count(reps, (r) => r.listeners7340Before === "none"),
    pre3000none: count(reps, (r) => r.listeners3000Before === "none"),
    teardownClean: count(reps, (r) => r.teardown && r.teardown.errors.length === 0 && r.teardown.browserPidsAliveAfterClose.length === 0 && r.teardown.browserPidsAliveAfterTerm.length === 0 && r.teardown.serverStillAliveAfterKill.length === 0 && r.teardown.portListenersAfter.length === 0 && r.teardown.listeners7340After.length === 0 && r.teardown.listeners3000After.length === 0 && r.teardown.folderRemoved === true),
    pidsAliveAfter: v.descendantPidsAliveAfterTeardown.length,
  });
  for (const r of reps) {
    allReps.push(r);
    const bad =
      r.verdict !== "PASS" ||
      r.failed.A.length + r.failed.B.length > 0 ||
      r.mixOrUnparseable ||
      !r.stores.allAgree ||
      r.order.updatedAtFirst === "tie" ||
      r.order.disagree.updatedAtVsArrival === true;
    if (bad) nonClean.push({ variant: v.variant, n: r.n, verdict: r.verdict, reasons: r.reasons, disagreed: r.disagreed, stores: r.stores, order: r.order, log: r.log, failed: r.failed, mixHints: r.mixHints, file: r.file && path.basename(r.file) });
  }
  for (const r of notDone) nonClean.push({ variant: v.variant, n: r.n, verdict: "NOT COMPLETED", error: r.error });
}

const BASE = "BASE alpha bravo charlie";
const plainOf = { P1: { A: `${BASE} A1`, B: `${BASE} B1` }, P2: { A: `${BASE} A1`, B: `${BASE} B2LONG ${WORD40.join(" ")}` }, P3: { A: `${BASE} A2LONG ${WORD40.join(" ")}`, B: `${BASE} B1` } };
const normT = (t) => String(t).replace(/\s+/g, " ").trim();
const showsText = (text, pairing) => {
  const t = normT(text);
  if (t === normT(plainOf[pairing].A)) return "A";
  if (t === normT(plainOf[pairing].B)) return "B";
  if (t.startsWith('{"type":"doc"')) return "raw JSON";
  return `other(${t.length})`;
};
const nonCleanRep = (r) =>
  r.verdict !== "PASS" ||
  r.failed.A.length + r.failed.B.length > 0 ||
  r.mixOrUnparseable ||
  !r.stores.allAgree ||
  r.order.updatedAtFirst === "tie" ||
  r.order.disagree.updatedAtVsArrival === true;

if (process.argv.includes("--rows")) {
  const which = process.argv.find((a) => a.startsWith("--variant="))?.slice(10);
  console.log("| variant | rep | first released | release gap ms | release A / B (mm:ss.SSS) | updatedAt A / B | response arrival A / B | arrival gap ms | content.bin | content.tiptap.json | content.txt | content.bin detail | sidecar wordCount matches | sidecar updatedAt = response of | verdict | log (added/deleted) | editors after reload show A / B | file |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of allReps.filter(nonCleanRep).filter((x) => !which || x.variant === which)) {
    const o = r.order;
    let detail = "";
    let reloadShows = "n/a";
    try {
      const rep = JSON.parse(readFileSync(r.file, "utf8"));
      const d = rep.outcomes[1].storeDiffsIfNone;
      detail = Object.entries(d).map(([k, x]) => `${k.replace("content.", "")}: ${x.status}, ${x.bytes} bytes${x.mix ? `, ${x.mix}` : ""}`).join("; ");
      const ed = rep.outcomes[2].afterReload.editors;
      reloadShows = `${showsText(ed.A.text, r.pairing)} / ${showsText(ed.B.text, r.pairing)}`;
    } catch {
      detail = "(file not read)";
    }
    const verdictText = r.verdict + (r.verdict === "PASS" ? "" : r.verdict === "UNSTABLE" ? " (updatedAt tie)" : ` (${(r.disagreed ?? []).join("+") || r.reasons?.[0]})`);
    console.log(`| ${r.variant} | ${r.n} | ${o.firstReleased} | ${o.releaseGapMs_secondMinusFirst} | ${tt(o.releaseAt.A)} / ${tt(o.releaseAt.B)} | ${tt(o.updatedAt.A)} / ${tt(o.updatedAt.B)} | ${tt(o.responseArrivalAt.A)} / ${tt(o.responseArrivalAt.B)} | ${o.arrivalGapMs_secondMinusFirst} | ${r.stores.contentBin} | ${r.stores.contentTiptapJson} | ${r.stores.contentTxt} | ${detail} | ${r.stores.sidecarWordCountMatches.join("/") || "none"} | ${r.stores.sidecarUpdatedAtEqualsResponseOf.join("/") || "none"} | ${verdictText} | ${r.log.entries.map((e) => `${e.added}/${e.deleted}`).join(", ")} | ${reloadShows} | ${r.file ? path.basename(r.file) : ""} |`);
  }
  process.exit(0);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, nonClean }, null, 2));
} else {
  console.log("| variant | reps | pass | fail | unstable | verdict | achieved release gap ms min/med/max | updatedAt gap ms min/med/max | updatedAt ties | stores hold first-released | held A / held B | all four agree | mix or unparseable |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(`| ${r.variant} | ${r.completed}${r.notCompleted ? ` (+${r.notCompleted} not completed)` : ""}${r.notRun ? ` (${r.notRun} not run)` : ""} | ${r.pass} | ${r.fail} | ${r.unstable} | ${r.verdictWord} | ${r.gaps} | ${r.updatedAtGap} | ${r.ties} | ${r.heldFirstReleased} | ${r.heldA} / ${r.heldB} | ${r.allAgree} | ${r.mix} |`);
  }
  console.log("");
  console.log("| variant | last by release = A / B | release vs updatedAt disagree | release vs arrival disagree | updatedAt vs arrival disagree | arrival gap < 2 ms | arrival gap ms min/med/max | save duration from release ms min/med/max | fail: store(s) that disagreed | unstable: reason |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.variant} | ${r.lastRelA} / ${r.lastRelB} | ${r.disRU} | ${r.disRA} | ${r.disUA} | ${r.arrivalWithin2ms} | ${r.arrivalGap} | ${r.s2r} | ${r.failWhy} | ${r.unstWhy} |`);
  console.log("");
  console.log("| variant | auto-backup revision created | writing-log entries per rep | log matches (processing sequence) | failed saves (reps) | editor != server right after ack (reps) | editor != server after wait (reps) | editor != server after reload (reps) | PATCH with document A/B | console messages (reps) | stores changed by reload (reps) |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.variant} | ${r.backup} | ${r.logCount} | ${r.logMatch} | ${r.failedSaves} | ${r.edAck} | ${r.edLater} | ${r.edReload} | ${r.patchCounts} | ${r.consoleMsgs} | ${r.changedByReload} |`);
  console.log("");
  console.log("| variant | surfaces seen (text x reps) | discarded attempts | wall s | max heartbeat gap ms | gaps over 3 s | reps with nothing on 7340 / 3000 before start | reps with clean teardown | recorded pids alive after the variant | first / last run id |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.variant} | ${r.surfaces} | ${r.discardedAttempts} | ${r.wall} | ${r.heartbeatMax} | ${r.sleep} | ${r.pre7340none} / ${r.pre3000none} | ${r.teardownClean} | ${r.pidsAliveAfter} | ${r.firstRun} / ${r.lastRun} |`);
  console.log("");
  console.log(`non-clean repetitions (verdict not PASS, failed save, mix/none/unparseable, stores disagree, updatedAt tie, updatedAt order vs arrival order disagree): ${nonClean.length}`);
  for (const n of nonClean) console.log(JSON.stringify(n));
}
