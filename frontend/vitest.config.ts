import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal, static vitest config to avoid loading ESM-only dependencies at
// config-evaluation time (resolves an ERR_REQUIRE_ESM startup issue).
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(process.cwd(), "frontend", "@"),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        include: ["**/*.test.{ts,tsx}"],
        exclude: ["**/e2e/**", "playwright-report/**", "node_modules/**"],
    },
});
