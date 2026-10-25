// Spike runner (Feature 95, Task 7): opens the driver page in Playwright's Chromium
// (from frontend/node_modules) and prints the result block as JSON on stdout.
// Each run uses a fresh browser context (empty HTTP cache), so its first load is cold.
//
// Run: node specs/features/spell-checker/scripts/run.mjs --url http://127.0.0.1:PORT/
//        [--query "warm=3&engines=nspell"] [--runs N] [--headed] [--shell]
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
const browser = await chromium.launch({ headless: !args.includes("--headed"), channel });
try {
  const results = [];
  for (let r = 0; r < runs; r++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`pageerror: ${e.message}`));
    await page.goto(`${new URL("driver.html", base).href}?${query}`);
    await page.waitForFunction(() => window.__spellResult !== undefined, null, { timeout: TIMEOUT_MS, polling: 1000 });
    results.push(await page.evaluate(() => window.__spellResult));
    await context.close();
  }
  console.log(JSON.stringify(runs === 1 ? results[0] : results, null, 2));
} finally {
  await browser.close();
}
