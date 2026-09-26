// Feature 59 Task 10: the native writing-log backend (which reaches
// writing-log-core -> io.ts -> node:path) must stay out of the web bundle:
// only lib/api/writing-log.ts may import it, and next.config.mjs must alias
// its specifier to a node:*-free stub.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BACKEND = path.join(
  "src",
  "store",
  "transport",
  "native-writing-log-backend.ts",
);
const CLIENT = path.join("src", "lib", "api", "writing-log.ts");
const STUB = path.join(
  "src",
  "store",
  "transport",
  "native-writing-log-backend.web-stub.ts",
);

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      out.push(...collect(full));
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("native-writing-log-backend web-bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");

  it("is referenced only from lib/api/writing-log.ts", () => {
    const re = /native-writing-log-backend(?!\.web-stub)["']/;
    const offenders: string[] = [];
    for (const d of ["src", "app"]) {
      const dir = path.join(root, d);
      if (!fs.existsSync(dir)) continue;
      for (const file of collect(dir)) {
        const rel = path.relative(root, file);
        if ([CLIENT, BACKEND, STUB].includes(rel)) continue;
        if (re.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the client carries the literal dynamic import specifier", () => {
    expect(fs.readFileSync(path.join(root, CLIENT), "utf8")).toContain(
      'import("../../store/transport/native-writing-log-backend")',
    );
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain('"../../store/transport/native-writing-log-backend"');
    expect(cfg).toContain("native-writing-log-backend.web-stub");
  });

  it("the web-stub has no node:* reference and no imports beyond types", () => {
    const stub = fs.readFileSync(path.join(root, STUB), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    expect(stub).not.toMatch(/require\(\s*["']node:/);
    const values = stub
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(values).toEqual([]);
  });
});
