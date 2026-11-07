// Feature 102 Task 9: the native folder-metadata backend (which reaches
// folder-metadata-core -> io.ts -> node:path) must stay out of the web
// bundle: only lib/api/folder-metadata.ts may import it, and next.config.mjs
// must alias its specifier to a node:*-free stub.
//
// Review step (FR-8): no folder sidecar operation is routed through Electron
// IPC. The last test reads electron/src and fails if any file under it
// mentions the folder metadata route, client, core or sidecar helpers.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BACKEND = path.join(
  "src",
  "store",
  "transport",
  "native-folder-metadata-backend.ts",
);
const CLIENT = path.join("src", "lib", "api", "folder-metadata.ts");
const STUB = path.join(
  "src",
  "store",
  "transport",
  "native-folder-metadata-backend.web-stub.ts",
);

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "dist"].includes(e.name)) continue;
      out.push(...collect(full));
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("native-folder-metadata-backend web-bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");

  it("is referenced only from lib/api/folder-metadata.ts", () => {
    const re = /native-folder-metadata-backend(?!\.web-stub)["']/;
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
      'import("../../store/transport/native-folder-metadata-backend")',
    );
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain(
      '"../../store/transport/native-folder-metadata-backend"',
    );
    expect(cfg).toContain("native-folder-metadata-backend.web-stub");
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

  it("no Electron source routes a folder sidecar operation through IPC", () => {
    const electronSrc = path.resolve(root, "..", "electron", "src");
    expect(fs.existsSync(electronSrc)).toBe(true);
    const re =
      /folder-metadata|folderMetadata|folder-sidecar|folderSidecar|FolderSidecar|\.meta\.json/;
    const offenders = collect(electronSrc)
      .filter((file) => re.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(electronSrc, file));
    expect(offenders).toEqual([]);
    const main = fs.readFileSync(path.join(electronSrc, "main.ts"), "utf8");
    const channels = [...main.matchAll(/ipcMain\.handle\(\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(channels.length).toBeGreaterThan(0);
    // "docx-choose-folder" is a native directory picker, not folder data.
    expect(
      channels.filter((c) => /sidecar|metadata|folder-meta/.test(c)),
    ).toEqual([]);
  });
});
