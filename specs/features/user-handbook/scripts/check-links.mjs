// Task 14 (Feature 81): one-off link and structure check. Not a committed CI check.
// Usage: node check-links.mjs [rootDir]   (rootDir defaults to the repo root; a scratch copy must live under /tmp/getwrite-handbook/<run-id>/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, "../../../..");
const root = fs.realpathSync(path.resolve(process.argv[2] ?? defaultRoot));
if (process.argv[2]) {
  const prefix = (process.env.GW_SCRATCH_PREFIX ? fs.realpathSync(process.env.GW_SCRATCH_PREFIX) : fs.realpathSync("/tmp") + "/getwrite-handbook") + "/";
  if (!(root + "/").startsWith(prefix)) {
    console.error(`refusing: ${root} is not under ${prefix}`);
    process.exit(2);
  }
}

const handbookDir = path.join(root, "docs/user/handbook");
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
const handbook = walk(handbookDir).sort();
const pages = handbook.filter((f) => f !== path.join(handbookDir, "index.md"));
const stubs = walk(path.join(root, "docs/user")).filter((f) => !f.startsWith(handbookDir + "/")).sort();
const devDocs = [
  "docs/features/project-types.md",
  "docs/features/revisions.md",
  "docs/features/editor/headings.md",
  "docs/features/editor/settings.md",
  "docs/features/data/metadata.md",
].map((f) => path.join(root, f));
const readme = path.join(root, "README.md");
const checked = [...handbook, ...stubs, readme, ...devDocs];
const rel = (f) => path.relative(root, f);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`FAIL ${msg}`);
};

const stripFences = (text) => {
  let inFence = false;
  return text.split("\n").map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return ""; }
    return inFence ? "" : l;
  });
};

const slug = (t) =>
  t.trim().toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

const anchorCache = new Map();
const anchorsOf = (f) => {
  if (anchorCache.has(f)) return anchorCache.get(f);
  const seen = new Map();
  const set = new Set();
  for (const l of stripFences(fs.readFileSync(f, "utf8"))) {
    const m = l.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const s = slug(m[1]);
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    set.add(n === 0 ? s : `${s}-${n}`);
  }
  anchorCache.set(f, set);
  return set;
};

const linksOf = (f) => {
  const out = [];
  for (const l of stripFences(fs.readFileSync(f, "utf8"))) {
    for (const m of l.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) out.push(m[1]);
  }
  return out;
};

// (a) every relative link and anchor resolves; (b) handbook pages stay inside the handbook
let linkCount = 0;
const indexTargets = new Set();
for (const f of checked) {
  for (const t of linksOf(f)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) continue;
    linkCount++;
    const [p, a] = t.split("#");
    const target = p ? path.resolve(path.dirname(f), decodeURI(p)) : f;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { fail(`${rel(f)} -> ${t} (target missing)`); continue; }
    if (a && !(target.endsWith(".md") && anchorsOf(target).has(decodeURI(a)))) fail(`${rel(f)} -> ${t} (anchor not found)`);
    if (handbook.includes(f) && !target.startsWith(handbookDir + "/")) fail(`${rel(f)} -> ${t} (handbook page links outside docs/user/handbook/)`);
    if (f === path.join(handbookDir, "index.md")) indexTargets.add(target);
  }
}

// every page linked from index.md
for (const p of pages) if (!indexTargets.has(p)) fail(`${rel(p)} is not linked from index.md`);

// last line, front matter
const orders = new Map();
for (const f of handbook) {
  const text = fs.readFileSync(f, "utf8");
  if (f !== path.join(handbookDir, "index.md")) {
    const last = text.split("\n").filter((l) => l.trim() !== "").pop() ?? "";
    if (!last.startsWith("Verified against GetWrite")) fail(`${rel(f)} does not end with a "Verified against GetWrite" line`);
  }
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) { fail(`${rel(f)} has no front matter`); continue; }
  const keys = m[1].split("\n").map((l) => l.slice(0, l.indexOf(":")));
  if (keys.join(",") !== "title,order,summary") fail(`${rel(f)} front matter keys are "${keys.join(",")}"`);
  const fm = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
  if (!fm.title || !fm.summary) fail(`${rel(f)} has an empty title or summary`);
  if (!/^\d+$/.test(fm.order ?? "")) { fail(`${rel(f)} order "${fm.order}" is not an integer`); continue; }
  const o = Number(fm.order);
  if (orders.has(o)) fail(`${rel(f)} order ${o} duplicates ${rel(orders.get(o))}`);
  orders.set(o, f);
  if (f === path.join(handbookDir, "index.md") && o !== 0) fail(`index.md order is ${o}, not 0`);
}

// stubs
for (const f of stubs) {
  const text = fs.readFileSync(f, "utf8");
  const n = text.replace(/\n$/, "").split("\n").length;
  if (n > 5) fail(`${rel(f)} has ${n} lines (max 5)`);
  if (text.startsWith("---")) fail(`${rel(f)} has front matter`);
}

console.log(`files checked: ${checked.length} (${handbook.length} handbook, ${stubs.length} stubs, README, ${devDocs.length} developer docs)`);
console.log(`relative links and anchors resolved: ${linkCount}`);
console.log(`pages linked from index.md: ${pages.filter((p) => indexTargets.has(p)).length} of ${pages.length}`);
console.log(`unresolved or failing assertions: ${failures}`);
process.exit(failures ? 1 : 0);
