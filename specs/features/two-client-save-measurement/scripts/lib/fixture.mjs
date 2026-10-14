/**
 * Feature 78 harness: fixed names and fixture creation.
 *
 * A project and a text resource are created through the app's own HTTP API
 * (POST /api/projects, POST /api/resource), not by writing files. The route
 * `POST /api/resource` calls `createResourceCore` ->
 * `writeResourceWithInitialRevision` (read, not run), which writes the
 * resource files and the initial canonical revision `v-1`.
 *
 * These strings are the only document text a record may contain besides the
 * base document.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const BASE_TEXT = "BASE alpha bravo charlie";

/** Typed with a leading space (the long ones carry the word list). */
export const MARKERS = {
  A1: " A1",
  A2: " A2",
  B1: " B1",
  B2: " B2",
  Q: "Q",
};

/** Marker tokens the harness looks for in a document's words. */
export const MARKER_TOKENS = ["A1", "A2", "B1", "B2", "Q", "A2LONG", "B2LONG"];

/** Forty distinct lowercase words, defined once, used by the long additions. */
export const WORD40 = [
  "harbor", "lantern", "meadow", "copper", "willow", "ember", "falcon", "garnet",
  "hollow", "island", "juniper", "kettle", "ledger", "marble", "nectar", "orchid",
  "pebble", "quartz", "ribbon", "saddle", "thistle", "umber", "velvet", "walnut",
  "yarrow", "zephyr", "anchor", "beacon", "cinder", "dagger", "easel", "fathom",
  "gable", "harvest", "ivory", "jasper", "knoll", "lagoon", "mantle", "nimbus",
];

/** The plain text each client's typing leaves, per pairing (P1 to P3 of s2-near-simultaneous.mjs). */
export const PLAIN_OF_PAIRING = {
  P1: { A: `${BASE_TEXT} A1`, B: `${BASE_TEXT} B1` },
  P2: { A: `${BASE_TEXT} A1`, B: `${BASE_TEXT} B2LONG ${WORD40.join(" ")}` },
  P3: { A: `${BASE_TEXT} A2LONG ${WORD40.join(" ")}`, B: `${BASE_TEXT} B1` },
};

/** ` A2LONG harbor lantern ...` (prefix is "A2LONG" or "B2LONG"). */
export function longAddition(prefix) {
  return ` ${prefix} ${WORD40.join(" ")}`;
}

/** id -> label registry; labels replace ids in logged paths. */
export function createLabels() {
  const map = new Map();
  let nextUnknown = 1;
  return {
    add(id, label) {
      if (id) map.set(id, label);
    },
    apply(text) {
      return String(text).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (id) => {
          if (!map.has(id)) map.set(id, `ID${nextUnknown++}`);
          return map.get(id);
        },
      );
    },
    entries() {
      return [...map.entries()].map(([id, label]) => ({ label, idLength: id.length }));
    },
  };
}

async function postJson(server, urlPath, body) {
  const res = await server.windowFetch(urlPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) throw new Error(`POST ${urlPath} -> ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

/** Create a project (project type "blank") through the app's own API. */
export async function createFixtureProject(server, name, labels) {
  const result = await postJson(server, "/api/projects", { name, projectType: "blank" });
  let dirId = result?.project?.id;
  if (!dirId || !existsSync(path.join(server.projectsDir, dirId))) {
    const dirs = readdirSync(server.projectsDir).filter((d) => d !== ".trash");
    const known = dirs.filter((d) =>
      existsSync(path.join(server.projectsDir, d, "project.json")),
    );
    dirId = known.at(-1);
  }
  const projectPath = path.join(server.projectsDir, dirId);
  // The search route (and the client's search transport) address a project by the
  // `id` inside project.json, which is not the directory name (measured in the
  // first dry run: searching with the directory name answered 404).
  const manifest = JSON.parse(readFileSync(path.join(projectPath, "project.json"), "utf8"));
  const manifestId = typeof manifest.id === "string" ? manifest.id : dirId;
  labels?.add(dirId, "PRJ");
  if (manifestId !== dirId) labels?.add(manifestId, "PRJ-MANIFEST-ID");
  return { name, dirId, manifestId, projectPath };
}

/**
 * Create a text resource holding the base document, with its initial canonical
 * revision, through POST /api/resource. Reads back the revision directory to
 * learn the canonical revision id and the base document exactly as stored.
 */
export async function createFixtureResource(server, project, name, labels, resourceLabel = "R1") {
  const created = await postJson(server, "/api/resource", {
    projectId: project.dirId,
    resourceData: { type: "text", name, text: { plainText: BASE_TEXT } },
  });
  const id = created?.resource?.id;
  if (!id) throw new Error("resource creation returned no id");
  const revRoot = path.join(project.projectPath, "revisions", id);
  const dirs = readdirSync(revRoot).filter((d) => d.startsWith("v-"));
  if (dirs.length !== 1) throw new Error(`expected one revision directory, found ${dirs.length}`);
  const meta = JSON.parse(readFileSync(path.join(revRoot, dirs[0], "metadata.json"), "utf8"));
  const baseContent = readFileSync(path.join(revRoot, dirs[0], "content.bin"), "utf8");
  labels?.add(id, resourceLabel);
  labels?.add(meta.id, `REV-${resourceLabel}`);
  return {
    id,
    name,
    label: resourceLabel,
    projectDirId: project.dirId,
    projectManifestId: project.manifestId,
    projectPath: project.projectPath,
    projectName: project.name,
    canonicalRevisionId: meta.id,
    initialRevisionDir: dirs[0],
    baseContent,
  };
}
