import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const violations = [];

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (
            entry.name === "node_modules" ||
            entry.name === "playwright-report"
        ) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__") {
                violations.push(
                    `Disallowed __tests__ directory: ${path.relative(root, fullPath)}`,
                );
            }
            await walk(fullPath);
            continue;
        }
        const relPath = path.relative(root, fullPath).replaceAll(path.sep, "/");

        if (relPath.startsWith("tests/") && relPath.endsWith(".spec.ts")) {
            violations.push(`Vitest file uses .spec.ts in tests/: ${relPath}`);
        }
        if (relPath.startsWith("tests/") && relPath.endsWith(".spec.tsx")) {
            violations.push(`Vitest file uses .spec.tsx in tests/: ${relPath}`);
        }
        if (relPath.startsWith("e2e/") && !relPath.endsWith(".e2e.spec.ts")) {
            violations.push(`E2E file must end with .e2e.spec.ts: ${relPath}`);
        }
    }
}

await walk(path.join(root, "tests"));
await walk(path.join(root, "e2e"));

if (violations.length > 0) {
    console.error("Test policy violations found:");
    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exit(1);
}

console.log("Test policy check passed.");
