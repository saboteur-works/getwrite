// Shared helpers for the Task 7 runs (web build, Playwright; CLI). Builds on task6-lib.mjs.
export * from "./task6-lib.mjs";
import { bodyText, say, J, pm, treeClick, step } from "./task6-lib.mjs";
import { runCli } from "./cli.mjs";
import { assertThrowaway } from "./lib/safety.mjs";
import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
export { runCli };
export const tick = (page, ms = 1200) => page.waitForTimeout(ms);
/** Run the built CLI against a throwaway path; every absolute path argument is asserted under /tmp/getwrite-handbook/ first. */
export function cli(args, cwd) {
  for (const a of args) if (a.startsWith("/")) assertThrowaway(a);
  const r = runCli(args, { cwd });
  say(`$ getwrite-cli ${args.map((a) => (a.startsWith("/tmp/") ? "<throwaway>/" + path.basename(a) : a)).join(" ")}  -> exit ${r.status}`);
  const out = (r.stdout + r.stderr).split("\n").filter(Boolean).map((l) => l.replaceAll(/\/tmp\/getwrite-handbook\/[^\s]*/g, "<throwaway>"));
  for (const l of out.slice(0, 24)) say(`  | ${l}`);
  return r;
}
export async function expandRevisions(page) {
  const b = page.locator("button[aria-controls=revision-control-content]");
  if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
  await page.waitForTimeout(1200);
}
export const revText = (page) => page.evaluate(() => { const e = document.getElementById("revision-control-content"); return e ? e.innerText : "(not expanded)"; });
/** Cards as { name, sub, badges, buttons } */
export const revCards = (page) => page.evaluate(() => [...document.querySelectorAll("article.revision-control-card")].map((a) => ({ name: a.querySelector("h4")?.innerText, sub: a.querySelector("p")?.innerText.replace(/•.*/, "•…"), badges: [...a.querySelectorAll(".revision-control-badge,.revision-control-protected-badge")].map((x) => x.innerText.trim()), buttons: [...a.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || "") + "/" + b.innerText.trim() + (b.disabled ? "(disabled)" : "")) })));
export async function typeAndSave(page, title, text, ms = 6000) {
  await treeClick(page, title);
  await pm(page).click();
  await page.keyboard.insertText(text);
  await page.waitForTimeout(ms);
}
export const walkFiles = (d, o = []) => { if (!existsSync(d)) return o; for (const e of readdirSync(d)) { const p = path.join(d, e); statSync(p).isDirectory() ? walkFiles(p, o) : o.push(p); } return o; };
export const rel = (base, p) => path.relative(base, p);
export { bodyText, say, J, pm, treeClick, step };
