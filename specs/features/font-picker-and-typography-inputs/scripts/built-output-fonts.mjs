// Feature 91 Task 25 harness: built standalone web server, every non-origin host blocked.
// Usage (repo root, outside the command sandbox, after `pnpm build` in frontend/):
//   node specs/features/font-picker-and-typography-inputs/scripts/built-output-fonts.mjs
// Copies frontend/.next/standalone (without projects/ and storybook-static) plus .next/static into a
// throwaway runtime folder (the standalone output has no .next/static of its own), starts
// `node frontend/server.js` there on a free port with a throwaway GETWRITE_PROJECTS_DIR, asserts the
// resolved folder before the first request, seeds one project (body "Merriweather", h1 "Playfair
// Display") through the app's own API, and drives Chromium with every non-origin request aborted.
// Prints one JSON result. Stops only the pid it started.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(new URL("../../../..", import.meta.url).pathname);
const frontend = path.join(repo, "frontend");
const require = createRequire(path.join(frontend, "package.json"));
const { chromium } = require("@playwright/test");

const FAMILIES = [
  "Inter", "Merriweather", "Playfair Display", "Lato", "Source Serif 4", "Playwrite IE",
  "Fascinate Inline", "IBM Plex Sans", "IBM Plex Sans Condensed", "IBM Plex Mono", "IBM Plex Serif",
];
const GOOGLE = /(^|\.)fonts\.(googleapis|gstatic)\.com$/;
const out = { date: new Date().toString(), families: {} };
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8" }); } catch { return ""; } };

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

const PORT = await freePort();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const projectsDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "t25-projects-")));
const runtimeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "t25-runtime-")));
out.port = PORT; out.projectsDir = projectsDir; out.runtimeDir = runtimeDir;
let server;
try {
  const bad = [path.join(repo, "projects"), path.join(os.homedir(), "Library"), path.join(os.homedir(), "Documents")];
  if (bad.some((b) => projectsDir === b || projectsDir.startsWith(b + path.sep))) throw new Error("protected folder " + projectsDir);
  if (fs.readdirSync(projectsDir).length !== 0) throw new Error("projects dir not empty");
  const src = path.join(frontend, ".next", "standalone");
  execFileSync("rsync", ["-a", "--exclude=/projects", "--exclude=storybook-static", src + "/", runtimeDir + "/"]);
  fs.mkdirSync(path.join(runtimeDir, "frontend", ".next"), { recursive: true });
  execFileSync("rsync", ["-a", path.join(frontend, ".next", "static") + "/", path.join(runtimeDir, "frontend", ".next", "static") + "/"]);
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(runtimeDir, "frontend"),
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", GETWRITE_PROJECTS_DIR: projectsDir, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  out.serverPid = server.pid;
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  let early = null;
  for (let i = 0; i < 300 && !early; i++) {
    early = sh("ps", ["-Eww", "-p", String(server.pid)]).match(/GETWRITE_PROJECTS_DIR=(\S+)/)?.[1] ?? null;
    if (!early) await new Promise((r) => setTimeout(r, 10));
  }
  if (!early || fs.realpathSync(early) !== projectsDir) throw new Error("server env GETWRITE_PROJECTS_DIR mismatch: " + early);
  out.assertedServerEnvProjectsDir = early;
  let listening = false;
  for (let i = 0; i < 120 && !listening; i++) {
    await new Promise((r) => setTimeout(r, 500));
    listening = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-Fp"]).includes(`p${server.pid}`);
  }
  if (!listening) throw new Error("server pid not listening");
  out.lsofListen = sh("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"]);

  const post = async (p, body) => {
    const r = await fetch(ORIGIN + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const doc = { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Sample Heading One" }] },
    { type: "paragraph", content: [{ type: "text", text: "Sample paragraph text for font measurement." }] },
  ] };
  const proj = await post("/api/projects", { name: "T25 fonts", projectType: "blank" });
  const id = path.basename(proj.project.rootPath);
  await post("/api/resource", { projectId: id, resourceData: { name: "Sample", type: "text", text: { plainText: "Sample paragraph text for font measurement.", tiptap: doc } } });
  await post("/api/project/editor-config", { projectId: id, headings: { h1: { fontFamily: "Playfair Display", fontSize: "40px", fontWeight: "700" } }, body: { fontFamily: "Merriweather" } });
  out.projectsDirListing = fs.readdirSync(projectsDir);

  const browser = await chromium.launch();
  out.chromium = browser.version();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const allowed = [], blocked = [], googleAttempts = [], consoleErrors = [];
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (GOOGLE.test(u.hostname)) googleAttempts.push(route.request().url());
    if (u.origin === ORIGIN || u.protocol === "data:" || u.protocol === "blob:") { allowed.push(u.pathname); return route.continue(); }
    blocked.push(route.request().url());
    return route.abort();
  });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("request", (r) => { if (GOOGLE.test(new URL(r.url()).hostname)) googleAttempts.push("event:" + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const platform = async (selector) => {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    return fonts.map((f) => ({ family: f.familyName, ps: f.postScriptName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  };

  await page.goto(ORIGIN + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open T25 fonts", exact: true }).click({ timeout: 15000 });
  await page.getByText("Sample", { exact: true }).first().click({ timeout: 15000 });
  await page.locator(".ProseMirror p").first().waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  // Editor elements (no toolbar interaction).
  out.editor = {};
  for (const sel of [".ProseMirror p", ".ProseMirror h1"]) {
    const info = await page.evaluate((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { computedFontFamily: cs.fontFamily, computedFontWeight: cs.fontWeight }; }, sel);
    out.editor[sel] = { ...info, check: await page.evaluate((f) => document.fonts.check(`16px ${f}`), info.computedFontFamily.split(",")[0]), platformFonts: await platform(sel) };
  }
  // Per bundled family: render a paragraph in it (appended to the page), then check.
  for (const fam of FAMILIES) {
    await page.evaluate((f) => {
      document.getElementById("t25-probe")?.remove();
      const p = document.createElement("p");
      p.id = "t25-probe"; p.textContent = "Probe paragraph for family measurement 0123456789";
      p.style.fontFamily = `"${f}"`; p.style.fontSize = "20px";
      document.body.appendChild(p);
    }, fam);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    out.families[fam] = {
      check: await page.evaluate((f) => document.fonts.check(`20px "${f}"`), fam),
      faces: await page.evaluate((f) => [...document.fonts].filter((x) => x.family.replace(/"/g, "") === f).map((x) => `${x.weight}|${x.style}|${x.status}`), fam),
      platformFonts: await platform("#t25-probe"),
    };
  }
  out.googleRequestAttempts = googleAttempts;
  out.blockedRequestCount = blocked.length;
  out.blockedRequests = blocked.slice(0, 20);
  out.allowedFontRequests = allowed.filter((p) => /\.woff2?$/.test(p)).length;
  out.consoleErrors = consoleErrors;
  await browser.close();
  out.serverLogTail = serverLog.split("\n").slice(-10);
} catch (e) {
  out.error = String((e && e.stack) || e);
} finally {
  if (server && server.pid) {
    try { process.kill(server.pid, "SIGTERM"); } catch {}
    await new Promise((r) => setTimeout(r, 1500));
    let alive = true; try { process.kill(server.pid, 0); } catch { alive = false; }
    out.stopped = alive ? "STILL ALIVE" : "exited";
  }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.rmSync(projectsDir, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 1));
}
