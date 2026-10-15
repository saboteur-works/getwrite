// One-off: builds docs/user/handbook/index.md from the pages' front matter, and checks links.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = "docs/user/handbook";
const parts = [["getting-started","Getting started"],["organize","Organize"],["write","Write"],["story","Story"],["views","Views"],["protect-and-finish","Protect and finish"]];
const fm = (p) => { const m = readFileSync(p,"utf8").match(/^---\n([\s\S]*?)\n---/); const o = {}; for (const l of m[1].split("\n")) { const i = l.indexOf(":"); o[l.slice(0,i)] = l.slice(i+1).trim(); } return o; };
let out = "---\ntitle: GetWrite Handbook\norder: 0\nsummary: Contents of the GetWrite handbook, grouped by part.\n---\n\n# GetWrite Handbook\n";
const linked = [];
for (const [dir, name] of parts) {
  out += `\n## ${name}\n\n`;
  const pages = readdirSync(join(root, dir)).filter(f => f.endsWith(".md")).map(f => ({ f, ...fm(join(root, dir, f)) })).sort((a,b) => a.order - b.order);
  for (const p of pages) { out += `- [${p.title}](${dir}/${p.f}) — ${p.summary}\n`; linked.push(`${dir}/${p.f}`); }
}
writeFileSync(join(root, "index.md"), out);
const all = parts.flatMap(([d]) => readdirSync(join(root, d)).filter(f => f.endsWith(".md")).map(f => `${d}/${f}`));
const links = [...out.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
console.log("pages on disk:", all.length, "links in index:", links.length);
console.log("unlinked pages:", all.filter(p => !links.includes(p)).length ? all.filter(p => !links.includes(p)) : "none");
console.log("missing targets:", links.filter(l => !existsSync(join(root, l))).length ? links.filter(l => !existsSync(join(root, l))) : "none");
const orders = [0, ...all.map(p => Number(fm(join(root, p)).order))];
console.log("orders unique:", new Set(orders).size === orders.length, "index order sequence ascending:", linked.every((p,i,a)=> i===0 || Number(fm(join(root,p)).order) > Number(fm(join(root,a[i-1])).order)));
