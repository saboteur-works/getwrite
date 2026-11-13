#!/usr/bin/env node
/**
 * Writes a GENERATED GetWrite project for the Feature 110 (folklore variants)
 * column-limit run on long text (Task 28). It is not shipped as a feature.
 * Every name, text and field value is synthetic (random words from a small
 * list); no text is a writer's. Nothing is read from or written to the
 * repo's `projects/` unless `--out` names it.
 *
 * Usage:
 *   node scripts/folklore-long-text-fixture.mjs --out <dir>
 *     [--variants <N>] [--short <words>] [--long <words>]
 *     [--very-long <words>] [--seed <int>]
 *
 * The project lands in `<dir>/<projectId>/`. It holds one Narrative folder
 * and N Variant Sources; variant i takes the short, long or very long word
 * count in turn (i mod 3), so each length is present once N >= 3. Defaults:
 * 6 variants, 300 / 3000 / 20000 words. The metadata schema carries the three
 * Variant text fields (teller, date, place) and two multiselect fields
 * (motifs, tale-types), each limited to the Variant subtype; the subtype list
 * holds "Narrative" and "Variant"; `config.modules.folklore` is true.
 * Prints one JSON line with the word counts written.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const NARRATIVE = "Narrative";
const VARIANT = "Variant";
const MOTIFS = [
  "D1 | Synthetic motif one",
  "D2 | Synthetic motif two",
  "D3 | Synthetic motif three",
  "D4 | Synthetic motif four",
];
const TALE_TYPES = [
  "T100 | Synthetic tale type A",
  "T200 | Synthetic tale type B",
  "T300 | Synthetic tale type C",
];
const WORDS = (
  "river lantern harbor ember quiet winter orchard signal thread marble " +
  "window ledger copper meadow shadow compass velvet anchor whisper granite"
).split(" ");
const PARAGRAPH_WORDS = 100;
const MAX_WORDS = 2_000_000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A version-4-shaped UUID drawn from `rand`. */
function uuidFrom(rand) {
  const hex = (n) =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join(
      "",
    );
  const variant = "89ab"[Math.floor(rand() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** Parses a positive integer option, failing with the option's name. */
function parsePositive(name, raw, max) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(
      `--${name} must be an integer from 1 to ${max}, got "${raw}"`,
    );
  }
  return n;
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

/** Exactly `count` synthetic words, in paragraphs of PARAGRAPH_WORDS. */
function makeParagraphs(count, pick) {
  const paragraphs = [];
  for (let left = count; left > 0; left -= PARAGRAPH_WORDS) {
    const n = Math.min(PARAGRAPH_WORDS, left);
    paragraphs.push(Array.from({ length: n }, () => pick(WORDS)).join(" "));
  }
  return paragraphs;
}

function writeVariant(root, ctx, index, words) {
  const { pick, uuid, folderId, stamp } = ctx;
  const id = uuid();
  const paragraphs = makeParagraphs(words, pick);
  const text = paragraphs.join("\n\n");
  const doc = {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  };
  writeJson(path.join(root, "meta", `resource-${id}.meta.json`), {
    id,
    name: `Synthetic variant ${index + 1} (${words} words)`,
    type: "source",
    createdAt: stamp,
    slug: `synthetic-variant-${index + 1}`,
    folderId,
    orderIndex: index,
    resourceSubtype: VARIANT,
    attachments: [],
    userMetadata: {
      teller: `Synthetic teller ${index + 1}`,
      date: "c. 1850",
      place: `Synthetic place ${index + 1}`,
      motifs: [pick(MOTIFS)],
      "tale-types": [pick(TALE_TYPES)],
    },
    wordCount: words,
  });
  mkdirSync(path.join(root, "resources", id), { recursive: true });
  writeFileSync(path.join(root, "resources", id, "content.txt"), text);
  writeFileSync(
    path.join(root, "resources", id, "content.tiptap.json"),
    JSON.stringify(doc),
  );
  const revDir = path.join(root, "revisions", id, "v-1");
  mkdirSync(revDir, { recursive: true });
  writeFileSync(path.join(revDir, "content.bin"), JSON.stringify(doc));
  writeJson(path.join(revDir, "metadata.json"), {
    id: uuid(),
    resourceId: id,
    versionNumber: 1,
    createdAt: stamp,
    savedAt: stamp,
    filePath: path.join(revDir, "content.bin"),
    isCanonical: true,
  });
  return { id, words: text.split(/\s+/).length };
}

function metadataSchema() {
  const scoped = { appliesTo: [VARIANT] };
  return {
    groups: [
      {
        id: "builtin-document",
        label: "Document",
        fields: [
          { key: "status", label: "Status", type: "select", locked: true },
        ],
      },
      {
        id: "generated-folklore",
        label: "Variant fields",
        fields: [
          { key: "teller", label: "Teller", type: "text", ...scoped },
          { key: "date", label: "Date", type: "text", ...scoped },
          { key: "place", label: "Place", type: "text", ...scoped },
          {
            key: "motifs",
            label: "Motifs",
            type: "multiselect",
            options: MOTIFS,
            ...scoped,
          },
          {
            key: "tale-types",
            label: "Tale types",
            type: "multiselect",
            options: TALE_TYPES,
            ...scoped,
          },
        ],
      },
    ],
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      variants: { type: "string", default: "6" },
      short: { type: "string", default: "300" },
      long: { type: "string", default: "3000" },
      "very-long": { type: "string", default: "20000" },
      seed: { type: "string", default: "110" },
    },
  });
  if (!values.out) {
    throw new Error(
      "usage: folklore-long-text-fixture.mjs --out <dir> [--variants <N>] [--short <words>] [--long <words>] [--very-long <words>] [--seed <int>]",
    );
  }
  const variants = parsePositive("variants", values.variants, 200);
  const lengths = [
    parsePositive("short", values.short, MAX_WORDS),
    parsePositive("long", values.long, MAX_WORDS),
    parsePositive("very-long", values["very-long"], MAX_WORDS),
  ];
  const seed = Number(values.seed);
  if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");
  const rand = mulberry32(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const uuid = () => uuidFrom(rand);
  const stamp = "2026-01-01T00:00:00.000Z";

  const projectId = uuid();
  const root = path.resolve(values.out, projectId);
  if (existsSync(root) && readdirSync(root).length > 0) {
    throw new Error(`refusing to write into non-empty ${root}`);
  }

  const folderId = uuid();
  writeJson(path.join(root, "folders", "synthetic-narrative", "folder.json"), {
    id: folderId,
    slug: "synthetic-narrative",
    name: "Synthetic narrative",
    type: "folder",
    parentId: null,
    orderIndex: 0,
    createdAt: stamp,
    metadataSource: { isMetadataSource: false },
  });
  writeJson(path.join(root, "meta", `folder-${folderId}.meta.json`), {
    resourceSubtype: NARRATIVE,
  });

  const ctx = { pick, uuid, folderId, stamp };
  const written = Array.from({ length: variants }, (_, i) =>
    writeVariant(root, ctx, i, lengths[i % 3]),
  );

  writeJson(path.join(root, "project.json"), {
    id: projectId,
    rootPath: root,
    name: `Folklore long-text fixture (${variants} synthetic variants)`,
    slug: `folklore-long-text-fixture-${variants}`,
    createdAt: stamp,
    projectType: "blank",
    config: {
      maxRevisions: 50,
      autoPrune: true,
      editorConfig: {},
      features: {},
      modules: { folklore: true },
      subtypes: [NARRATIVE, VARIANT],
      metadataSchema: metadataSchema(),
    },
  });
  console.log(
    JSON.stringify({
      projectPath: root,
      projectId,
      narrativeFolderId: folderId,
      synthetic: true,
      variants: written,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
