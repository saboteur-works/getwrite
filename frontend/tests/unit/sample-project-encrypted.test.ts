/**
 * Feature 121, Task 11 (test tooling, POS task_23e9c7df): the encrypted copy
 * option of `scripts/sample-project/generate.mjs`
 * (`--encrypted <passphrase-file>`). The passphrase is a throwaway value
 * written to a temp file; it is never put on the command line. Every project
 * lands in a temp directory.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ProjectLockedError,
  runInProjectContext,
} from "../../src/lib/models/crypto/adapter-selection";
import {
  __resetKeyringSessionForTests,
  getSessionKeyring,
  unlockSession,
} from "../../src/lib/models/crypto/keyring-session";
import { fetchResourceContentCore } from "../../src/lib/models/resource-crud-core";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(
  REPO_ROOT,
  "scripts",
  "sample-project",
  "generate.mjs",
);

interface EncryptedSummary {
  path: string;
  projectId: string;
  keyringFile: string;
}

interface Summary {
  path: string;
  projectId: string;
  seed: number;
  counts: Record<string, number>;
  merge: { crossFolder: { treeOrder: string[] } };
  encrypted?: EncryptedSummary;
}

const tmpDirs: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-sample-enc-"));
  tmpDirs.push(dir);
  return dir;
}

function runGenerator(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function listFiles(dir: string, rel = ""): string[] {
  return fs
    .readdirSync(path.join(dir, rel), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(dir, path.join(rel, e.name))
        : [path.join(rel, e.name)],
    );
}

describe("sample-project generator, encrypted copy", () => {
  // A throwaway value for this test only.
  const passphrase = `throwaway-${Math.random().toString(36).slice(2)}-pass`;
  let work: string;
  let out: string;
  let summary: Summary;
  let enc: EncryptedSummary;
  let rawStdout: string;
  let rawStderr: string;
  let documentId: string;
  const previousDir = process.env.GETWRITE_PROJECTS_DIR;

  beforeAll(() => {
    work = tmp();
    out = path.join(work, "plain");
    const passFile = path.join(work, "passphrase.txt");
    fs.writeFileSync(passFile, `${passphrase}\n`);
    const run = runGenerator(["--out", out, "--encrypted", passFile]);
    expect(run.status).toBe(0);
    rawStdout = run.stdout;
    rawStderr = run.stderr;
    const lines = run.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    summary = JSON.parse(lines[0]) as Summary;
    expect(summary.encrypted).toBeDefined();
    enc = summary.encrypted as EncryptedSummary;
    documentId = summary.merge.crossFolder.treeOrder[0];
  }, 300_000);

  afterAll(() => {
    __resetKeyringSessionForTests();
    if (previousDir === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousDir;
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("names the encrypted copy in the JSON line, in its own directory", () => {
    expect(enc.path).toBe(path.join(path.dirname(enc.path), enc.projectId));
    expect(path.dirname(enc.path)).not.toBe(out);
    expect(fs.existsSync(path.join(enc.path, ".encrypted.json"))).toBe(true);
    expect(fs.existsSync(enc.keyringFile)).toBe(true);
    // The keyring sits in the encrypted copy's workspace root, not the plain one.
    expect(path.dirname(enc.keyringFile)).toBe(path.dirname(enc.path));
    expect(fs.readdirSync(out)).toEqual([summary.projectId]);
    expect(fs.readdirSync(summary.path)).not.toContain(".encrypted.json");
  });

  it("leaves the unencrypted project readable as plain text", () => {
    const plain = fs.readFileSync(
      path.join(summary.path, "resources", documentId, "content.txt"),
      "utf8",
    );
    expect(plain.length).toBeGreaterThan(0);
  });

  it("does not hold the document text in plain form in the encrypted copy", () => {
    const plain = fs
      .readFileSync(
        path.join(summary.path, "resources", documentId, "content.txt"),
        "utf8",
      )
      .trim();
    const sealed = fs.readFileSync(
      path.join(enc.path, "resources", documentId, "content.txt"),
    );
    expect(sealed.includes(Buffer.from(plain))).toBe(false);
  });

  it("never prints the passphrase or writes it into either project", () => {
    expect(rawStdout).not.toContain(passphrase);
    expect(rawStderr).not.toContain(passphrase);
    for (const root of [summary.path, enc.path]) {
      for (const file of listFiles(root)) {
        const bytes = fs.readFileSync(path.join(root, file));
        expect(bytes.includes(Buffer.from(passphrase))).toBe(false);
      }
    }
  });

  it("raises the locked error for a read with no key, not an empty read", async () => {
    process.env.GETWRITE_PROJECTS_DIR = path.dirname(enc.path);
    await expect(
      runInProjectContext(enc.path, null, () =>
        fetchResourceContentCore(enc.projectId, documentId),
      ),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("returns the document text for a read with the key", async () => {
    process.env.GETWRITE_PROJECTS_DIR = path.dirname(enc.path);
    __resetKeyringSessionForTests();
    await unlockSession(passphrase, path.dirname(enc.path));
    const keyring = getSessionKeyring();
    expect(keyring).not.toBeNull();
    const result = await runInProjectContext(enc.path, keyring, () =>
      fetchResourceContentCore(enc.projectId, documentId),
    );
    const plain = fs
      .readFileSync(
        path.join(summary.path, "resources", documentId, "content.txt"),
        "utf8",
      )
      .trim();
    expect(JSON.stringify(result.resourceContent)).toContain(plain);
    expect(result.revisions.length).toBeGreaterThan(0);
  });

  it("adds no encrypted key and writes no second project without the option", () => {
    const plainOut = path.join(tmp(), "plain-only");
    const run = runGenerator(["--out", plainOut]);
    expect(run.status).toBe(0);
    const line = JSON.parse(run.stdout.trim()) as Record<string, unknown>;
    expect("encrypted" in line).toBe(false);
    expect(fs.existsSync(`${plainOut}-encrypted`)).toBe(false);
  }, 120_000);

  it("refuses a missing passphrase file before writing anything", () => {
    const target = path.join(tmp(), "missing-pass");
    const run = runGenerator([
      "--out",
      target,
      "--encrypted",
      path.join(work, "does-not-exist.txt"),
    ]);
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe("");
    expect(fs.existsSync(target)).toBe(false);
  });

  it("refuses an empty passphrase file before writing anything", () => {
    const empty = path.join(work, "empty.txt");
    fs.writeFileSync(empty, "\n");
    const target = path.join(tmp(), "empty-pass");
    const run = runGenerator(["--out", target, "--encrypted", empty]);
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe("");
    expect(fs.existsSync(target)).toBe(false);
  });
});
