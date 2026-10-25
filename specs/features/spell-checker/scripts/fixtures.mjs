// Spike fixture generator (Feature 95, Task 5; FR-2, FR-5).
// Deterministic long documents with planted misspellings and made-up names.
// Imports no application module; reads no project folder. The only file it
// reads is the installed dictionary-en word list. Output goes to --out
// (default: $TMPDIR/spell-fixtures), never the tracked tree.
//
// Run: node specs/features/spell-checker/scripts/fixtures.mjs [--seed N] [--out DIR]
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PARAMS = Object.freeze({
  seed: 95,
  sizes: [5000, 50000, 200000],
  paragraphMinWords: 80,
  paragraphMaxWords: 150,
  misspellEvery: 50,
  misspellOffset: 25,
  nameEvery: 200,
  nameOffset: 100,
  dictionaryWordPattern: "^[a-z]{3,12}$",
  // Made-up proper names, checked against the dictionary at load.
  names: ["Zorvath", "Keldrin", "Mirabeth", "Quillon", "Thessaly", "Vornak", "Ildreth", "Brannoch"],
});

const here = dirname(fileURLToPath(import.meta.url));
const dictionaryEntry = pathToFileURL(
  resolve(here, "../../../../frontend/node_modules/dictionary-en/index.js"),
).href;

/** Seeded PRNG, as frontend/tests/entityHighlightBenchmark.test.ts:24. */
export function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stems from dictionary-en's .dic, lowercase letters only, sorted, unique. */
export async function loadDictionaryWords() {
  const { dic } = (await import(dictionaryEntry)).default;
  const pattern = new RegExp(PARAMS.dictionaryWordPattern);
  const stems = new Set();
  for (const line of new TextDecoder().decode(dic).split("\n").slice(1)) {
    const stem = line.split("/")[0].trim();
    if (pattern.test(stem)) stems.add(stem);
  }
  const words = [...stems].sort();
  const lowered = new Set(PARAMS.names.map((n) => n.toLowerCase()));
  for (const w of words) {
    if (lowered.has(w)) throw new Error(`made-up name is a dictionary word: ${w}`);
  }
  return words;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** One single-character edit (substitute, delete or insert) not in the dictionary. */
function misspell(word, random, dictSet) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const kind = Math.floor(random() * 3);
    const pos = Math.floor(random() * word.length);
    const ch = ALPHABET[Math.floor(random() * 26)];
    let edited;
    if (kind === 0) edited = word.slice(0, pos) + ch + word.slice(pos + 1);
    else if (kind === 1) edited = word.slice(0, pos) + word.slice(pos + 1);
    else edited = word.slice(0, pos) + ch + word.slice(pos);
    if (edited !== word && edited.length >= 2 && !dictSet.has(edited)) return edited;
  }
  throw new Error(`no misspelling found for ${word}`);
}

/** Paragraph word counts in [min, max] that sum to total, each one valid. */
function paragraphLengths(total, random) {
  const { paragraphMinWords: lo, paragraphMaxWords: hi } = PARAMS;
  const lengths = [];
  let remaining = total;
  while (remaining > 0) {
    if (remaining <= hi) {
      lengths.push(remaining);
      break;
    }
    const allowed = [];
    for (let n = lo; n <= hi; n++) {
      const left = remaining - n;
      if (left === 0 || (left >= lo && (left <= hi || left > hi + 9))) allowed.push(n);
    }
    // left in (hi, hi+lo-1) cannot be split into valid paragraphs; excluded above.
    lengths.push(allowed[Math.floor(random() * allowed.length)]);
    remaining -= lengths[lengths.length - 1];
  }
  return lengths;
}

export function generateFixture(size, seed, dictWords) {
  const random = mulberry32(seed + size);
  const dictSet = new Set(dictWords);
  const { misspellEvery, misspellOffset, nameEvery, nameOffset, names } = PARAMS;
  const words = [];
  let misspellings = 0;
  let nameCount = 0;
  for (let i = 0; i < size; i++) {
    const sampled = dictWords[Math.floor(random() * dictWords.length)];
    if (i % nameEvery === nameOffset) {
      words.push(names[Math.floor(random() * names.length)]);
      nameCount++;
    } else if (i % misspellEvery === misspellOffset) {
      words.push(misspell(sampled, random, dictSet));
      misspellings++;
    } else {
      words.push(sampled);
    }
  }
  const paragraphs = [];
  let at = 0;
  for (const n of paragraphLengths(size, random)) {
    paragraphs.push(words.slice(at, at + n).join(" "));
    at += n;
  }
  return {
    text: paragraphs.join("\n\n"),
    counts: { words: size, paragraphs: paragraphs.length, misspellings, names: nameCount },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const seed = Number(opt("--seed", PARAMS.seed));
  const out = opt("--out", join(process.env.TMPDIR ?? tmpdir(), "spell-fixtures"));
  const dictWords = await loadDictionaryWords();
  mkdirSync(out, { recursive: true });
  console.log(`seed=${seed} dictionaryWords=${dictWords.length} out=${out}`);
  for (const size of PARAMS.sizes) {
    const { text, counts } = generateFixture(size, seed, dictWords);
    writeFileSync(join(out, `fixture-${size}.txt`), text);
    console.log(
      `size=${size} paragraphs=${counts.paragraphs} misspellings=${counts.misspellings} names=${counts.names}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
