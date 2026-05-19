/**
 * check-no-hardcoded-hex.mjs
 *
 * Scans frontend/components, frontend/styles, and frontend/src for hardcoded
 * hex color literals (#RGB / #RRGGBB / #RRGGBBAA) and fails if any are found
 * outside the approved exemption patterns.
 *
 * Exempt patterns (checked per line, in order):
 *
 *   1. CSS custom-property declaration:  --some-var: #hex
 *      These ARE the token definitions — permitted.
 *
 *   2. CSS var() fallback:  var(--token, #hex)
 *      Inline-style fallbacks for named tokens — permitted.
 *
 *   3. Pure comment line (// ... or /* ... or * ...)
 *      Documentation and example hex values in comments — permitted.
 *
 *   4. Inline exemption marker:  GW-HEX-EXEMPT: <reason>
 *      A structured comment on the same line as the hex value explaining why
 *      the literal is necessary. Add this marker only when neither rule 1–3
 *      applies. Accepted markers:
 *        - TS/TSX:  // GW-HEX-EXEMPT: <reason>
 *        - CSS:     /* GW-HEX-EXEMPT: <reason> *\/  (on the same line)
 *
 *   5. Block exemption:  GW-HEX-EXEMPT-START / GW-HEX-EXEMPT-END
 *      Wraps a block of hex literals that all share a rationale (e.g. a color
 *      palette array). The start marker must include the reason:
 *        // GW-HEX-EXEMPT-START: TipTap color palette
 *        ...hex values...
 *        // GW-HEX-EXEMPT-END
 *
 * Run:  node scripts/check-no-hardcoded-hex.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const SCAN_DIRS = ["components", "styles", "src"];
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const CSS_VAR_DECL_RE = /--[\w-]+\s*:/;
const CSS_VAR_FALLBACK_G_RE = /var\(\s*--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}[^)]*\)/g;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;
const EXEMPT_MARKER = "GW-HEX-EXEMPT:";
const BLOCK_START_MARKER = "GW-HEX-EXEMPT-START:";
const BLOCK_END_MARKER = "GW-HEX-EXEMPT-END";
const IGNORED_EXTENSIONS = new Set([".json", ".md", ".txt", ".svg", ".png", ".jpg"]);

const violations = [];

async function walk(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (
            ["node_modules", ".next", "storybook-static", "playwright-report"].includes(
                entry.name,
            )
        )
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(fullPath);
            continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) continue;

        const text = await fs.readFile(fullPath, "utf-8");
        const lines = text.split("\n");
        const relPath = path.relative(root, fullPath).replaceAll(path.sep, "/");

        let inExemptBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Rule 5: Block exemption tracking
            if (line.includes(BLOCK_START_MARKER)) {
                inExemptBlock = true;
                continue;
            }
            if (line.includes(BLOCK_END_MARKER)) {
                inExemptBlock = false;
                continue;
            }
            if (inExemptBlock) continue;

            if (!HEX_RE.test(line)) continue;

            // Rule 1: CSS custom-property declaration on this line
            if (CSS_VAR_DECL_RE.test(line)) continue;

            // Rule 2: Strip all CSS var() fallbacks; if no hex remains, skip
            const stripped = line.replace(CSS_VAR_FALLBACK_G_RE, "");
            if (!HEX_RE.test(stripped)) continue;

            // Rule 3: Pure comment line
            if (COMMENT_LINE_RE.test(line)) continue;

            // Rule 4: Inline exemption marker
            if (line.includes(EXEMPT_MARKER)) continue;

            violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
    }
}

for (const scanDir of SCAN_DIRS) {
    await walk(path.join(root, scanDir));
}

if (violations.length > 0) {
    console.error("Hardcoded hex color violations found:");
    for (const v of violations) {
        console.error(`  ${v}`);
    }
    console.error(
        "\nFix by replacing with a gw-* token, a CSS var() fallback, or add a GW-HEX-EXEMPT: comment if the hex is truly necessary.",
    );
    process.exit(1);
}

console.log("No hardcoded hex violations found.");
