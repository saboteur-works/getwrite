// Spike Electron main (Feature 95, Task 12; FR-4 b, FR-6, AC-3). THROWAWAY: not part of the app.
// Opens the Task 7 driver page (served by serve.mjs) in a BrowserWindow with the app's
// webPreferences (electron/src/main.ts:736-740: contextIsolation true, nodeIntegration false;
// the app's preload is not used here because the driver needs no bridge), under a throwaway
// userData directory, and prints the same result JSON block as run.mjs plus Electron process data.
//
// Run (unpackaged, with the workspace Electron):
//   electron/node_modules/.bin/electron specs/features/spell-checker/scripts/electron-main.mjs \
//     --url http://127.0.0.1:PORT/ --user-data $TMPDIR/spell-electron-userdata \
//     [--query "warm=4&engines=nspell"] [--runs N] [--out FILE]
// --user-data must be an existing-or-new directory under the system temp directory; any other
// location is refused. Each run uses a fresh in-memory session partition (empty HTTP cache), so
// its first load is cold. Memory: app.getAppMetrics() is sampled every 250 ms during a run and
// once on a blank data: page before the driver starts.
import { app, BrowserWindow } from "electron";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, isAbsolute } from "node:path";

const args = process.argv.slice(2);
const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const base = opt("--url");
const userDataArg = opt("--user-data");
if (!base || !userDataArg) throw new Error("--url and --user-data are required");
const FORBIDDEN_PORTS = new Set(["3000", "5173", "6006", "7340"]);
if (FORBIDDEN_PORTS.has(new URL(base).port)) throw new Error(`port ${new URL(base).port} is reserved`);
if (new URL(base).hostname !== "127.0.0.1") throw new Error("--url must be on 127.0.0.1");

const tempRoot = realpathSync(tmpdir());
mkdirSync(userDataArg, { recursive: true });
const userData = realpathSync(resolve(userDataArg));
const rel = relative(tempRoot, userData);
if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`--user-data must be inside ${tempRoot}: ${userData}`);
app.setPath("userData", userData); // before ready, so no default location is created or read

const query = opt("--query", "");
const runs = Number(opt("--runs", "1"));
const outFile = opt("--out");
const TIMEOUT_MS = 40 * 60 * 1000;
const SAMPLE_MS = 250;

const metricsSnapshot = () =>
  app.getAppMetrics().map((m) => ({
    pid: m.pid,
    type: m.type,
    name: m.name ?? null,
    workingSetKB: m.memory.workingSetSize,
    peakWorkingSetKB: m.memory.peakWorkingSetSize,
    privateKB: m.memory.privateBytes ?? null,
  }));

const totalOf = (snap, key, type) => snap.filter((p) => !type || p.type === type).reduce((a, p) => a + (p[key] ?? 0), 0);

/** Peak over samples, per process type and over all processes. */
function summarise(samples) {
  const types = [...new Set(samples.flatMap((s) => s.processes.map((p) => p.type)))];
  const peak = (key, type) => Math.max(...samples.map((s) => totalOf(s.processes, key, type)));
  return {
    samples: samples.length,
    peakAllWorkingSetKB: peak("workingSetKB"),
    peakAllPrivateKB: peak("privateKB"),
    peakByTypeWorkingSetKB: Object.fromEntries(types.map((t) => [t, peak("workingSetKB", t)])),
    peakByTypePrivateKB: Object.fromEntries(types.map((t) => [t, peak("privateKB", t)])),
  };
}

/** loadURL rejected with ERR_FAILED on the blank page of the second window (observed, Task 12); retry a few times. */
async function loadWithRetry(win, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await win.loadURL(url);
    } catch (err) {
      console.error(`loadURL attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt >= 5) throw err;
      await new Promise((ok) => setTimeout(ok, 500));
    }
  }
}

async function oneRun(index) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: "#1C1C1A",
    webPreferences: {
      partition: `spell-spike-run-${index}`, // in-memory session: empty HTTP cache for a cold first load
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on("render-process-gone", (_e, d) => console.error(`render-process-gone: ${JSON.stringify(d)}`));
  await loadWithRetry(win, "data:text/html,<title>blank</title>");
  const baseline = metricsSnapshot();
  const samples = [];
  const timer = setInterval(() => samples.push({ t: Date.now(), processes: metricsSnapshot() }), SAMPLE_MS);
  try {
    await loadWithRetry(win, `${new URL("driver.html", base).href}?${query}`);
    const deadline = Date.now() + TIMEOUT_MS;
    let result;
    while (Date.now() < deadline) {
      result = await win.webContents.executeJavaScript("window.__spellResult");
      if (result !== undefined) break;
      await new Promise((ok) => setTimeout(ok, 1000));
    }
    if (result === undefined) throw new Error("driver did not publish a result before the timeout");
    const runtime = await win.webContents.executeJavaScript(
      "({ userAgent: navigator.userAgent, crossOriginIsolated, hasPerformanceMemory: !!performance.memory, hasMeasureUserAgentSpecificMemory: typeof performance.measureUserAgentSpecificMemory === 'function' })",
    );
    return { result, runtime, memory: { baseline: { allWorkingSetKB: totalOf(baseline, "workingSetKB"), allPrivateKB: totalOf(baseline, "privateKB"), processes: baseline }, ...summarise(samples) } };
  } finally {
    clearInterval(timer);
    win.destroy();
  }
}

// Without a handler Electron quits when the first run's window is destroyed (observed, Task 12:
// the second window's first load failed with ERR_FAILED and the process then exited).
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  try {
    const out = [];
    for (let i = 0; i < runs; i++) {
      console.error(`run ${i} start ${new Date().toISOString()}`);
      out.push(await oneRun(i));
    }
    const doc = {
      electron: { version: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, v8: process.versions.v8 },
      userData: app.getPath("userData"),
      pid: process.pid,
      runs: out,
    };
    const text = JSON.stringify(doc, null, 2);
    if (outFile) writeFileSync(outFile, text);
    else console.log(text);
    app.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.stack : String(err));
    app.exit(1);
  }
});
