// Spike server (Feature 95, Task 7; FR-2, FR-4a). Serves the bundle written by
// build.mjs plus generated fixtures over HTTP on 127.0.0.1, with brotli or gzip
// compression so transferred and decoded sizes differ. Compressed bodies are made
// once at start-up so compression CPU time is not inside a measured load.
// Never binds 3000, 6006 or 7340 (the app, Storybook, the desktop server).
//
// Run: node specs/features/spell-checker/scripts/serve.mjs [--port N] [--bundle DIR]
//        [--fixtures DIR] [--encoding br|gzip]
//   --port defaults to 0 (the OS picks a free port); the chosen port and pid are printed.
//   Routes: /fixtures/*  generated fixtures and manifest.json
//           /env.json    environment record (Node, package versions, git HEAD, OS)
//           everything else from the bundle folder; "/" is driver.html.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { arch, platform, release, tmpdir } from "node:os";
import { brotliCompressSync, gzipSync, constants as zc } from "node:zlib";
import { extname, join, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PARAMS, generateFixture, loadDictionaryWords } from "./fixtures.mjs";
import { defaultBundleDir } from "./build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const FORBIDDEN_PORTS = new Set([3000, 6006, 7340]);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
  ".aff": "text/plain; charset=utf-8", ".dic": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".wasm", ".txt", ".json", ".aff", ".dic"]);

export function parsePort(raw) {
  const port = raw === undefined ? 0 : Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid port ${raw}`);
  if (FORBIDDEN_PORTS.has(port)) throw new Error(`port ${port} is reserved (app 3000, Storybook 6006, desktop 7340)`);
  return port;
}

function readPackageVersion(name) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "frontend/node_modules", name, "package.json"), "utf8")).version;
  } catch (err) {
    return `UNREADABLE: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function environmentRecord() {
  const git = (...a) => execFileSync("git", ["-C", repoRoot, ...a], { encoding: "utf8" }).trim();
  return {
    date: new Date().toISOString(),
    node: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    gitHead: git("rev-parse", "HEAD"),
    gitBranch: git("rev-parse", "--abbrev-ref", "HEAD"),
    packages: Object.fromEntries(["nspell", "dictionary-en", "harper.js"].map((n) => [n, readPackageVersion(n)])),
  };
}

async function prepareFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const words = await loadDictionaryWords();
  const sizes = [];
  for (const size of PARAMS.sizes) {
    const { text, counts } = generateFixture(size, PARAMS.seed, words);
    writeFileSync(join(dir, `fixture-${size}.txt`), text);
    sizes.push({ size, file: `fixture-${size}.txt`, counts });
  }
  const { seed, misspellEvery, misspellOffset, nameEvery, nameOffset } = PARAMS;
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ seed, misspellEvery, misspellOffset, nameEvery, nameOffset, sizes }));
}

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), base) : [join(dir, e.name).slice(base.length)],
  );
}

/** Reads and compresses every file under dir once. */
function loadFolder(dir, prefix, encoding) {
  const entries = new Map();
  for (const rel of listFiles(dir)) {
    const ext = extname(rel);
    const raw = readFileSync(join(dir, rel));
    const entry = { type: TYPES[ext] ?? "application/octet-stream", raw };
    if (COMPRESSIBLE.has(ext)) {
      entry.br = encoding === "gzip" ? null : brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      entry.gzip = gzipSync(raw, { level: 6 });
    }
    entries.set(prefix + rel.split(sep).filter(Boolean).join("/"), entry);
  }
  return entries;
}

function pickEncoding(acceptEncoding, entry) {
  const accepted = String(acceptEncoding ?? "");
  if (entry.br && /\bbr\b/.test(accepted)) return "br";
  if (entry.gzip && /\bgzip\b/.test(accepted)) return "gzip";
  return null;
}

export async function startServer({ port, bundleDir, fixturesDir, encoding }) {
  if (!existsSync(join(bundleDir, "driver.html"))) throw new Error(`no bundle in ${bundleDir}; run build.mjs first`);
  await prepareFixtures(fixturesDir);
  const files = new Map([...loadFolder(bundleDir, "/", encoding), ...loadFolder(fixturesDir, "/fixtures/", encoding)]);
  files.set("/", files.get("/driver.html"));
  const envBody = Buffer.from(JSON.stringify(environmentRecord()));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const common = {
      "Cross-Origin-Opener-Policy": "same-origin", // with COEP: crossOriginIsolated, needed by measureUserAgentSpecificMemory
      "Cross-Origin-Embedder-Policy": "require-corp",
      Vary: "Accept-Encoding",
    };
    if (path === "/env.json") {
      res.writeHead(200, { ...common, "Content-Type": TYPES[".json"], "Cache-Control": "no-store", "Content-Length": envBody.length });
      return res.end(envBody);
    }
    const entry = files.get(path);
    if (!entry || req.method !== "GET") {
      res.writeHead(entry ? 405 : 404, common);
      return res.end();
    }
    const enc = pickEncoding(req.headers["accept-encoding"], entry);
    const body = enc === "br" ? entry.br : enc === "gzip" ? entry.gzip : entry.raw;
    const headers = { ...common, "Content-Type": entry.type, "Content-Length": body.length, "Cache-Control": "public, max-age=3600" };
    if (enc) headers["Content-Encoding"] = enc;
    res.writeHead(200, headers);
    res.end(body);
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  return { server, port: server.address().port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const port = parsePort(opt("--port"));
  const encoding = opt("--encoding") ?? "br";
  if (encoding !== "br" && encoding !== "gzip") throw new Error("--encoding must be br or gzip");
  const bundleDir = resolve(opt("--bundle") ?? defaultBundleDir());
  const fixturesDir = resolve(opt("--fixtures") ?? join(process.env.TMPDIR ?? tmpdir(), "spell-fixtures"));
  const { port: actual } = await startServer({ port, bundleDir, fixturesDir, encoding });
  if (FORBIDDEN_PORTS.has(actual)) throw new Error(`OS assigned reserved port ${actual}`);
  console.log(`listening http://127.0.0.1:${actual}/ pid=${process.pid} encoding=${encoding} bundle=${bundleDir} fixtures=${fixturesDir}`);
}
