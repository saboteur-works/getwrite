// Last Updated: 2026-03-11

/**
 * @module screenshots
 *
 * Registers the `screenshots` sub-command group on the Commander program.
 *
 * Currently exposes a single child command:
 *
 * ### `screenshots capture`
 *
 * Launches a headless Chromium browser via Playwright, fetches the running
 * Storybook's `/index.json` manifest to discover story IDs, then navigates to
 * each story's iframe URL and saves a full-page PNG screenshot to disk.
 *
 * Useful for visual regression base-lining, design reviews, and CI artefact
 * generation without a full browser test suite.
 *
 * Usage:
 * ```
 * getwrite screenshots capture [options]
 * ```
 *
 * Options:
 * | Flag | Default | Description |
 * |------|---------|-------------|
 * | `-b, --storybook <url>` | `http://localhost:6006` | Base URL of the running Storybook instance |
 * | `-o, --out <dir>`       | `./screenshots`        | Directory to write PNG files into |
 * | `-l, --limit <n>`       | `6`                    | Maximum number of stories to capture |
 *
 * Examples:
 * ```sh
 * # Capture the first 6 stories from the default local Storybook
 * getwrite screenshots capture
 *
 * # Capture up to 20 stories from a remote Storybook, saving to /tmp/shots
 * getwrite screenshots capture --storybook https://storybook.example.com --out /tmp/shots --limit 20
 * ```
 *
 * Output files are named using the story ID with `:` and `/` replaced by `_`,
 * e.g. `components-button--primary.png`.
 *
 * Exit codes (when not in a test harness):
 * - `1` — no stories found in Storybook's `index.json`.
 * - `2` — unexpected error during capture (details logged to stderr).
 */
import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

/**
 * Options parsed from the `screenshots capture` command flags.
 */
interface CaptureOptions {
    /** Base URL of the running Storybook instance. */
    storybook: string;
    /** Output directory path (relative to `process.cwd()` or absolute). */
    out: string;
    /** Maximum number of stories to capture, as a numeric string. */
    limit: string;
}

/**
 * Registers the `screenshots` sub-command group on the provided Commander
 * `program`.
 *
 * Child commands registered:
 * - `screenshots capture` — takes Storybook screenshots using Playwright.
 *
 * @param program - The root Commander `Command` instance to attach the
 *   sub-command group to.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerScreenshots } from "./commands/screenshots";
 *
 * const program = new Command();
 * registerScreenshots(program);
 * program.parse(process.argv);
 * ```
 */
export function registerScreenshots(program: Command) {
    const cmd = program
        .command("screenshots")
        .description("Screenshot related commands");

    cmd.command("capture")
        .description("Capture Storybook screenshots")
        .option(
            "-b, --storybook <url>",
            "Storybook base URL",
            "http://localhost:6006",
        )
        .option("-o, --out <dir>", "output directory", "./screenshots")
        .option("-l, --limit <n>", "maximum number of stories to capture", "6")
        .action(async (options: CaptureOptions): Promise<void> => {
            const base = options.storybook;
            const outDir = path.resolve(process.cwd(), options.out);

            // Ensure the output directory exists before writing any files.
            if (!fs.existsSync(outDir))
                fs.mkdirSync(outDir, { recursive: true });

            console.log("Fetching index.json from", base);
            try {
                const res = await fetch(`${base}/index.json`);
                if (!res.ok)
                    throw new Error(
                        `Failed to fetch index.json: ${res.status}`,
                    );

                const json = await res.json();

                // Storybook v7+ uses `entries`; v6 uses `stories`.  Fall back
                // to the root object itself for non-standard builds.
                const storiesObj = json.stories || json.entries || json;
                const storyIds = Object.keys(storiesObj || {}).slice(
                    0,
                    Number(options.limit ?? 6),
                );

                if (storyIds.length === 0) {
                    console.error("No stories found in index.json");
                    process.exit(1);
                }

                const browser = await chromium.launch();
                const page = await browser.newPage({
                    viewport: { width: 1200, height: 900 },
                });

                for (const id of storyIds) {
                    // Each story is rendered in isolation via its iframe URL.
                    const url = `${base}/iframe.html?id=${id}`;
                    console.log("Capturing", id, url);
                    await page.goto(url, { waitUntil: "networkidle" });

                    // Brief settle delay to allow animations/fonts to finish.
                    await page.waitForTimeout(600);

                    // Sanitise the story ID for use as a filename.
                    const safe = id.replace(/[:/]/g, "_");
                    const out = path.join(outDir, `${safe}.png`);
                    await page.screenshot({ path: out, fullPage: true });
                    console.log("Saved", out);
                }

                await browser.close();
                console.log("Done capturing screenshots.");
            } catch (err) {
                console.error("Screenshot capture failed:", err);
                process.exit(2);
            }
        });
}

export default registerScreenshots;
