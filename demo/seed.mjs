// Seeds a clean, presentable GetWrite project for the LinkedIn demo video.
//
// Drives the running dev server's API (http://localhost:3000) so every write
// goes through the real model layer — valid sidecars, content.txt, tiptap JSON,
// inverted index and backlinks. Run with the dev server up:
//
//   node demo/seed.mjs
//
// Prints the created project's id + rootPath (used by the Playwright walkthrough).

import { randomUUID } from "node:crypto";

const BASE = process.env.GW_BASE ?? "http://localhost:3000";

async function api(path, body, method = "POST") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Tiptap doc builders ──────────────────────────────────────────────────────
const h = (level, text) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const p = (text) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const doc = (...nodes) => ({ type: "doc", content: nodes });

async function createTextResource(projectPath, { name, folderId, orderIndex }) {
  const { resource } = await api("/api/resource", {
    projectPath,
    resourceData: {
      name,
      folderId: folderId ?? null,
      type: "text",
      orderIndex,
      text: { plainText: "", tiptap: undefined },
    },
  });
  return resource;
}

async function setContent(projectPath, resourceId, document) {
  await api(`/api/resource/${resourceId}/content`, { projectPath, doc: document });
}

async function setMeta(projectPath, resource, userMetadata) {
  await api(`/api/resource/${resource.id}/sidecar`, {
    projectRoot: projectPath,
    updatedResource: {
      ...resource,
      userMetadata: { ...(resource.userMetadata ?? {}), ...userMetadata },
    },
  });
}

async function addField(projectPath, field, groupId = "builtin-document") {
  await api("/api/project/metadata-schema", { action: "add-field", projectPath, groupId, field });
}

async function main() {
  console.log("Creating project…");
  const created = await api("/api/projects", {
    name: "The Lighthouse Keeper",
    projectType: "novel",
  });
  const project = created.project;
  const projectPath = project.rootPath;
  console.log("  id:", project.id);
  console.log("  rootPath:", projectPath);

  // ── Custom metadata fields (so "define your own fields, then query them" is
  //    literally true in the demo) ─────────────────────────────────────────────
  console.log("Adding custom metadata fields…");
  await addField(projectPath, {
    key: "arc",
    label: "Arc",
    type: "select",
    options: ["Setup", "Confrontation", "Resolution"],
  });
  await addField(projectPath, { key: "tension", label: "Tension", type: "number" });

  const folderId = (name) => {
    const f = created.folders.find((x) => x.name === name);
    if (!f) throw new Error(`Folder not found: ${name} (have: ${created.folders.map((x) => x.name).join(", ")})`);
    return f.id;
  };

  const workspace = folderId("Workspace");
  const storyElements = folderId("Story Elements");
  const outline = folderId("Outline");
  const notes = folderId("Notes");

  // ── Chapters (Workspace) — prose with [[wikilinks]] for backlinks ──────────
  const ch1 = await createTextResource(projectPath, { name: "Chapter One — The Light", folderId: workspace, orderIndex: 0 });
  await setContent(projectPath, ch1.id, doc(
    h(1, "Chapter One — The Light"),
    p("[[Mara Vance]] climbed the hundred and twelve steps the way she always had — counting, breath even, one hand trailing the cold iron rail. At the top, the [[Lamp Room]] waited, its great lens turning slow as a thought."),
    p("The keeper before her had left a single instruction, pencilled inside the logbook's cover: keep it lit, and keep it true. She had kept it lit. Whether she had kept it true was the question that woke her at three in the morning."),
    p("Below, the town slept under its quilt of fog. Somewhere out past the reef, a bell buoy answered the dark."),
  ));
  await setMeta(projectPath, ch1, { status: "Revised", arc: "Setup", tension: 4, synopsis: "Mara takes the night watch and reckons with the keeper's last instruction.", pov: { id: null, name: "Mara Vance" } });

  const ch2 = await createTextResource(projectPath, { name: "Chapter Two — Salt and Static", folderId: workspace, orderIndex: 1 });
  await setContent(projectPath, ch2.id, doc(
    h(1, "Chapter Two — Salt and Static"),
    p("The radio coughed to life a little after midnight. [[Elias Crane]] again, calling from the mainland station, his voice furred with distance and salt."),
    p("[[Mara Vance]] pressed the handset to her cheek and listened to him pretend this was a routine check. It never was. Three storms in a season have a way of rewriting what counts as routine."),
    p("\"You should come ashore,\" he said. She watched the [[Lamp Room]] sweep its long white arm across the water and did not answer."),
  ));
  await setMeta(projectPath, ch2, { status: "Draft", arc: "Confrontation", tension: 8, synopsis: "Elias urges Mara to abandon the light before the season's third storm.", pov: { id: null, name: "Mara Vance" } });

  const ch3 = await createTextResource(projectPath, { name: "Chapter Three — The Keeper's Log", folderId: workspace, orderIndex: 2 });
  await setContent(projectPath, ch3.id, doc(
    h(1, "Chapter Three — The Keeper's Log"),
    p("Every entry in the keeper's log began with the weather and ended with a lie. [[Mara Vance]] had read them all twice, looking for the seam where the old keeper's hand had started to shake."),
    p("She found it on a page dated the night [[Elias Crane]]'s brother went out and did not come back. After that, the entries grew shorter. The lies grew kinder."),
  ));
  await setMeta(projectPath, ch3, { status: "Draft", arc: "Confrontation", tension: 7, synopsis: "Mara discovers the gap in the old keeper's record.", pov: { id: null, name: "Mara Vance" } });

  // ── Story Elements — characters & a location, cross-linked ─────────────────
  const mara = await createTextResource(projectPath, { name: "Mara Vance", folderId: storyElements, orderIndex: 0 });
  await setContent(projectPath, mara.id, doc(
    h(1, "Mara Vance"),
    h(2, "Role"),
    p("The current keeper of the light. Methodical, unsentimental, and quietly certain that leaving would be a kind of dying."),
    h(2, "Connections"),
    p("Trades night calls with [[Elias Crane]]. Tends the [[Lamp Room]] as though it were a living thing."),
  ));
  await setMeta(projectPath, mara, { status: "Polished", synopsis: "Protagonist. Keeper of the light." });

  const elias = await createTextResource(projectPath, { name: "Elias Crane", folderId: storyElements, orderIndex: 1 });
  await setContent(projectPath, elias.id, doc(
    h(1, "Elias Crane"),
    h(2, "Role"),
    p("Mainland radio operator who has been trying to talk [[Mara Vance]] off the rock for two years. Carries a grief he files under static."),
  ));
  await setMeta(projectPath, elias, { status: "Polished", synopsis: "Mainland operator. Mara's tether to shore." });

  const lamp = await createTextResource(projectPath, { name: "Lamp Room", folderId: storyElements, orderIndex: 2 });
  await setContent(projectPath, lamp.id, doc(
    h(1, "Lamp Room"),
    p("The glass crown of the lighthouse. A first-order Fresnel lens, a brass mechanism that must be wound by hand, and a view of every way the sea can turn on you."),
    p("Both [[Mara Vance]] and the keeper before her measured their lives in its slow revolutions."),
  ));
  await setMeta(projectPath, lamp, { status: "Polished", synopsis: "The light itself — the novel's still center." });

  // ── Outline & Notes ────────────────────────────────────────────────────────
  const outlineDoc = await createTextResource(projectPath, { name: "Three-Act Outline", folderId: outline, orderIndex: 0 });
  await setContent(projectPath, outlineDoc.id, doc(
    h(1, "Three-Act Outline"),
    h(2, "Act I — Keep it lit"),
    p("Establish the light, the season, and the radio. [[Mara Vance]] refuses [[Elias Crane]]'s first real warning."),
    h(2, "Act II — Keep it true"),
    p("The old log cracks open. The lie at the center of the lighthouse surfaces."),
    h(2, "Act III — The third storm"),
    p("Mara chooses what the light is for."),
  ));
  await setMeta(projectPath, outlineDoc, { status: "Outline", arc: "Setup", tension: 3, synopsis: "Working three-act spine." });

  const research = await createTextResource(projectPath, { name: "Research — Coastal Lights", folderId: notes, orderIndex: 0 });
  await setContent(projectPath, research.id, doc(
    h(1, "Research — Coastal Lights"),
    p("Fresnel lenses, fog-signal timing, and the daily rhythm of a manned light. Detail to seed the [[Lamp Room]] without drowning the prose in it."),
  ));
  await setMeta(projectPath, research, { status: "Draft", tension: 2, synopsis: "Reference notes for the setting." });

  // ── Smart folders (saved queries → folder rows) ─────────────────────────────
  console.log("Saving smart folder queries…");
  await api("/api/project/query/saved", {
    action: "write",
    projectPath,
    query: {
      id: randomUUID(),
      name: "Draft Chapters",
      definition: { op: "eq", field: "status", value: "Draft" },
    },
  });
  // A complex, multi-condition query: drafts that are also high-tension.
  await api("/api/project/query/saved", {
    action: "write",
    projectPath,
    query: {
      id: randomUUID(),
      name: "High-Tension Scenes",
      definition: {
        op: "and",
        children: [
          { op: "gte", field: "tension", value: 6 },
          { op: "eq", field: "arc", value: "Confrontation" },
        ],
      },
    },
  });

  // ── Reindex: build inverted index + backlinks from the seeded content ──────
  console.log("Reindexing…");
  await api(`/api/project/${project.id}/reindex`, undefined, "POST");

  console.log("\nDone. Demo project ready:");
  console.log(JSON.stringify({ id: project.id, name: project.name, rootPath: projectPath }, null, 2));
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
