// Feature 91 Task 3 harness: FR-1 font loading behaviour on main.
// Usage (repo root, outside the command sandbox): node <this file>
// Starts `next start` (frontend/, existing build) on PORT (default 3100) with a throwaway
// GETWRITE_PROJECTS_DIR, asserts that folder before the first request, seeds projects through the
// app's own API, drives Chromium (Playwright + CDP) and prints one JSON result to stdout.
// Stops only the server pid it started.
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
const GOOGLE = /(^|\.)fonts\.(googleapis|gstatic)\.com$/;

const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr1-projects-"));
const realProjectsDir = fs.realpathSync(projectsDir);
const log = (...a) => console.error("[fr1]", ...a);

function assertThrowaway(dir) {
  const real = fs.realpathSync(dir);
  const repoProjects = path.join(repo, "projects");
  const bad = [repoProjects, path.join(os.homedir(), "Library"), path.join(os.homedir(), "Documents")];
  if (bad.some((b) => real === b || real.startsWith(b + path.sep))) throw new Error(`protected folder: ${real}`);
  if (fs.readdirSync(real).length !== 0) throw new Error(`throwaway folder not empty: ${real}`);
  return real;
}

const out = { date: new Date().toString(), projectsDir: realProjectsDir, scenarios: {} };
let server;
try {
  assertThrowaway(projectsDir);
  server = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: frontend,
    env: { ...process.env, GETWRITE_PROJECTS_DIR: realProjectsDir, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  out.serverPid = server.pid;
  // The server later retitles itself (ps then shows no env), so read the live process env now,
  // before it listens and before any request is made.
  let earlyEnv = null;
  for (let i = 0; i < 150 && !earlyEnv; i++) {
    try { earlyEnv = execFileSync("ps", ["-Eww", "-p", String(server.pid)], { encoding: "utf8" }).match(/GETWRITE_PROJECTS_DIR=(\S+)/)?.[1] ?? null; } catch {}
    if (!earlyEnv) await new Promise((r) => setTimeout(r, 20));
  }
  log("server pid", server.pid);
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  // Wait for a pid of our own process tree to listen on PORT (no HTTP request yet), then assert
  // the env of that live process BEFORE the first request.
  const kids = () => { try { return execFileSync("pgrep", ["-P", String(server.pid)], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number); } catch { return []; } };
  const sh = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8" }); } catch { return ""; } };
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
  const m = earlyEnv ? [null, earlyEnv] : null;
  if (!m || fs.realpathSync(m[1]) !== realProjectsDir) throw new Error("server env GETWRITE_PROJECTS_DIR mismatch: " + (m && m[1]));
  out.assertedServerEnvProjectsDir = m[1];
  out.lsofListenBefore = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);
  log("asserted", m[1], "listener", listener);
  const post = async (p, body) => {
    const r = await fetch(ORIGIN + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Sample Heading One" }] },
      { type: "paragraph", content: [{ type: "text", text: "Sample paragraph text for font measurement." }] },
    ],
  };
  async function seed(name, editorConfig) {
    const proj = await post("/api/projects", { name, projectType: "blank" });
    const id = path.basename(proj.project.rootPath);
    await post("/api/resource", { projectId: id, resourceData: { name: "Sample", type: "text", text: { plainText: "Sample paragraph text for font measurement.", tiptap: doc } } });
    if (editorConfig) await post("/api/project/editor-config", { projectId: id, ...editorConfig });
    return { name, id };
  }
  const S = {
    A: await seed("FR1 default", null),
    C: await seed("FR1 plex", { body: { fontFamily: "IBM Plex Serif" } }),
    D: await seed("FR1 merri", { body: { fontFamily: "Merriweather" } }),
    E: await seed("FR1 source", { headings: { h1: { fontFamily: "Source Serif 4", fontSize: "40px", fontWeight: "700" } }, body: { fontFamily: "Source Serif 4" } }),
  };
  out.seeded = S;
  out.projectsDirListing = fs.readdirSync(realProjectsDir);

  const browser = await chromium.launch();
  out.chromium = browser.version();

  async function openResource(page, sc) {
    await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: `Open ${sc.name}`, exact: true }).click({ timeout: 15000 });
    try {
      await page.getByText("Sample", { exact: true }).first().click({ timeout: 15000 });
    } catch (e) {
      out.debugBodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 1500);
      await page.screenshot({ path: path.join(os.tmpdir(), "fr1-debug.png") });
      throw e;
    }
    await page.locator(".ProseMirror").first().waitFor({ timeout: 20000 });
    await page.locator(".ProseMirror p").first().waitFor();
    await page.waitForLoadState("networkidle");
  }
  async function newCtx() {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const reqs = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (GOOGLE.test(u.hostname)) reqs.push({ t: "request", url: r.url(), resourceType: r.resourceType() }); });
    page.on("requestfinished", async (r) => { const u = new URL(r.url()); if (GOOGLE.test(u.hostname)) { const resp = await r.response(); reqs.push({ t: "finished", url: r.url(), status: resp?.status() }); } });
    page.on("requestfailed", (r) => { const u = new URL(r.url()); if (GOOGLE.test(u.hostname)) reqs.push({ t: "failed", url: r.url(), failure: r.failure()?.errorText }); });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    return { ctx, page, cdp, reqs };
  }
  async function measure(page, cdp, selector) {
    const info = await page.evaluate(async (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { computedFontFamily: cs.fontFamily, computedFontWeight: cs.fontWeight, styleAttr: el.getAttribute("style"), bodyVar: cs.getPropertyValue("--gw-body-font-family") || null, bodyVarOwnerStyleAttr: el.closest('[style*="--gw-body-font-family"]')?.getAttribute("style") ?? null, outerHTML: el.outerHTML.slice(0, 300) };
    }, selector);
    if (!info) return null;
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    return { ...info, platformFonts: fonts.map((f) => ({ family: f.familyName, postScriptName: f.postScriptName, isCustomFont: f.isCustomFont, glyphCount: f.glyphCount })) };
  }
  async function checks(page, names) {
    return page.evaluate((ns) => Object.fromEntries(ns.map((n) => [n, document.fonts.check(`16px "${n}"`)])), names);
  }
  async function loadedFaces(page) {
    return page.evaluate(() => [...document.fonts].map((f) => `${f.family}|${f.weight}|${f.status}`));
  }

  // Scenario A: default project, first load + each toolbar font in turn.
  {
    const { ctx, page, cdp, reqs } = await newCtx();
    await openResource(page, S.A);
    const A = { firstLoadGoogleEvents: [...reqs], pFirst: await measure(page, cdp, ".ProseMirror p"), h1First: await measure(page, cdp, ".ProseMirror h1") };
    // Locate the toolbar font-family select.
    const sel = await page.evaluate(() => [...document.querySelectorAll("select")].map((s, i) => ({ i, aria: s.getAttribute("aria-label"), title: s.getAttribute("title"), value: s.value, options: [...s.options].map((o) => o.textContent) })));
    A.selectsOnPage = sel;
    const fontSel = sel.find((s) => s.options.includes("Playfair Display"));
    A.toolbarOptions = fontSel?.options ?? null;
    A.perFont = [];
    if (fontSel) {
      await page.locator(".ProseMirror p").first().click({ clickCount: 3 });
      for (const opt of fontSel.options) {
        const before = reqs.length;
        await page.locator("select").nth(fontSel.i).selectOption({ label: opt });
        await page.waitForTimeout(2500);
        await page.waitForLoadState("networkidle");
        const span = await measure(page, cdp, ".ProseMirror p span[style*='font-family']");
        const pm = await measure(page, cdp, ".ProseMirror p");
        A.perFont.push({ option: opt, newGoogleEvents: reqs.slice(before), spanMeasure: span, pMeasure: pm });
      }
    }
    A.allGoogleEvents = [...reqs];
    A.loadedFacesEnd = await loadedFaces(page);
    out.scenarios.A = A;
    await ctx.close();
  }
  // Scenarios C, D, E: fresh context each, toolbar never used.
  for (const [key, sc, sels, names] of [
    ["C", S.C, [".ProseMirror p", ".ProseMirror h1"], ["IBM Plex Serif"]],
    ["D", S.D, [".ProseMirror p", ".ProseMirror h1"], ["Merriweather"]],
    ["E", S.E, [".ProseMirror p", ".ProseMirror h1"], ["Source Serif 4", "IBM Plex Serif"]],
  ]) {
    const { ctx, page, cdp, reqs } = await newCtx();
    await openResource(page, sc);
    await page.waitForTimeout(1500);
    const r = { googleEvents: [...reqs], fontsCheck: await checks(page, names), loadedFaces: await loadedFaces(page) };
    for (const s of sels) r[s] = await measure(page, cdp, s);
    out.scenarios[key] = r;
    await ctx.close();
  }
  await browser.close();
  out.serverLogTail = serverLog.split("\n").slice(-15);
} catch (e) {
  out.error = String(e && e.stack || e);
} finally {
  if (server && server.pid) {
    const pids = out.processTree ?? [server.pid];
    for (const p of [...pids].reverse()) { try { process.kill(p, "SIGTERM"); } catch {} }
    await new Promise((r) => setTimeout(r, 1500));
    out.stoppedPids = Object.fromEntries(pids.map((p) => { let alive = true; try { process.kill(p, 0); } catch { alive = false; } return [p, alive ? "STILL ALIVE" : "exited"]; }));
  }
  fs.writeFileSync(path.join(os.tmpdir(), "fr1-result.json"), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
