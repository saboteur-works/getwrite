// Node check for fixtures.mjs (Task 5). Run: node fixtures.check.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { PARAMS, loadDictionaryWords, generateFixture } = await import("./fixtures.mjs");
const sizes = [5000, 50000, 200000];
const dictWords = await loadDictionaryWords();
const dictSet = new Set(dictWords);
const sha = (s) => createHash("sha256").update(s).digest("hex");

for (const size of sizes) {
  test(`${size} words: deterministic, paragraphs 80-150, planted rates, dictionary-sampled`, () => {
    const a = generateFixture(size, PARAMS.seed, dictWords);
    const b = generateFixture(size, PARAMS.seed, dictWords);
    assert.equal(sha(a.text), sha(b.text), "byte-identical for the same seed");
    assert.notEqual(sha(a.text), sha(generateFixture(size, PARAMS.seed + 1, dictWords).text));
    const paragraphs = a.text.split("\n\n");
    let total = 0;
    for (const p of paragraphs) {
      const n = p.split(" ").length;
      assert.ok(n >= 80 && n <= 150, `paragraph of ${n} words`);
      total += n;
    }
    assert.equal(total, size);
    assert.equal(a.counts.words, size);
    assert.equal(a.counts.misspellings, Math.floor(size / 50));
    assert.equal(a.counts.names, Math.floor(size / 200));
    const words = a.text.split(/\s+/);
    const names = new Set(PARAMS.names);
    let m = 0, n = 0, other = 0;
    for (const w of words) {
      if (names.has(w)) n++;
      else if (dictSet.has(w)) other++;
      else m++;
    }
    assert.equal(n, a.counts.names);
    assert.equal(m, a.counts.misspellings, "every non-dictionary, non-name word is a planted misspelling");
    assert.equal(other + m + n, size);
    assert.ok(new Set(words.filter((w) => names.has(w))).size >= 2, "names repeat across the document");
  });
}

test("CLI run twice yields identical files and prints counts", () => {
  const out1 = mkdtempSync(join(tmpdir(), "fx1-"));
  const out2 = mkdtempSync(join(tmpdir(), "fx2-"));
  const run = (o) => execFileSync("node", [join(here, "fixtures.mjs"), "--out", o], { encoding: "utf8" });
  const log = run(out1);
  run(out2);
  assert.match(log, /misspellings=\d+/);
  assert.match(log, /names=\d+/);
  const files = readdirSync(out1).sort();
  assert.equal(files.length, 3);
  for (const f of files) assert.equal(sha(readFileSync(join(out1, f))), sha(readFileSync(join(out2, f))));
});

test("script imports no application module and reads no project folder", () => {
  const src = readFileSync(join(here, "fixtures.mjs"), "utf8");
  assert.doesNotMatch(src, /from ["'](\.\.\/)+(frontend|src|app|components)/);
  assert.doesNotMatch(src, /projects\//);
});
