#!/usr/bin/env node
/**
 * Feature 90 Task 12 (FR-2 a, b): freshness of the project-type read and the
 * module-level cache instance, on the UNCHANGED tree. Web dev server only; HTTP only.
 *
 * Usage: node fr2-saved-types-freshness.mjs <scratch-root> <base-url>
 *   The dev server must have been started with
 *     GETWRITE_PROJECTS_DIR=<scratch-root>/projects
 *     GETWRITE_PROJECT_TYPES_DIR=<scratch-root>/types   (read by lib/projectTypes.ts)
 *     GETWRITE_TEMPLATES_DIR=<scratch-root>/types       (read by app/api/project-types/route.ts)
 *   <scratch-root>/types holds a copy of the built-in type files. The saved-types variable
 *   does not exist in code yet, so the throwaway built-in directory stands in for it.
 *
 * The harness asserts the throwaway paths before its first request and exits otherwise.
 * It reads/writes only under <scratch-root>. Never touches the repo's projects/,
 * ~/Library/Application Support/{getwrite-electron,GetWrite}, ~/Library/Logs/*,
 * ~/Documents/GetWrite. Prints one JSON object of observed values.
 * Run OUTSIDE the command sandbox (it talks to a local dev server).
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync, realpathSync, lstatSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const [scratchArg, base] = process.argv.slice(2);
if (!scratchArg || !base) { console.error("usage: fr2-saved-types-freshness.mjs <scratch-root> <base-url>"); process.exit(2); }

const FORBIDDEN = ["getwrite-electron", "Library/Application Support/GetWrite", "Library/Logs", "Documents/GetWrite", "/Repositories/getwrite/"];
const root = realpathSync(scratchArg);
const projectsRoot = path.join(root, "projects");
const typesDir = path.join(root, "types");
const tmp = realpathSync(os.tmpdir());
const underOk = (p) => (p.startsWith(tmp + path.sep) || p.startsWith("/private/tmp/")) && !FORBIDDEN.some((f) => (p + "/").includes(f));
if (!underOk(root) || !underOk(typesDir) || !underOk(projectsRoot)) { console.error("throwaway path assertion failed"); process.exit(5); }
for (const f of readdirSync(typesDir)) if (lstatSync(path.join(typesDir, f)).isSymbolicLink()) { console.error("symlink in types dir"); process.exit(5); }

const out = { base, root, projectsRoot, typesDir, typesDirInitialFiles: readdirSync(typesDir).sort() };
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
};
{
  const list = await api("GET", "/api/projects");
  const paths = (Array.isArray(list.json) ? list.json : []).map((p) => p?.project?.rootPath);
  out.preexistingProjectRootPaths = paths;
  if (list.status !== 200 || !paths.every((p) => typeof p === "string" && realpathSync(p).startsWith(projectsRoot + path.sep))) {
    console.error("server projects folder is not the throwaway root; stopping"); process.exit(5);
  }
}

const ids = (j) => (Array.isArray(j) ? j.map((s) => s.id).sort() : j);
const getList = async () => { const r = await api("GET", "/api/project-types"); return { status: r.status, ids: ids(r.json), raw: r.json }; };
const blank = JSON.parse(readFileSync(path.join(typesDir, "blank_project_type.json"), "utf8"));
const spec = (id, name, folder) => ({ ...blank, id, name, description: `T12 ${id}`, folders: [{ name: folder }] });
const writeType = (s) => writeFileSync(path.join(typesDir, `${s.id}.json`), JSON.stringify(s, null, 2));
const create = async (name, projectType) => {
  const r = await api("POST", "/api/projects", { name, projectType });
  const rootPath = r.json?.project?.rootPath;
  let dirs = null;
  if (rootPath) {
    const rp = realpathSync(rootPath);
    if (!rp.startsWith(projectsRoot + path.sep)) { console.error("created project outside throwaway root"); process.exit(5); }
    dirs = readdirSync(rp, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const sub = {};
    for (const d of dirs) sub[d] = readdirSync(path.join(rp, d), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    dirs = sub;
  }
  return { status: r.status, error: r.status === 200 || r.status === 201 ? undefined : r.json, topLevelDirs: dirs };
};
const brief = (l) => ({ status: l.status, ids: l.ids });

// S1: route read before the library has been read by any request
out.S1_route_before_any_write = brief(await getList());
// S2 (a): one valid type written by hand while the server runs
writeType(spec("t12-alpha", "T12 Alpha", "AlphaFolder"));
out.S2_route_after_alpha_written = brief(await getList());
out.S2_create_from_alpha = await create("T12 From Alpha 1", "t12-alpha");
// S3 (b): second file written after the library's first read
writeType(spec("t12-beta", "T12 Beta", "BetaFolder"));
out.S3_route_after_beta_written = brief(await getList());
out.S3_create_from_beta = await create("T12 From Beta 1", "t12-beta");
await new Promise((r) => setTimeout(r, 3000));
out.S3b_route_3s_later = brief(await getList());
out.S3b_create_from_beta_3s_later = await create("T12 From Beta 2", "t12-beta");
// S4: existing file changed in place
writeType(spec("t12-alpha", "T12 Alpha", "AlphaFolderEdited"));
const l4 = await getList();
out.S4_route_alpha_folders_after_edit = { status: l4.status, folders: l4.raw.find?.((s) => s.id === "t12-alpha")?.folders };
out.S4_create_from_alpha_after_edit = await create("T12 From Alpha 2", "t12-alpha");
// S5: file deleted
unlinkSync(path.join(typesDir, "t12-beta.json"));
out.S5_route_after_beta_deleted = brief(await getList());
out.S5_create_from_beta_after_delete = await create("T12 From Beta 3", "t12-beta");
// S6: a built-in id still creates (control)
out.S6_create_from_blank = await create("T12 Blank", "blank");

// S7: a file that was read into the library's cache is deleted, then a creation from its id
unlinkSync(path.join(typesDir, "t12-alpha.json"));
out.S7_route_after_alpha_deleted = brief(await getList());
out.S7_create_from_alpha_after_delete = await create("T12 From Alpha 3", "t12-alpha");

for (const f of ["t12-alpha.json", "t12-beta.json"]) { try { unlinkSync(path.join(typesDir, f)); } catch {} }
console.log(JSON.stringify(out, null, 2));
