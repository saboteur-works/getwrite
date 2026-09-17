// Feature 26 native-trash-transport Task 9: guards the same web-bundle
// exclusion established for other native backends
// (`native-entity-relationships-backend-web-exclusion.test.ts`) for the
// trash transport — `native-trash-backend.ts` and everything transitively
// under it (`trash-core.ts` -> `trash.ts` -> `io.ts`/`meta-locks.ts`/
// `project-config.ts`, which import `node:path`) must never enter the
// web/desktop `next build` output.
//
// Two things have to hold simultaneously for that exclusion to work, and this
// file checks both:
//
// 1. Nothing statically or dynamically imports `native-trash-backend.ts`
//    except `lib/api/trash.ts`'s single dynamic `import()`.
// 2. `next.config.mjs` carries the `turbopack.resolveAlias` entry that
//    substitutes a `node:*`-free stub for that exact import specifier at
//    build time.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createNativeTrashTransport } from "../../src/store/transport/native-trash-backend.web-stub";

const NATIVE_BACKEND_RELATIVE_PATH = path.join(
  "src",
  "store",
  "transport",
  "native-trash-backend.ts",
);
const TRASH_TRANSPORT_SERVICE_RELATIVE_PATH = path.join(
  "src",
  "lib",
  "api",
  "trash.ts",
);
const WEB_STUB_RELATIVE_PATH = path.join(
  "src",
  "store",
  "transport",
  "native-trash-backend.web-stub.ts",
);

/** Recursively collects every `.ts`/`.tsx` file under `dir`. */
function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("native-trash-backend web-bundle exclusion", () => {
  const frontendRoot = path.resolve(__dirname, "..", "..");

  it("is referenced (statically or dynamically) only from lib/api/trash.ts", () => {
    const dirsToScan = ["src", "app"].map((d) => path.join(frontendRoot, d));
    const importRe = /native-trash-backend(?!\.web-stub)["']/;

    const offenders: string[] = [];
    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      for (const file of collectSourceFiles(dir)) {
        const relative = path.relative(frontendRoot, file);
        if (relative === TRASH_TRANSPORT_SERVICE_RELATIVE_PATH) continue;
        if (relative === NATIVE_BACKEND_RELATIVE_PATH) continue;
        if (relative === WEB_STUB_RELATIVE_PATH) continue;
        const contents = fs.readFileSync(file, "utf8");
        if (importRe.test(contents)) {
          offenders.push(relative);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("lib/api/trash.ts's native loader thunk carries the literal dynamic import specifier", () => {
    const contents = fs.readFileSync(
      path.join(frontendRoot, TRASH_TRANSPORT_SERVICE_RELATIVE_PATH),
      "utf8",
    );

    expect(contents).toContain(
      'import("../../store/transport/native-trash-backend")',
    );
  });

  it("next.config.mjs aliases the native backend specifier to a node:*-free stub for Turbopack builds", () => {
    const configContents = fs.readFileSync(
      path.join(frontendRoot, "next.config.mjs"),
      "utf8",
    );

    expect(configContents).toContain("resolveAlias");
    expect(configContents).toContain(
      '"../../store/transport/native-trash-backend"',
    );
    expect(configContents).toContain("native-trash-backend.web-stub");
  });

  it("the web-stub module contains no reference to node:* built-ins", () => {
    const stubContents = fs.readFileSync(
      path.join(frontendRoot, WEB_STUB_RELATIVE_PATH),
      "utf8",
    );

    expect(stubContents).not.toMatch(/from\s+["']node:/);
    expect(stubContents).not.toMatch(/require\(\s*["']node:/);
  });

  it("the web-stub throws if actually reached", () => {
    // Mirrors the stub's own doc-commented contract: it substitutes for the
    // real native backend only via next.config.mjs's turbopack.resolveAlias
    // (a build-time rule tests never go through), so calling it directly —
    // as would happen if that exclusion ever stopped applying — must throw
    // rather than silently resolving.
    expect(() => createNativeTrashTransport()).toThrow(/web-stub/i);
  });
});
