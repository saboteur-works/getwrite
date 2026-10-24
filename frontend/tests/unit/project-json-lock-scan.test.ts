/**
 * Feature 92, Task 23 (FR-8, FR-9): the source scan for `project.json` and
 * sidecar writers, and the checks around the test-only lock-order guard.
 *
 * The scan (`tests/helpers/projectJsonLockScan.ts`) fails for any module that
 * writes `project.json` or a resource sidecar directly, or reads a sidecar and
 * later writes it with `writeSidecar`, unless the finding is on the written
 * allow-list below. Every allow-list entry must still match a finding, so a
 * fixed or moved writer cannot leave a stale excuse behind.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanSource,
  type FindingKind,
  type ScanFinding,
} from "../helpers/projectJsonLockScan";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const SCANNED_DIRS: readonly string[] = ["src", "app"];

interface AllowedFinding {
  file: string;
  kind: FindingKind;
  scope: string;
  reason: string;
}

const NEW_ROOT =
  "First write of a new project.json into a root this request has just created; no earlier copy exists to overwrite (spec, Other writers found).";

/** Every direct writer the scan legitimately finds, with its reason. */
const ALLOWED: readonly AllowedFinding[] = [
  // The two sinks.
  {
    file: "src/lib/models/project-json-write.ts",
    kind: "direct-write",
    scope: "updateProjectJson",
    reason: "The project.json sink: the write is inside withFileLock.",
  },
  {
    file: "src/lib/models/sidecar.ts",
    kind: "direct-write",
    scope: "runSidecarWrite",
    reason: "The sidecar sink: the write is inside the sidecar's withFileLock.",
  },
  {
    file: "src/lib/models/sidecar.ts",
    kind: "sidecar-path-built",
    scope: "sidecarFilename",
    reason: "The one definition of the sidecar file name; writes nothing.",
  },
  // Creation and import: a new project root.
  {
    file: "src/lib/models/project-creator.ts",
    kind: "direct-write",
    scope: "createProjectFromType",
    reason: NEW_ROOT,
  },
  {
    file: "src/lib/models/scrivener/import-scrivener-project.ts",
    kind: "direct-write",
    scope: "importScrivenerProject",
    reason: NEW_ROOT,
  },
  {
    file: "src/lib/models/plaintext/import-plaintext-project.ts",
    kind: "direct-write",
    scope: "importPlainTextProject",
    reason: NEW_ROOT,
  },
  {
    file: "src/lib/models/docx/import-docx-project.ts",
    kind: "direct-write",
    scope: "importDocxProject",
    reason: NEW_ROOT,
  },
  {
    file: "app/api/encryption/route.ts",
    kind: "direct-write",
    scope: "exportPlaintextCopy",
    reason:
      "Rewrites the manifest of an unencrypted copy in a destinationRoot created by this request; not the source project.",
  },
  // Test fixture seeding.
  {
    file: "src/lib/models/native-device-harness.ts",
    kind: "direct-write",
    scope: "seedSearchFixture",
    reason:
      "On-device test fixture for a new project and resource; no other writer holds the ids.",
  },
  {
    file: "src/lib/models/native-device-harness.ts",
    kind: "sidecar-path-built",
    scope: "seedSearchFixture",
    reason: "Same fixture: builds the path of the sidecar it creates.",
  },
  // Sidecar writers outside the sink, left unlocked by OQ-8 / OQ-9 / OQ-10.
  {
    file: "src/lib/models/trash.ts",
    kind: "direct-write",
    scope: "softDeleteResource",
    reason:
      "Moves the live sidecar into .trash/meta with rename. Not converted (OQ-10, option a); the resource is leaving the live tree.",
  },
  {
    file: "src/lib/models/trash.ts",
    kind: "direct-write",
    scope: "restoreResource",
    reason:
      "Writes the trashed sidecar back to the live path with atomicWriteFile, bypassing writeSidecar. Not converted (OQ-10, option a); no live sidecar exists for a trashed resource, which Task 5 measured.",
  },
  {
    file: "src/lib/models/resource-templates.ts",
    kind: "sidecar-path-built",
    scope: "planTextCreationWrites",
    reason:
      "Builds the path of a new resource's sidecar for the dry-run plan of a first write (new id); nothing is written here.",
  },
  {
    file: "src/lib/models/resource-crud-core.ts",
    kind: "sidecar-read-then-write",
    scope: "copyResourceCore",
    reason:
      "Reads the source resource's sidecar and writes a copy under a new id; the written file is a first write that no other request holds the id of.",
  },
  {
    file: "src/lib/models/resource-templates.ts",
    kind: "sidecar-read-then-write",
    scope: "duplicateResource",
    reason:
      "Reads the source resource's sidecar and writes a copy under a new id; the written file is a first write that no other request holds the id of.",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface LocatedFinding extends ScanFinding {
  file: string;
}

function scanTree(): LocatedFinding[] {
  return SCANNED_DIRS.flatMap((d) =>
    walk(path.join(FRONTEND_ROOT, d)).flatMap((abs) =>
      scanSource(fs.readFileSync(abs, "utf8")).map((f) => ({
        ...f,
        file: path.relative(FRONTEND_ROOT, abs).split(path.sep).join("/"),
      })),
    ),
  );
}

function isAllowed(f: LocatedFinding): boolean {
  return ALLOWED.some(
    (a) => a.file === f.file && a.kind === f.kind && a.scope === f.scope,
  );
}

describe("project.json and sidecar writer scan: real tree", () => {
  const findings = scanTree();

  it("finds no direct writer or sidecar read-then-write outside the allow-list", () => {
    const unlisted = findings
      .filter((f) => !isAllowed(f))
      .map((f) => `${f.file}:${f.line} ${f.kind} in ${f.scope} (${f.call})`);
    expect(unlisted).toEqual([]);
  });

  it("has no stale allow-list entry", () => {
    const stale = ALLOWED.filter(
      (a) =>
        !findings.some(
          (f) => f.file === a.file && f.kind === a.kind && f.scope === a.scope,
        ),
    ).map((a) => `${a.file} ${a.kind} ${a.scope}`);
    expect(stale).toEqual([]);
  });

  it("gives every allow-list entry a reason", () => {
    for (const a of ALLOWED) expect(a.reason.length).toBeGreaterThan(20);
  });
});

describe("project.json and sidecar writer scan: fixture modules", () => {
  it("fails for a module that reads then writes project.json outside the helper", () => {
    const src = `
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { PROJECT_FILENAME } from "./project-config";

export async function setThing(projectRoot: string): Promise<void> {
  const file = path.join(projectRoot, PROJECT_FILENAME);
  const project = JSON.parse(await readFile(file, "utf8"));
  project.thing = 1;
  await atomicWriteFile(file, JSON.stringify(project), "utf8");
}
`;
    expect(scanSource(src)).toEqual([
      expect.objectContaining({
        kind: "direct-write",
        scope: "setThing",
        target: "project.json",
      }),
    ]);
  });

  it("fails for a project.json write whose path is spelled inline", () => {
    const src = `
export async function f(root: string): Promise<void> {
  await fs.promises.writeFile(path.join(root, "project.json"), "{}");
}
`;
    expect(scanSource(src).map((f) => f.kind)).toEqual(["direct-write"]);
  });

  it("fails for a module that calls readSidecar and later writeSidecar", () => {
    const src = `
import { readSidecar, writeSidecar } from "./sidecar";

export async function rename(root: string, id: string): Promise<void> {
  const current = await readSidecar(root, id);
  await writeSidecar(root, id, { ...current, name: "x" });
}
`;
    expect(scanSource(src)).toEqual([
      expect.objectContaining({
        kind: "sidecar-read-then-write",
        scope: "rename",
        call: "writeSidecar",
      }),
    ]);
  });

  it("fails for a sidecar written straight to its path", () => {
    const src = `
export async function f(root: string, id: string): Promise<void> {
  const target = sidecarPathForProject(root, id);
  await atomicWriteFile(target, "{}", "utf8");
}
`;
    expect(scanSource(src)).toEqual([
      expect.objectContaining({ kind: "direct-write", target: "sidecar" }),
    ]);
  });

  it("fails for a sidecar path built by hand", () => {
    const src =
      "export function p(root: string, id: string): string {\n  return `${root}/meta/resource-${id}.meta.json`;\n}\n";
    expect(scanSource(src).map((f) => f.kind)).toEqual(["sidecar-path-built"]);
  });

  it("passes for modules that use the sinks, read-only sidecar uses and comments", () => {
    const src = `
// readSidecar then writeSidecar and atomicWriteFile(project.json) in a comment
import { mutateSidecar, readSidecar } from "./sidecar";
import { updateProjectJson } from "./project-json-write";

export async function a(root: string, id: string): Promise<void> {
  await mutateSidecar(root, id, (cur) => ({ ...cur, name: "x" }));
  await updateProjectJson(root, (p) => ({ result: p.id }));
}

export async function b(root: string, id: string): Promise<unknown> {
  return readSidecar(root, id);
}

export async function c(root: string): Promise<void> {
  await writeFile(path.join(root, "notes.txt"), "text");
}
`;
    expect(scanSource(src)).toEqual([]);
  });
});

describe("lock modules and the production bundle", () => {
  const MODELS = path.join(FRONTEND_ROOT, "src/lib/models");

  /** Files reachable from `entry` by relative imports. */
  function reachable(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const src = fs.readFileSync(entry, "utf8");
    const re = /from\s+["'](\.[^"']*)["']/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      reachable(path.resolve(path.dirname(entry), m[1] + ".ts"), seen);
    }
    return seen;
  }

  it("file-lock, meta-locks, locks and lock-guard do not reach node:async_hooks", () => {
    for (const name of ["file-lock", "meta-locks", "locks", "lock-guard"]) {
      for (const file of reachable(path.join(MODELS, `${name}.ts`))) {
        expect(fs.readFileSync(file, "utf8")).not.toMatch(
          /from\s+["'](node:)?async_hooks["']/,
        );
      }
    }
  });

  it("nothing under src installs the guard", () => {
    const installers = walk(path.join(FRONTEND_ROOT, "src"))
      .filter((f) => !f.endsWith("lock-guard.ts"))
      .filter((f) => /installLockGuard\(/.test(fs.readFileSync(f, "utf8")));
    expect(installers).toEqual([]);
  });
});
