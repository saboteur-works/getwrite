#!/usr/bin/env node
/**
 * Feature 78, Task 7: the S2 findings (a) to (g) as raw counts, read from the
 * per-repetition JSON files under results/s2/ that the summary files point at.
 * No verdict here: counts of what was observed, per variant and in total. Pure
 * file reading. Usage: node s2-findings.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { WORD40 } from "./lib/fixture.mjs";
import { RESULTS_DIR } from "./lib/util.mjs";

const dir = path.join(RESULTS_DIR, "s2");
const summaries = readdirSync(dir)
  .filter((f) => f.startsWith("summary-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

const BASE = "BASE alpha bravo charlie";
const plainOf = { P1: { A: `${BASE} A1`, B: `${BASE} B1` }, P2: { A: `${BASE} A1`, B: `${BASE} B2LONG ${WORD40.join(" ")}` }, P3: { A: `${BASE} A2LONG ${WORD40.join(" ")}`, B: `${BASE} B1` } };
const norm = (t) => String(t).replace(/\s+/g, " ").trim();
const shows = (text, pairing) => {
  const t = norm(text);
  if (t === norm(plainOf[pairing].A)) return "A's text";
  if (t === norm(plainOf[pairing].B)) return "B's text";
  if (t.startsWith('{"type":"doc"')) return "raw JSON text (the stored content.bin shown as text)";
  return `other (${t.length} chars)`;
};
const tally = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join("; ") || "none";

const per = [];
const total = { reps: 0 };
const allConsole = new Map();
const allSurfaces = new Map();
for (const s of summaries) {
  const v = { variant: s.variant, reps: 0, a: new Map(), b: new Map(), d: new Map(), e: { ack: 0, later: 0, reload: new Map() }, f: new Map(), g: 0, c: new Map(), consoleTexts: new Map(), toastBackup: 0 };
  for (const r of s.reps.filter((x) => x.completed !== false && x.file)) {
    v.reps += 1;
    total.reps += 1;
    const rep = JSON.parse(readFileSync(r.file, "utf8"));
    const f = rep.extra.s2;
    const pairing = f.pairing;
    // (a) what the stored document carries
    const held = f.stores.held;
    tally(v.a, held.length === 1 ? `stores agree on ${held[0].startsWith("A") ? "A" : "B"}'s whole document only (the other client's marker absent)` : "no single whole document in all three file stores");
    // (b) saves with a document per client
    tally(v.b, `${f.patchCounts.A}/${f.patchCounts.B}`);
    // (c) notifications
    for (const who of ["A", "B"]) {
      for (const t of f.surfaceTexts[who]) {
        tally(v.c, `${who}: ${t}`);
        tally(allSurfaces, t);
      }
      for (const c of rep.outcomes[3][`${who}_sinceFirstTyping`].console) {
        tally(v.consoleTexts, c.text);
        tally(allConsole, c.text);
      }
    }
    if (f.surfaceTexts.A.concat(f.surfaceTexts.B).some((t) => /backup/i.test(t))) v.toastBackup += 1;
    // (d) recoverability of the overwritten text
    const lastLabel = held.length === 1 ? held[0] : null;
    if (lastLabel) {
      const overwritten = lastLabel.startsWith("A") ? "B#1" : "A#1";
      const surviveIn = f.revisions.filter((x) => !x.canonical && x.contains === `= ${overwritten}`);
      tally(v.d, surviveIn.length ? `overwritten whole document ${overwritten} survives in ${surviveIn.map((x) => `${x.dir} "${x.name}"`).join(", ")}` : `overwritten document ${overwritten} survives in no revision and no store`);
    } else {
      tally(v.d, `no single document held; non-canonical revisions: ${f.revisions.filter((x) => !x.canonical).length}`);
    }
    // (e) editor versus server
    if (f.editors.rightAfterAck.A === false || f.editors.rightAfterAck.B === false) v.e.ack += 1;
    if (f.editors.later.A === false || f.editors.later.B === false) v.e.later += 1;
    const ed = rep.outcomes[2].afterReload.editors;
    tally(v.e.reload, `A shows ${shows(ed.A.text, pairing)}; B shows ${shows(ed.B.text, pairing)}`);
    // (f) writing log
    tally(v.f, `${f.log.count} entries ${f.log.entries.map((e) => `+${e.added}/-${e.deleted}`).join(" ")}`);
    // (g) failed saves
    v.g += f.failed.A.length + f.failed.B.length;
  }
  per.push(v);
}

const order = ["G0", "G5", "G15", "G30", "G50", "G250", "G1000"];
per.sort((x, y) => {
  const m = (z) => /^G(\d+)-P(\d)-(AB|BA)$/.exec(z.variant);
  const a = m(x);
  const b = m(y);
  return order.indexOf(`G${a[1]}`) - order.indexOf(`G${b[1]}`) || Number(a[2]) - Number(b[2]) || a[3].localeCompare(b[3]);
});

console.log(`repetitions read: ${total.reps}`);
console.log("");
console.log("(a) what the stored document carries");
for (const v of per) console.log(`- ${v.variant}: ${fmt(v.a)}`);
console.log("");
console.log("(b) PATCH requests carrying a document, client A / client B (each client typed once)");
for (const v of per) console.log(`- ${v.variant}: ${fmt(v.b)}`);
console.log("");
console.log("(c) toast/status/alert/dialog surfaces seen from the first typing to the end (client: text x repetitions)");
for (const v of per) console.log(`- ${v.variant}: ${fmt(v.c)}${v.toastBackup ? ` | repetitions with a backup toast: ${v.toastBackup}` : ""}`);
console.log(`- console messages (errors and warnings) over all repetitions, text x occurrences: ${fmt(allConsole)}`);
console.log("");
console.log("(d) does the overwritten text survive anywhere (revisions read; browser storage and server memory not looked at)");
for (const v of per) console.log(`- ${v.variant}: ${fmt(v.d)}`);
console.log("");
console.log("(e) editor versus server (repetitions where an editor's text differed from the server's text: right after both acknowledged / after the wait; what each editor showed after reload)");
for (const v of per) console.log(`- ${v.variant}: ack ${v.e.ack}, wait ${v.e.later}; after reload: ${fmt(v.e.reload)}`);
console.log("");
console.log("(f) writing-log entries per repetition (added/deleted per entry, in timestamp order)");
for (const v of per) console.log(`- ${v.variant}: ${fmt(v.f)}`);
console.log("");
console.log("(g) failed saves (non-2xx responses to a content save), total per variant");
for (const v of per) console.log(`- ${v.variant}: ${v.g}`);
