/**
 * Core showcase scene runner.
 *
 * Boots the GetWrite app, iterates the scene manifest, captures each scene in
 * both light and dark themes at a desktop viewport, and writes PNG files to
 * the output directory. Tears down the app in a finally block so cleanup runs
 * even on failure.
 *
 * Usage:
 *   node --experimental-strip-types scripts/showcase/run.mts [options]
 *
 * Options:
 *   --out <dir>     Output directory (default: ./showcase-out)
 *   --scene <id>    Capture only scenes whose id matches this value (repeatable)
 *   --port <n>      Port to run the dev server on (default: 3999)
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { bootApp, DEFAULT_PROJECTS_DIR } from "./boot.mts";
import { scenes } from "./scenes.mts";
import { runSteps } from "./steps.mts";
import { VIEWPORTS, ALL_THEMES, type Theme } from "./types.mts";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  outDir: string;
  sceneFilter: Set<string>;
  port: number;
} {
  const args = argv.slice(2);
  let outDir = "./showcase-out";
  const sceneFilter = new Set<string>();
  let port = 3999;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outDir = args[++i];
    } else if (args[i] === "--scene" && args[i + 1]) {
      sceneFilter.add(args[++i]);
    } else if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[++i]);
    }
  }

  return { outDir: path.resolve(outDir), sceneFilter, port };
}

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

/** Seeds the appearance preference into localStorage before page load. */
function buildThemeInitScript(theme: Theme): string {
  const prefs = JSON.stringify({
    colorModePreference: theme,
    density: "default",
    reducedMotion: false,
  });
  return `
    window.localStorage.setItem('getwrite-appearance-preferences', ${JSON.stringify(prefs)});
    window.localStorage.removeItem('getwrite-color-mode');
  `;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const { outDir, sceneFilter, port } = parseArgs(process.argv);

  const activeScenes =
    sceneFilter.size > 0
      ? scenes.filter((s) => sceneFilter.has(s.id))
      : scenes;

  if (activeScenes.length === 0) {
    if (sceneFilter.size > 0) {
      console.error(
        `[showcase] No scenes matched filter: ${[...sceneFilter].join(", ")}`,
      );
    } else {
      console.error("[showcase] Scene manifest is empty — add scenes to scenes.mts");
    }
    process.exit(1);
  }

  // Ensure the output directory exists.
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[showcase] Output directory: ${outDir}`);
  console.log(`[showcase] Capturing ${activeScenes.length} scene(s)`);

  const app = await bootApp({
    projectsDir: DEFAULT_PROJECTS_DIR,
    port,
  });

  const failures: string[] = [];

  try {
    for (const scene of activeScenes) {
      const viewport = VIEWPORTS[scene.viewport ?? "desktop"];
      const themes = scene.themes ?? ALL_THEMES;

      for (const theme of themes) {
        const label = `${scene.id}--${theme}`;
        console.log(`[showcase] Capturing ${label}`);

        const browser = await chromium.launch({ headless: true });
        try {
          const context = await browser.newContext({
            viewport,
            // Seed the theme before the page loads to avoid a flash.
            storageState: undefined,
          });

          // Apply the theme preference before navigation so hydration picks it up.
          await context.addInitScript(buildThemeInitScript(theme));

          const page = await context.newPage();

          try {
            const url = `${app.baseUrl}${scene.route}`;
            await page.goto(url, { waitUntil: "domcontentloaded" });

            // Run any scene-specific setup steps.
            if (scene.steps && scene.steps.length > 0) {
              await runSteps(page, scene.steps);
            }

            // Allow fonts, animations, and layout shifts to settle.
            await page.waitForTimeout(800);

            // Move cursor off-screen to avoid hover states in screenshots.
            await page.mouse.move(-100, -100);

            const outFile = path.join(outDir, `${label}.png`);
            await page.screenshot({ path: outFile, fullPage: true });
            console.log(`[showcase] Saved ${outFile}`);
          } catch (err) {
            console.error(`[showcase] FAILED ${label}:`, err);
            failures.push(label);
          } finally {
            await page.close();
          }

          await context.close();
        } finally {
          await browser.close();
        }
      }
    }
  } finally {
    await app.stop();
  }

  if (failures.length > 0) {
    console.error(
      `\n[showcase] ${failures.length} scene(s) failed:\n  ${failures.join("\n  ")}`,
    );
    process.exit(1);
  }

  const totalImages = activeScenes.reduce((n, s) => n + (s.themes ?? ALL_THEMES).length, 0);
  console.log(`\n[showcase] Done. ${totalImages} image(s) written to ${outDir}`);
}

run().catch((err) => {
  console.error("[showcase] Fatal error:", err);
  process.exit(1);
});
