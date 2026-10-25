// Spike runner (Feature 95, Task 7): opens the driver page in Playwright's Chromium
// (from frontend/node_modules) and prints the result block as JSON on stdout.
// Each run uses a fresh browser context (empty HTTP cache), so its first load is cold.
//
// Run: node specs/features/spell-checker/scripts/run.mjs --url http://127.0.0.1:PORT/
//        [--query "warm=3&engines=nspell"] [--runs N] [--headed] [--shell]
//        [--throttle "latencyMs,downKbps,upKbps"]  CDP Network.emulateNetworkConditions (Task 11)
// With --runs N the output is a JSON array of N results.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../../../frontend/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const base = opt("--url");
if (!base) throw new Error("--url is required");
const query = opt("--query", "");
const runs = Number(opt("--runs", "1"));
const TIMEOUT_MS = 25 * 60 * 1000;

// channel "chromium" is the full Chromium build: the headless shell lacks
// performance.measureUserAgentSpecificMemory (observed, Chrome 148), which the driver uses for memory.
const channel = args.includes("--shell") ? undefined : "chromium";
// Throttle: Network.emulateNetworkConditions on the page's CDP session. A page-level call alone did
// not slow worker fetches (observed, Task 11), so dedicated workers are auto-attached
// (Target.setAutoAttach, flatten false) and each gets the same call through Target.sendMessageToTarget
// before it is resumed.
const throttle = opt("--throttle") ? (([latency, down, up]) => ({
  offline: false,
  latency: Number(latency),
  downloadThroughput: (Number(down) * 1000) / 8,
  uploadThroughput: (Number(up) * 1000) / 8,
}))(opt("--throttle").split(",")) : null;
const throttleLog = [];
async function applyThrottle(context, page, conditions) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", conditions);
  let id = 0;
  const toTarget = (sessionId, method, params = {}) =>
    session.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id: ++id, method, params }) });
  session.on("Target.attachedToTarget", async ({ sessionId, targetInfo }) => {
    throttleLog.push(`${targetInfo.type} ${targetInfo.url}`);
    await toTarget(sessionId, "Network.enable");
    await toTarget(sessionId, "Network.emulateNetworkConditions", conditions);
    await toTarget(sessionId, "Runtime.runIfWaitingForDebugger");
  });
  await session.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: false });
}

const browser = await chromium.launch({ headless: !args.includes("--headed"), channel });
try {
  const results = [];
  for (let r = 0; r < runs; r++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (throttle) await applyThrottle(context, page, throttle);
    page.on("pageerror", (e) => console.error(`pageerror: ${e.message}`));
    await page.goto(`${new URL("driver.html", base).href}?${query}`);
    await page.waitForFunction(() => window.__spellResult !== undefined, null, { timeout: TIMEOUT_MS, polling: 1000 });
    results.push(await page.evaluate(() => window.__spellResult));
    await context.close();
  }
  if (throttle) console.error(`throttled targets attached: ${throttleLog.length}`);
  console.log(JSON.stringify(runs === 1 ? results[0] : results, null, 2));
} finally {
  await browser.close();
}
