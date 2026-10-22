// Feature 91 Task 4 harness: FR-17 "before" control heights (Project Settings Editor tab, Project Type Manager).
// Usage (repo root, outside the command sandbox): node <this file>
// Starts `next start` (frontend/, existing build) on PORT (default 3100) with a throwaway
// GETWRITE_PROJECTS_DIR, asserts that folder (and the live server env) before the first request,
// seeds one project through the app's API, measures getBoundingClientRect().height in Chromium at
// default zoom and root font size, prints one JSON result. Stops only the pids it started.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(new URL("../../../..", import.meta.url).pathname);
const frontend = path.join(repo, "frontend");
const require = createRequire(path.join(frontend, "package.json"));
const { chromium } = require("@playwright/test");

const PORT = Number(process.env.PORT ?? 3100);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1400, height: 900 };

const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr17-projects-"));
const realProjectsDir = fs.realpathSync(projectsDir);
const log = (...a) => console.error("[fr17]", ...a);

function assertThrowaway(dir) {
  const real = fs.realpathSync(dir);
  const bad = [path.join(repo, "projects"), path.join(os.homedir(), "Library"), path.join(os.homedir(), "Documents")];
  if (bad.some((b) => real === b || real.startsWith(b + path.sep))) throw new Error(`protected folder: ${real}`);
  if (fs.readdirSync(real).length !== 0) throw new Error(`throwaway folder not empty: ${real}`);
  return real;
}
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8" }); } catch { return ""; } };

const out = { date: new Date().toString(), projectsDir: realProjectsDir };
let server;
try {
  assertThrowaway(projectsDir);
  server = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: frontend,
    env: { ...process.env, GETWRITE_PROJECTS_DIR: realProjectsDir, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  out.serverPid = server.pid;
  let earlyEnv = null;
  for (let i = 0; i < 150 && !earlyEnv; i++) {
    earlyEnv = sh("ps", ["-Eww", "-p", String(server.pid)]).match(/GETWRITE_PROJECTS_DIR=(\S+)/)?.[1] ?? null;
    if (!earlyEnv) await new Promise((r) => setTimeout(r, 20));
  }
  const kids = () => sh("pgrep", ["-P", String(server.pid)]).split("\n").filter(Boolean).map(Number);
  let listener = null;
  for (let i = 0; i < 120 && !listener; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const pids = (sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-Fp"]).match(/p(\d+)/g) ?? []).map((x) => Number(x.slice(1)));
    const tree = [server.pid, ...kids()];
    listener = pids.find((p) => tree.includes(p)) ?? null;
  }
  if (!listener) throw new Error("no listener from our process tree");
  out.processTree = [server.pid, ...kids()];
  out.listenerPid = listener;
  if (!earlyEnv || fs.realpathSync(earlyEnv) !== realProjectsDir) throw new Error("server env GETWRITE_PROJECTS_DIR mismatch: " + earlyEnv);
  out.assertedServerEnvProjectsDir = earlyEnv;
  out.lsofListenBefore = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);

  const post = async (p, body) => {
    const r = await fetch(ORIGIN + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const proj = await post("/api/projects", { name: "FR17 sample", projectType: "blank" });
  const id = path.basename(proj.project.rootPath);
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Sample paragraph." }] }] };
  await post("/api/resource", { projectId: id, resourceData: { name: "Sample", type: "text", text: { plainText: "Sample paragraph.", tiptap: doc } } });
  out.projectsDirListing = fs.readdirSync(realProjectsDir);

  const browser = await chromium.launch();
  out.chromium = browser.version();
  out.viewport = VIEWPORT;
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const env = () => page.evaluate(() => ({ rootFontSize: getComputedStyle(document.documentElement).fontSize, devicePixelRatio: window.devicePixelRatio, innerWidth: window.innerWidth, innerHeight: window.innerHeight }));
  const h = (el) => Number(el.getBoundingClientRect().height.toFixed(2));
  const describe = (el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), id: el.id || null, ariaLabel: el.getAttribute("aria-label"), className: String(el.className).slice(0, 120), height: h(el) });

  // --- Project Settings, Editor tab ---
  await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open FR17 sample", exact: true }).click({ timeout: 15000 });
  await page.getByText("Sample", { exact: true }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "Open project settings menu" }).click({ timeout: 15000 });
  await page.getByRole("menuitem", { name: "Project Settings" }).click({ timeout: 15000 });
  await page.getByRole("tab", { name: "Editor" }).waitFor({ timeout: 15000 });
  await page.locator("#h1-fontSize").waitFor({ timeout: 15000 });
  await page.locator("#body-fontFamily").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  out.settingsEnv = await env();
  out.settingsActiveTab = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent);
  out.settingsHeadingH1 = await page.evaluate(([hf, describeSrc]) => {
    const describe = eval(describeSrc);
    const q = (s) => document.querySelector(s);
    const colourWrap = q("#h1-color").parentElement;
    return {
      "Font family": [describe(q("#h1-fontFamily"))],
      "Font size": [describe(q("#h1-fontSize"))],
      "Font weight": [describe(q("#h1-fontWeight"))],
      "Colour": [{ ...describe(colourWrap), note: "visible bordered wrapper of the colour field" }, describe(q('button[aria-label="Choose H1 color"]')), { ...describe(q("#h1-color")), note: "class hidden", display: getComputedStyle(q("#h1-color")).display }],
      "Letter spacing": [describe(q("#h1-letterSpacing"))],
    };
  }, [null, `(el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), id: el.id || null, ariaLabel: el.getAttribute("aria-label"), className: String(el.className).slice(0, 120), height: Number(el.getBoundingClientRect().height.toFixed(2)) })`]);
  out.settingsBody = await page.evaluate((describeSrc) => {
    const describe = eval(describeSrc);
    const q = (s) => document.querySelector(s);
    return {
      "Font family": [describe(q("#body-fontFamily"))],
      "Font size": [describe(q("#body-fontSize"))],
      "Line height": [describe(q("#body-lineHeight"))],
      "Paragraph spacing": [describe(q("#body-paragraphSpacing"))],
    };
  }, `(el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), id: el.id || null, ariaLabel: el.getAttribute("aria-label"), className: String(el.className).slice(0, 120), height: Number(el.getBoundingClientRect().height.toFixed(2)) })`);

  // --- Project Type Manager ---
  await page.goto(ORIGIN + "/project-types", { waitUntil: "networkidle" });
  await page.locator(".project-type-editor-form-grid--headings-row").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  out.managerEnv = await env();
  out.managerSelected = await page.evaluate(() => document.querySelector(".project-type-list-pane-item--selected .project-type-list-pane-item-title")?.textContent ?? null);
  out.managerRows = await page.evaluate((src) => {
    const describe = eval(src);
    const row = (grid) => [...grid.children].map((lab) => {
      const name = lab.querySelector(".project-type-editor-field-label")?.textContent ?? null;
      const controls = [...lab.querySelectorAll("input, select, .project-type-editor-color-row")].map(describe);
      return { field: name, labelHeight: describe(lab).height, controls };
    });
    const grids = [...document.querySelectorAll(".project-type-editor-form-grid--headings-row")];
    const card = grids[0].closest(".project-type-editor-card");
    return {
      headingRowLevel: card?.querySelector(".project-type-editor-subsection-title")?.textContent ?? null,
      headingRowCount: grids.length,
      headingRow: row(grids[0]),
      body: row(document.querySelector(".project-type-editor-form-grid--four-column")),
    };
  }, `(el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), className: String(el.className).slice(0, 120), height: Number(el.getBoundingClientRect().height.toFixed(2)) })`);
  await browser.close();
} catch (e) {
  out.error = String((e && e.stack) || e);
} finally {
  if (server && server.pid) {
    const pids = out.processTree ?? [server.pid];
    for (const p of [...pids].reverse()) { try { process.kill(p, "SIGTERM"); } catch {} }
    await new Promise((r) => setTimeout(r, 1500));
    out.stoppedPids = Object.fromEntries(pids.map((p) => { let alive = true; try { process.kill(p, 0); } catch { alive = false; } return [p, alive ? "STILL ALIVE" : "exited"]; }));
    out.lsofListenAfter = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);
  }
  fs.writeFileSync(path.join(os.tmpdir(), "fr17-result.json"), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
