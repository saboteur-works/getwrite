// Spike (Feature 95, Task 14; FR-34, AC-15). THROWAWAY: not part of the app.
// Launches the workspace Electron twice in sequence with the SAME throwaway userData directory
// (created under the system temp directory, deleted afterwards). Launch 1 writes a localStorage
// key; launch 2 reads it. The page comes from a throwaway static server on http://localhost:PORT.
// Port 7340 (the desktop app's fixed port) is checked with lsof and is never bound.
//
// Run from the repo root:  node specs/features/spell-checker/scripts/electron-storage.mjs
// The same file is the Electron main script when launched by itself (process.versions.electron set).
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = "spell-spike-persistence-key";
const VALUE = `written-${Date.now()}`;
const PAGE = "<!doctype html><title>storage</title><body>storage</body>";

// Not awaited in the Electron branch: an ESM main that awaits app.whenReady() at top level did not
// reach "ready" in this setup (observed, Task 14); the orchestrator branch awaits normally.
if (process.versions.electron) {
  runElectronMain().catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
} else {
  await runOrchestrator();
}

async function runElectronMain() {
  const { app, BrowserWindow } = (await import("electron")).default;
  const a = process.argv.slice(2);
  const opt = (f) => a[a.indexOf(f) + 1];
  const [url, userDataArg, phase, value] = [opt("--url"), opt("--user-data"), opt("--phase"), opt("--value")];
  const root = realpathSync(tmpdir());
  const rel = relative(root, realpathSync(userDataArg));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error("--user-data must be inside the system temp directory");
  if (new URL(url).port === "7340") throw new Error("port 7340 is reserved");
  app.setPath("userData", realpathSync(userDataArg));
  app.on("window-all-closed", () => {});
  await app.whenReady();
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await win.loadURL(url);
  const js =
    phase === "write"
      ? `(localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(value)}), { origin: location.origin, read: localStorage.getItem(${JSON.stringify(KEY)}) })`
      : `({ origin: location.origin, read: localStorage.getItem(${JSON.stringify(KEY)}) })`;
  const r = await win.webContents.executeJavaScript(js);
  console.log(`RESULT ${JSON.stringify({ phase, electron: process.versions.electron, chrome: process.versions.chrome, ...r })}`);
  win.destroy();
  app.quit(); // graceful quit so the session storage is flushed to userData
}

function port7340Listeners() {
  try {
    return execFileSync("lsof", ["-nP", "-iTCP:7340", "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
  } catch {
    return ""; // lsof exits 1 when nothing matches
  }
}

function launch(electronBin, self, url, userData, phase) {
  return new Promise((ok, fail) => {
    const p = spawn(electronBin, [self, "--url", url, "--user-data", userData, "--phase", phase, "--value", VALUE], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    const timer = setTimeout(() => p.kill(), 60000); // kills only this launch's own pid
    p.stdout.on("data", (d) => (out += d));
    p.on("exit", (code) => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      if (code === 0 && line) ok(JSON.parse(line.slice(7)));
      else fail(new Error(`launch ${phase} exit ${code}; output: ${out}`));
    });
  });
}

async function runOrchestrator() {
  const listeners = port7340Listeners();
  console.log(`lsof 7340: ${listeners === "" ? "nothing listening" : "IN USE"} (7340 is not bound by this script either way)`);
  const self = fileURLToPath(import.meta.url);
  const electronBin = join(self, "../../../../../electron/node_modules/.bin/electron");
  const server = createServer((_q, res) => res.writeHead(200, { "content-type": "text/html" }).end(PAGE));
  await new Promise((ok) => server.listen(0, "localhost", ok));
  const { port } = server.address();
  if (port === 7340) throw new Error("refusing port 7340");
  const url = `http://localhost:${port}/`;
  const userData = mkdtempSync(join(realpathSync(tmpdir()), "spell-storage-"));
  try {
    const first = await launch(electronBin, self, url, userData, "write");
    const second = await launch(electronBin, self, url, userData, "read");
    console.log(JSON.stringify({ origin: url, wrote: VALUE, first, second, persisted: second.read === VALUE }, null, 2));
    process.exitCode = second.read === VALUE ? 0 : 2;
  } finally {
    server.close();
    rmSync(userData, { recursive: true, force: true });
  }
}
