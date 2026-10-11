#!/usr/bin/env node
/**
 * Feature 78, Task 2: self-check of the store reader, classifier and verdict.
 *
 * No browser and no server. Writes synthetic stores for one resource into a
 * throwaway folder (os.tmpdir(), removed afterwards), runs the SAME reader
 * (`readSnapshot`), classifier (`classifySnapshot`) and verdict function the
 * scenarios use, and checks each answer against what was constructed. Exit
 * code 0 only if every case is named and judged as constructed.
 *
 * Usage: node self-check.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE_TEXT, longAddition } from "./lib/fixture.mjs";
import {
  classifySnapshot,
  describeClassification,
  determineLastProcessed,
  docString,
  expectedForms,
  readSnapshot,
  verdict,
} from "./lib/stores.mjs";

const RID = "00000000-0000-4000-8000-000000000001";
const baseContent = docString(BASE_TEXT);
const docA = docString(`${BASE_TEXT} A1`);
const docB = docString(`${BASE_TEXT}${longAddition("B2LONG")}`);
const DOCS = { base: baseContent, "A#1": docA, "B#1": docB };
const wcOf = (c) => expectedForms(c).wordCount;

/** Saves processed in the given order ("A" or "B"), strictly increasing updatedAt and arrival. */
function savesInOrder(order) {
  return order.map((who, i) => ({
    id: i + 1,
    client: who,
    docLabel: `${who}#1`,
    sendT: 1000 + i * 100,
    respT: 1050 + i * 100,
    updatedAt: `2026-10-11T18:00:0${i + 1}.000Z`,
  }));
}

function writeProject(dir, { contentBin, tiptapJson, txt, wordCount, updatedAt }) {
  const rev = path.join(dir, "revisions", RID, "v-1");
  const res = path.join(dir, "resources", RID);
  const meta = path.join(dir, "meta");
  for (const d of [rev, res, meta]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(rev, "content.bin"), contentBin);
  writeFileSync(
    path.join(rev, "metadata.json"),
    JSON.stringify({ id: "r", resourceId: RID, versionNumber: 1, isCanonical: true, metadata: { name: "Initial" } }, null, 2),
  );
  writeFileSync(path.join(res, "content.tiptap.json"), tiptapJson);
  writeFileSync(path.join(res, "content.txt"), txt);
  writeFileSync(
    path.join(meta, `resource-${RID}.meta.json`),
    JSON.stringify({ id: RID, name: "synthetic", wordCount, updatedAt }, null, 2),
  );
}

const fa = expectedForms(docA);
const fb = expectedForms(docB);
const fbase = expectedForms(baseContent);
const upd = (order) => savesInOrder(order).at(-1).updatedAt;

const idxAfterA1 = docA.indexOf(" A1") + 3;
const idxTailB = docB.indexOf("lantern");
const interleaved = docA.slice(0, idxAfterA1) + docB.slice(idxTailB);
const truncated = docA.slice(0, Math.floor(docA.length * 0.6));

const allOf = (f, content, updatedAt, wordCount = f.wordCount) => ({
  contentBin: content,
  tiptapJson: f.tiptapJson,
  txt: f.txt,
  wordCount,
  updatedAt,
});

const CASES = [
  {
    name: "1. exactly A's document in all four stores (A processed last)",
    stores: allOf(fa, docA, upd(["B", "A"])),
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "PASS",
  },
  {
    name: "2. exactly B's document in all four stores (B processed last)",
    stores: allOf(fb, docB, upd(["A", "B"])),
    saves: savesInOrder(["A", "B"]),
    expectNames: { contentBin: "B#1", tiptapJson: "B#1", txt: "B#1", agree: true },
    expectVerdict: "PASS",
  },
  {
    name: "3. the base document in all four stores (B processed last, so B's save is missing)",
    stores: allOf(fbase, baseContent, "2026-10-11T17:59:00.000Z"),
    saves: savesInOrder(["A", "B"]),
    expectNames: { contentBin: "base", tiptapJson: "base", txt: "base", agree: true },
    expectVerdict: "FAIL",
  },
  {
    name: "4. MIX: content.bin and content.tiptap.json from A, content.txt from B",
    stores: { contentBin: docA, tiptapJson: fa.tiptapJson, txt: fb.txt, wordCount: fa.wordCount, updatedAt: upd(["B", "A"]) },
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "B#1", agree: false },
    expectVerdict: "FAIL",
    expectReason: /stores disagree/,
  },
  {
    name: "5. INTERLEAVING: content.bin = first part of A's bytes (through ' A1') + tail of B's bytes",
    stores: { contentBin: interleaved, tiptapJson: fa.tiptapJson, txt: fa.txt, wordCount: fa.wordCount, updatedAt: upd(["B", "A"]) },
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "NONE", tiptapJson: "A#1", txt: "A#1", agree: false },
    expectMix: /first \d+ chars match A#1, last \d+ chars match B#1/,
    expectVerdict: "FAIL",
    expectReason: /holds none of the documents/,
  },
  {
    name: "6. truncated, unparseable content.bin (A's bytes cut at 60%)",
    stores: { contentBin: truncated, tiptapJson: fa.tiptapJson, txt: fa.txt, wordCount: fa.wordCount, updatedAt: upd(["B", "A"]) },
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "UNPARSEABLE", tiptapJson: "A#1", txt: "A#1", agree: false },
    expectVerdict: "FAIL",
    expectReason: /unparseable/,
  },
  {
    name: "7. sidecar wordCount inconsistent (A's document everywhere, wordCount of B's)",
    stores: allOf(fa, docA, upd(["B", "A"]), fb.wordCount),
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "FAIL",
    expectReason: /wordCount inconsistent/,
  },
  {
    name: "8. [extra] A's document everywhere but B was processed last",
    stores: allOf(fa, docA, upd(["A", "B"])),
    saves: savesInOrder(["A", "B"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "FAIL",
    expectReason: /last processed save carried B#1/,
  },
  {
    name: "9. [extra] A's document everywhere, updatedAt of the last two saves tied (order not determined)",
    stores: allOf(fa, docA, "2026-10-11T18:00:01.000Z"),
    saves: savesInOrder(["B", "A"]).map((s) => ({ ...s, updatedAt: "2026-10-11T18:00:01.000Z" })),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "UNSTABLE",
  },
  {
    name: "10. [extra] A's document everywhere, updatedAt order and response arrival order disagree",
    stores: allOf(fa, docA, "2026-10-11T18:00:02.000Z"),
    saves: [
      { id: 1, client: "A", docLabel: "A#1", sendT: 1000, respT: 1100, updatedAt: "2026-10-11T18:00:02.000Z" },
      { id: 2, client: "B", docLabel: "B#1", sendT: 1010, respT: 1200, updatedAt: "2026-10-11T18:00:01.000Z" },
    ],
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "UNSTABLE",
  },
  {
    name: "11. [extra] A's document everywhere, sidecar updatedAt is the other save's",
    stores: allOf(fa, docA, "2026-10-11T18:00:01.000Z"),
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "FAIL",
    expectReason: /sidecar updatedAt/,
  },
  {
    name: "12. [extra] content.txt has one stray trailing character",
    stores: { contentBin: docA, tiptapJson: fa.tiptapJson, txt: `${fa.txt}x`, wordCount: fa.wordCount, updatedAt: upd(["B", "A"]) },
    saves: savesInOrder(["B", "A"]),
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "NONE", agree: false },
    expectVerdict: "FAIL",
  },
  {
    name: "13. [extra] all four hold A (last processed), requireReload on, both clients reloaded to A's text",
    stores: allOf(fa, docA, upd(["B", "A"])),
    saves: savesInOrder(["B", "A"]),
    reloadTexts: { A: `${BASE_TEXT} A1`, B: `${BASE_TEXT} A1` },
    requireReload: true,
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "PASS",
  },
  {
    name: "14. [extra] all four hold A (last processed), requireReload on, client B reloaded to the base text",
    stores: allOf(fa, docA, upd(["B", "A"])),
    saves: savesInOrder(["B", "A"]),
    reloadTexts: { A: `${BASE_TEXT} A1`, B: BASE_TEXT },
    requireReload: true,
    expectNames: { contentBin: "A#1", tiptapJson: "A#1", txt: "A#1", agree: true },
    expectVerdict: "FAIL",
    expectReason: /client B shows a different document after reload/,
  },
];

const nameOf = (x) => (x.status === "equals" ? x.equals.join("/") : x.status === "none" ? "NONE" : x.status.toUpperCase());

function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), "gw-selfcheck-"));
  const realRoot = realpathSync(root);
  if (!realRoot.startsWith(realpathSync(os.tmpdir()))) {
    console.error("throwaway folder is not under the temp directory; stopping");
    process.exit(5);
  }
  console.log(`self-check: node ${process.version}; throwaway folder under os.tmpdir() (removed afterwards); no browser, no server`);
  console.log('documents: A = base + " A1"; B = base + " B2LONG" + the 40-word list');
  console.log(`expected word counts (ported countWords, read not run): base=${fbase.wordCount} A=${fa.wordCount} B=${fb.wordCount}`);
  console.log("verdict called with requireReload=false unless the case says otherwise (no browser here to reload)");
  console.log("");
  let bad = 0;
  try {
    for (const [i, c] of CASES.entries()) {
      const dir = path.join(realRoot, `case-${i + 1}`);
      writeProject(dir, c.stores);
      const snap = readSnapshot(dir, RID);
      const cls = classifySnapshot(snap, DOCS);
      const last = determineLastProcessed(c.saves);
      const v = verdict({
        classification: cls,
        last,
        docs: DOCS,
        reloadTexts: c.reloadTexts,
        requireReload: c.requireReload ?? false,
      });
      const got = {
        contentBin: nameOf(cls.contentBin),
        tiptapJson: nameOf(cls.tiptapJson),
        txt: nameOf(cls.txt),
        agree: cls.storesAgree,
      };
      const problems = [];
      for (const k of ["contentBin", "tiptapJson", "txt", "agree"]) {
        if (got[k] !== c.expectNames[k]) problems.push(`${k}: expected ${c.expectNames[k]}, got ${got[k]}`);
      }
      if (v.verdict !== c.expectVerdict) problems.push(`verdict: expected ${c.expectVerdict}, got ${v.verdict}`);
      if (c.expectReason && !c.expectReason.test(v.reasons.join(" | "))) problems.push(`reason did not match ${c.expectReason}`);
      if (c.expectMix && !c.expectMix.test(cls.contentBin.mix ?? "")) problems.push(`mix hint did not match ${c.expectMix}`);
      if (c.expectVerdict === "PASS" && v.verdict !== "PASS") problems.push("a PASS case did not pass");
      if (v.verdict === "PASS" && c.expectVerdict !== "PASS") problems.push("PASS returned for a case that must not pass");
      console.log(`${problems.length ? "MISMATCH" : "ok      "} ${c.name}`);
      for (const line of describeClassification(cls)) console.log(`           ${line}`);
      if (cls.contentBin.diff) {
        const d = cls.contentBin.diff;
        console.log(
          `           content.bin diff vs nearest ${d.nearest}: common prefix ${d.commonPrefixChars}, common suffix ${d.commonSuffixChars}, stored ${d.storedChars} chars vs ${d.nearestChars}; stored middle=${JSON.stringify(d.storedMiddle.slice(0, 90))}`,
        );
      }
      if (cls.txt.diff) {
        const d = cls.txt.diff;
        console.log(`           content.txt diff vs nearest ${d.nearest}: stored middle=${JSON.stringify(d.storedMiddle)}, nearest middle=${JSON.stringify(d.nearestMiddle)}`);
      }
      console.log(`           last processed: ${last.determined ? `${last.docLabel} (updatedAt ${last.updatedAt})` : `NOT DETERMINED (${last.reason})`}`);
      console.log(`           verdict: ${v.verdict} -- ${v.reasons.join(" | ")}`);
      for (const p of problems) console.log(`           PROBLEM: ${p}`);
      if (problems.length) bad += 1;
      console.log("");
    }
  } finally {
    rmSync(realRoot, { recursive: true, force: true });
    console.log(`throwaway folder removed: ${!existsSync(realRoot)}`);
  }
  const passes = CASES.filter((c) => c.expectVerdict === "PASS").length;
  console.log(`cases: ${CASES.length}; constructed as PASS: ${passes} (cases 1, 2, 13); mismatches: ${bad}`);
  console.log(bad === 0 ? "SELF-CHECK OK: every case was named and judged as constructed" : "SELF-CHECK FAILED");
  process.exit(bad === 0 ? 0 : 1);
}

main();
