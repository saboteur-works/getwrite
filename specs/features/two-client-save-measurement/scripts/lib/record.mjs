/**
 * Feature 78 harness: the per-repetition record.
 *
 * Prints, and writes as JSON under
 * specs/features/two-client-save-measurement/results/<scenario>/, for one
 * repetition: scenario, run id, commit, the server (built standalone, port
 * chosen), the steps with times, the six outcomes of the task header, the
 * verdict inputs and the raw findings observations. Nothing is summarised
 * away. The JSON holds marker strings and hashes only: documents are never
 * written (the keys `raw`, `content`, `cookie`, `secret`, `code`, `password`
 * are refused by a guard).
 *
 * Outcomes (task header): 1 server state; 2 each open editor; 3 notification;
 * 4 lost-update shape; 5 side effects; 6 failed saves.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RESULTS_DIR, gitCommit, hostNow, isoOf } from "./util.mjs";

const OUTCOME_TITLES = {
  1: "Outcome 1, server state (four stores, classified)",
  2: "Outcome 2, each open editor (text and footer: (a) right after the other client's save was acknowledged, (b) after 30 s, (c) after reload)",
  3: "Outcome 3, notification (surfaces checked are named)",
  4: "Outcome 4, lost-update shape (did a stale editor's save write its older copy over newer text, and only after typing)",
  5: "Outcome 5, side effects (revisions, writing log vs expected, search, wordCount, indexes)",
  6: "Outcome 6, failed saves (non-2xx: status and truncated body; what the client showed)",
};
const FORBIDDEN_KEYS = new Set(["raw", "content", "cookie", "cookies", "secret", "code", "password", "passphrase"]);

function assertNoForbiddenKeys(value, trail = "") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenKeys(v, `${trail}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new Error(`record refuses key "${k}" at ${trail || "(root)"}`);
      assertNoForbiddenKeys(v, `${trail}.${k}`);
    }
  }
}

export function createRecord({ scenario, repetition = 1, runId, server, note }) {
  const t0 = hostNow();
  const rec = {
    scenario,
    repetition,
    runId,
    commit: gitCommit(),
    startedAt: isoOf(t0),
    node: process.version,
    note,
    server: server && {
      kind: "built standalone server (frontend/.next/standalone/frontend/server.js), sharing on",
      port: server.port,
      pid: server.pid,
      address: server.hostKind,
    },
    labelEvery: "host to itself, not a second-device result",
    timesAre: "Playwright event times on the host clock, not wire times",
    steps: [],
    outcomes: {},
    verdictInputs: null,
    verdict: null,
    findings: {},
    extra: {},
  };

  return {
    data: rec,
    t0,
    /** A timed step. `data` is any JSON-safe facts about it. */
    step(name, data = {}) {
      const t = hostNow();
      rec.steps.push({ at: isoOf(t), tMs: Math.round(t - t0), name, ...data });
    },
    outcome(n, data) {
      rec.outcomes[n] = { ...(rec.outcomes[n] ?? {}), ...data };
    },
    finding(key, data) {
      rec.findings[key] = data;
    },
    set(key, value) {
      rec.extra[key] = value;
    },
    verdictInputs(v) {
      rec.verdictInputs = v;
    },
    verdict(v) {
      rec.verdict = v;
    },

    print(log = console.log) {
      log("=".repeat(100));
      log(`RECORD scenario=${rec.scenario} repetition=${rec.repetition} run=${rec.runId} commit=${rec.commit} node=${rec.node}`);
      log(`started ${rec.startedAt}`);
      if (rec.server) {
        log(`server: ${rec.server.kind}; port ${rec.server.port}; pid ${rec.server.pid}; ${rec.server.address}`);
      }
      log(`every result in this record: ${rec.labelEvery}. Times: ${rec.timesAre}.`);
      if (rec.note) log(`note: ${rec.note}`);
      log("-- steps (time since record start) --");
      for (const s of rec.steps) {
        const { at, tMs, name, ...rest } = s;
        log(`  [+${String(tMs).padStart(6)} ms ${at}] ${name}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""}`);
      }
      for (const n of [1, 2, 3, 4, 5, 6]) {
        log(`-- ${OUTCOME_TITLES[n]} --`);
        const o = rec.outcomes[n];
        if (!o) log("  (not recorded by this run)");
        else for (const [k, v] of Object.entries(o)) log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
      log("-- verdict inputs --");
      log(`  ${rec.verdictInputs ? JSON.stringify(rec.verdictInputs) : "(none)"}`);
      log("-- verdict (against the Task 1 definition) --");
      log(`  ${rec.verdict ? JSON.stringify(rec.verdict) : "(none)"}`);
      log("-- findings, raw observations, NO verdict --");
      const keys = Object.keys(rec.findings);
      if (keys.length === 0) log("  (none recorded by this run)");
      for (const k of keys) log(`  ${k}: ${JSON.stringify(rec.findings[k])}`);
      if (Object.keys(rec.extra).length) {
        log("-- extra facts --");
        for (const [k, v] of Object.entries(rec.extra)) log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
      log("=".repeat(100));
    },

    /** Write the same record as JSON under results/<scenario>/. Returns the path. */
    writeJson(dir = path.join(RESULTS_DIR, rec.scenario)) {
      assertNoForbiddenKeys(rec);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${rec.runId}-rep${String(rec.repetition).padStart(2, "0")}.json`);
      writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
      return file;
    },
  };
}
