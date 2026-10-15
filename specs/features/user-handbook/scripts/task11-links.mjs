// Task 11: resolves every markdown link in README.md and the five developer docs.
import fs from "node:fs";
import path from "node:path";
const files = ["README.md","docs/features/project-types.md","docs/features/revisions.md","docs/features/editor/headings.md","docs/features/editor/settings.md","docs/features/data/metadata.md"];
const slug = (t) => t.trim().toLowerCase().replace(/[`*_]/g,"").replace(/[^\p{L}\p{N}\s-]/gu,"").replace(/\s/g,"-");
const anchors = (f) => new Set(fs.readFileSync(f,"utf8").split("\n").filter(l=>/^#{1,6}\s/.test(l)).map(l=>slug(l.replace(/^#+\s+/,""))));
let bad = 0, n = 0;
for (const f of files) {
  const text = fs.readFileSync(f,"utf8");
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1]; if (/^(https?:|mailto:)/.test(t)) continue;
    const [p, a] = t.split("#"); const target = p ? path.join(path.dirname(f), p) : f;
    n++; let ok = fs.existsSync(target);
    if (ok && a) ok = anchors(target).has(a);
    console.log(`${ok?"OK  ":"FAIL"} ${f} -> ${t}`); if (!ok) bad++;
  }
}
console.log(`${n} links, ${bad} failing`); process.exit(bad?1:0);
