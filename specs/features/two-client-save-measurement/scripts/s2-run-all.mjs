#!/usr/bin/env node
/**
 * Feature 78, Task 7: runs the S2 variants one after another, each as its own
 * process (`s2-near-simultaneous.mjs <variant> 20`), with its output in
 * /tmp/getwrite-two-client/logs/s2-<variant>.out (not the sandbox $TMPDIR) and
 * a progress file /tmp/getwrite-two-client/logs/s2-progress.txt (one line per
 * event; the last line is `ALL DONE` when the plan is finished).
 *
 * The plan is in priority order: tier 1 (the nine variants of Task 7, A released
 * first), tier 2 (the same nine, B released first), tier 3 (gaps 5, 15 and 30 ms
 * around the send-to-response duration of a save, both orders, both pairings).
 *
 * It spawns only `node s2-near-simultaneous.mjs`; the pid of the driver and of
 * the current child are written to the progress file so they can be stopped by
 * pid (nothing here stops anything by name or port). On SIGTERM or SIGINT the
 * driver signals ONLY its current child pid, starts no further variant, and
 * exits once that child has exited (after 60 s at the latest).
 *
 * Run OUTSIDE the command sandbox. Usage: node s2-run-all.mjs [variantId ...]
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = "/tmp/getwrite-two-client/logs";
const PROGRESS = path.join(LOG_DIR, "s2-progress.txt");

export const TIER1 = ["G0-P1-AB", "G0-P2-AB", "G0-P3-AB", "G50-P1-AB", "G50-P2-AB", "G250-P1-AB", "G250-P2-AB", "G1000-P1-AB", "G1000-P2-AB"];
export const TIER2 = TIER1.map((v) => v.replace(/-AB$/, "-BA"));
export const TIER3 = ["G15-P2-AB", "G15-P2-BA", "G5-P2-AB", "G5-P2-BA", "G30-P2-AB", "G30-P2-BA", "G15-P1-AB", "G15-P1-BA", "G5-P1-AB", "G5-P1-BA", "G30-P1-AB", "G30-P1-BA"];

mkdirSync(LOG_DIR, { recursive: true });
const note = (s) => appendFileSync(PROGRESS, `${new Date().toISOString()} ${s}\n`);

const plan = process.argv.length > 2 ? process.argv.slice(2) : [...TIER1, ...TIER2, ...TIER3];
let current = null;
let stopRequested = null;
const onStop = (signal) => {
  stopRequested = signal;
  note(`driver pid ${process.pid} got ${signal}; no further variant will start; signalling only its current child pid ${current?.pid ?? "none"}`);
  if (current) {
    try {
      process.kill(current.pid, "SIGTERM");
    } catch {
      // gone
    }
  }
  setTimeout(() => process.exit(143), 60000).unref();
};
process.on("SIGTERM", () => onStop("SIGTERM"));
process.on("SIGINT", () => onStop("SIGINT"));

note(`driver pid ${process.pid} starts; plan of ${plan.length} variants: ${plan.join(" ")}`);
let stoppedEarly = false;
for (const [i, v] of plan.entries()) {
  if (stopRequested) {
    stoppedEarly = true;
    note(`STOPPED by ${stopRequested}: not started: ${plan.slice(i).join(" ")}`);
    break;
  }
  await new Promise((resolve) => {
    const out = path.join(LOG_DIR, `s2-${v}.out`);
    const child = spawn("/bin/sh", ["-c", `exec "${process.execPath}" "${path.join(HERE, "s2-near-simultaneous.mjs")}" ${v} 20 > "${out}" 2>&1`], { cwd: HERE, stdio: "ignore" });
    current = child;
    note(`START ${v} child pid ${child.pid} (the shell execs node, same pid) log ${out}`);
    child.on("exit", (code, sig) => {
      note(`END ${v} exit=${code} signal=${sig}`);
      current = null;
      resolve();
    });
  });
}
if (stoppedEarly) process.exitCode = 143;
else if (stopRequested) {
  note(`STOPPED by ${stopRequested} during the last variant: no variant was left to start`);
  process.exitCode = 143;
} else note("ALL DONE");
