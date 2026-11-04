// ADR-021 Phase 2 (Task 5): guards the same web-bundle exclusion established
// for projects (`native-project-backend-web-exclusion.test.ts`) for the
// compile transport — `native-compile-backend.ts` and everything
// transitively under it (`compile-core.ts` -> `project-root-resolver.ts`/
// `io.ts`, which import `node:path`) must never enter the web/desktop
// `next build` output.
//
// Two things have to hold simultaneously for that exclusion to work, and this
// file checks both:
//
// 1. Nothing statically or dynamically imports `native-compile-backend.ts`
//    except `lib/api/compile.ts`'s single dynamic `import()`.
// 2. `next.config.mjs` carries the `turbopack.resolveAlias` entry that
//    substitutes a `node:*`-free stub for that exact import specifier at
//    build time.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const NATIVE_BACKEND_RELATIVE_PATH = path.join(
  "src",
  "store",
  "transport",
  "native-compile-backend.ts",
);
const TRANSPORT_SERVICE_RELATIVE_PATH = path.join(
  "src",
  "lib",
  "api",
  "compile.ts",
);
const WEB_STUB_RELATIVE_PATH = path.join(
  "src",
  "store",
  "transport",
  "native-compile-backend.web-stub.ts",
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

describe("native-compile-backend web-bundle exclusion", () => {
  const frontendRoot = path.resolve(__dirname, "..", "..");

  it("is referenced (statically or dynamically) only from lib/api/compile.ts", () => {
    const dirsToScan = ["src", "app"].map((d) => path.join(frontendRoot, d));
    const importRe = /native-compile-backend(?!\.web-stub)["']/;

    const offenders: string[] = [];
    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      for (const file of collectSourceFiles(dir)) {
        const relative = path.relative(frontendRoot, file);
        if (relative === TRANSPORT_SERVICE_RELATIVE_PATH) continue;
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

  it("lib/api/compile.ts's native loader thunk carries the literal dynamic import specifier", () => {
    const contents = fs.readFileSync(
      path.join(frontendRoot, TRANSPORT_SERVICE_RELATIVE_PATH),
      "utf8",
    );

    expect(contents).toContain(
      'import("../../store/transport/native-compile-backend")',
    );
  });

  it("next.config.mjs aliases the native backend specifier to a node:*-free stub for Turbopack builds", () => {
    const configContents = fs.readFileSync(
      path.join(frontendRoot, "next.config.mjs"),
      "utf8",
    );

    expect(configContents).toContain("resolveAlias");
    expect(configContents).toContain(
      '"../../store/transport/native-compile-backend"',
    );
    expect(configContents).toContain("native-compile-backend.web-stub");
  });

  it("the web-stub module contains no reference to node:* built-ins", () => {
    const stubContents = fs.readFileSync(
      path.join(frontendRoot, WEB_STUB_RELATIVE_PATH),
      "utf8",
    );

    expect(stubContents).not.toMatch(/from\s+["']node:/);
    expect(stubContents).not.toMatch(/require\(\s*["']node:/);
  });
});

// Feature 101 Task 4 (FR-3): the same exclusion for the saved-defaults
// backends. Each is referenced only from its lib/api client, aliased in
// next.config.mjs, and its web-stub is node:*-free.
describe.each([
  ["compile-defaults", "native-compile-defaults-backend"],
  ["export-defaults", "native-export-defaults-backend"],
  ["annotations", "native-annotations-backend"],
])("%s native backend web-bundle exclusion", (client, backend) => {
  const frontendRoot = path.resolve(__dirname, "..", "..");
  const backendPath = path.join("src", "store", "transport", `${backend}.ts`);
  const stubPath = path.join(
    "src",
    "store",
    "transport",
    `${backend}.web-stub.ts`,
  );
  const clientPath = path.join("src", "lib", "api", `${client}.ts`);

  it("is referenced only from its lib/api client", () => {
    const importRe = new RegExp(`${backend}(?!\\.web-stub)["']`);
    const offenders: string[] = [];
    for (const dir of ["src", "app"].map((d) => path.join(frontendRoot, d))) {
      if (!fs.existsSync(dir)) continue;
      for (const file of collectSourceFiles(dir)) {
        const relative = path.relative(frontendRoot, file);
        if ([clientPath, backendPath, stubPath].includes(relative)) continue;
        if (importRe.test(fs.readFileSync(file, "utf8"))) {
          offenders.push(relative);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the client carries the literal dynamic import specifier", () => {
    const contents = fs.readFileSync(
      path.join(frontendRoot, clientPath),
      "utf8",
    );
    expect(contents).toContain(`import("../../store/transport/${backend}")`);
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    const config = fs.readFileSync(
      path.join(frontendRoot, "next.config.mjs"),
      "utf8",
    );
    expect(config).toContain(`"../../store/transport/${backend}":`);
    expect(config).toContain(`${backend}.web-stub`);
  });

  it("the web-stub contains no reference to node:* built-ins", () => {
    const stub = fs.readFileSync(path.join(frontendRoot, stubPath), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    expect(stub).not.toMatch(/require\(\s*["']node:/);
  });
});
