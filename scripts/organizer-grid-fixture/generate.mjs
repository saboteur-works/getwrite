#!/usr/bin/env node
/**
 * Writes a GENERATED GetWrite project of N text resources for the Feature 109
 * (Organizer grid) card-count measurements. All names, text and field values
 * are synthetic; nothing is read from or written to the repo's `projects/`.
 *
 * Usage: node scripts/organizer-grid-fixture/generate.mjs --count <N> --out <dir> [--seed <int>]
 * The project lands in `<dir>/<projectId>/` (the directory name is the
 * project's UUID, as the project loader expects). The project id is derived
 * from the seed and the count, so projects of different sizes can share one
 * projects directory; the same seed and count always give the same id.
 * `project.json` carries `rootPath` (the absolute project directory), as a
 * project created in the app does, so the Start page can open it.
 * Prints one JSON line.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const STATUSES = ["Idea", "Draft", "Revising", "Final"];
const SUBTYPES = ["Scene", "Character", "Location", "Research"];
const GENRES = ["Fantasy", "Mystery", "Romance", "Science fiction", "Horror"];
const THEMES = ["Loss", "Betrayal", "Home", "Ambition", "Memory", "Justice"];
const WORDS = (
  "river lantern harbor ember quiet winter orchard signal thread marble " +
  "window ledger copper meadow shadow compass velvet anchor whisper granite"
).split(" ");

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
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(rand() * 4)]}${hex(3)}-${hex(12)}`;
}

function parseCount(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100000) {
    throw new Error(
      `--count must be an integer from 1 to 100000, got "${raw}"`,
    );
  }
  return n;
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

function main() {
  const { values } = parseArgs({
    options: {
      count: { type: "string" },
      out: { type: "string" },
      seed: { type: "string", default: "109" },
    },
  });
  if (!values.count || !values.out) {
    throw new Error(
      "usage: generate.mjs --count <N> --out <dir> [--seed <int>]",
    );
  }
  const count = parseCount(values.count);
  const rand = mulberry32(Number(values.seed));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const hex = (n) =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join(
      "",
    );
  const uuid = () => uuidFrom(rand);
  const stamp = "2026-01-01T00:00:00.000Z";

  // The first draw of the main stream is still taken (and unused), so every
  // other id and value is what it was before the project id depended on the
  // count; the project id comes from its own stream keyed by seed and count.
  uuid();
  const projectId = uuidFrom(
    mulberry32((Math.imul(Number(values.seed), 100003) + count) >>> 0),
  );
  const root = path.resolve(values.out, projectId);
  if (existsSync(root) && readdirSync(root).length > 0) {
    throw new Error(`refusing to write into non-empty ${root}`);
  }

  // Folders: about one per 25 resources (at least 4), nested up to depth 3.
  const folderTotal = Math.max(4, Math.ceil(count / 25));
  const topTotal = Math.max(2, Math.round(folderTotal / 4));
  const folders = [];
  for (let i = 0; i < folderTotal; i++) {
    const parent =
      i < topTotal ? null : pick(folders.filter((f) => f.depth < 3));
    const slug = `folder-${i + 1}`;
    folders.push({
      id: uuid(),
      slug,
      name: `Generated folder ${i + 1}`,
      parentId: parent ? parent.id : null,
      depth: parent ? parent.depth + 1 : 1,
      relPath: parent ? path.join(parent.relPath, slug) : slug,
    });
  }
  const orderCounters = new Map();
  const nextOrder = (key) => {
    const n = orderCounters.get(key) ?? 0;
    orderCounters.set(key, n + 1);
    return n;
  };
  for (const f of folders) {
    writeJson(path.join(root, "folders", f.relPath, "folder.json"), {
      id: f.id,
      slug: f.slug,
      name: f.name,
      type: "folder",
      parentId: f.parentId,
      orderIndex: nextOrder(f.parentId ?? "root"),
      createdAt: stamp,
      metadataSource: { isMetadataSource: false },
    });
    // Folder sidecar with a subtype and field values (folder-sidecar read cost).
    writeJson(path.join(root, "meta", `folder-${f.id}.meta.json`), {
      resourceSubtype: pick(SUBTYPES),
      userMetadata: {
        genre: pick(GENRES),
        notes: `Generated note for ${f.slug}.`,
      },
    });
  }

  const tally = { status: 0, subtype: 0, genre: 0, themes: 0 };
  for (let i = 0; i < count; i++) {
    const id = uuid();
    const folder = rand() < 0.05 ? null : pick(folders);
    const text = Array.from({ length: 20 + Math.floor(rand() * 60) }, () =>
      pick(WORDS),
    ).join(" ");
    const themes = [pick(THEMES), pick(THEMES)].filter(
      (t, j, a) => a.indexOf(t) === j,
    );
    const userMetadata = { genre: pick(GENRES), themes };
    tally.genre++;
    tally.themes++;
    // About a tenth of the cards have no status and a tenth no subtype.
    if (rand() >= 0.1) {
      userMetadata.status = pick(STATUSES);
      tally.status++;
    }
    const sidecar = {
      id,
      name: `Generated card ${i + 1}`,
      type: "text",
      createdAt: stamp,
      slug: `generated-card-${i + 1}`,
      folderId: folder ? folder.id : null,
      orderIndex: nextOrder(folder ? folder.id : "root"),
      userMetadata,
      wordCount: text.split(" ").length,
    };
    if (rand() >= 0.1) {
      sidecar.resourceSubtype = pick(SUBTYPES);
      tally.subtype++;
    }
    writeJson(path.join(root, "meta", `resource-${id}.meta.json`), sidecar);
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
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
  }

  writeJson(path.join(root, "project.json"), {
    id: projectId,
    rootPath: root,
    name: `Organizer grid fixture (${count} generated cards)`,
    slug: `organizer-grid-fixture-${count}`,
    createdAt: stamp,
    projectType: "blank",
    config: {
      maxRevisions: 50,
      autoPrune: true,
      editorConfig: {},
      features: {},
      statuses: STATUSES,
      subtypes: SUBTYPES,
      metadataSchema: {
        groups: [
          {
            id: "builtin-document",
            label: "Document",
            fields: [
              { key: "status", label: "Status", type: "select", locked: true },
            ],
          },
          {
            id: "generated-fixture",
            label: "Fixture fields",
            fields: [
              {
                key: "genre",
                label: "Genre",
                type: "select",
                options: GENRES,
                appliesToFolders: true,
              },
              {
                key: "themes",
                label: "Themes",
                type: "multiselect",
                options: THEMES,
              },
            ],
          },
        ],
      },
    },
  });
  console.log(
    JSON.stringify({
      projectPath: root,
      projectId,
      count,
      folders: folders.length,
      ...tally,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
