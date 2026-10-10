// Last Updated: 2026-10-10

/**
 * `POST /api/encryption` must validate `projectId` before any side effect.
 *
 * The route joins a client-supplied `projectId` into a filesystem path for the
 * `enable` and `export` actions. These tests drive the real handler against a
 * real temporary directory (`GETWRITE_PROJECTS_DIR`) and snapshot the whole tree
 * — workspace root, keyring file, and a sibling directory outside the workspace
 * — before and after, so "nothing on disk changed" is a byte comparison and not
 * an inference from the response.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { __resetKeyringSessionForTests } from "../../src/lib/models/crypto/keyring-session";
import { __resetWriteBarriersForTests } from "../../src/lib/models/write-barrier";

const PASS = "correct horse battery staple";
const REAL_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

let base: string;
let workspace: string;
let sibling: string;
const previousProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

/** Maps every file under `root` to its size, mtime and bytes (hex). */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    out[path.relative(root, dir) + "/"] = "dir";
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const stat = fs.statSync(full);
        out[path.relative(root, full)] =
          `${stat.size}:${stat.mtimeMs}:${fs.readFileSync(full).toString("hex")}`;
      }
    }
  };
  walk(root);
  return out;
}

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("../../app/api/encryption/route");
  return POST(
    new Request("http://localhost/api/encryption", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "gw-enc-route-"));
  workspace = path.join(base, "ws");
  sibling = path.join(base, "sibling");
  fs.mkdirSync(path.join(workspace, REAL_ID, "resources", "r1"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(workspace, REAL_ID, "project.json"),
    `{"id":"${REAL_ID}","name":"Real"}`,
  );
  fs.writeFileSync(
    path.join(workspace, REAL_ID, "resources", "r1", "content.txt"),
    "chapter one",
  );
  fs.mkdirSync(path.join(sibling, "resources", "r1"), { recursive: true });
  fs.writeFileSync(
    path.join(sibling, "project.json"),
    '{"id":"sibling","name":"Sibling"}',
  );
  fs.writeFileSync(
    path.join(sibling, "resources", "r1", "content.txt"),
    "sibling prose",
  );
  process.env.GETWRITE_PROJECTS_DIR = workspace;
  __resetKeyringSessionForTests();
  __resetWriteBarriersForTests();
});

afterEach(() => {
  if (previousProjectsDir === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = previousProjectsDir;
  }
  __resetKeyringSessionForTests();
  __resetWriteBarriersForTests();
  fs.rmSync(base, { recursive: true, force: true });
});

/** Candidate ids, built lazily because some depend on the temp paths. */
function invalidIds(): Array<[string, unknown]> {
  return [
    ["traversal to a sibling", "../sibling"],
    ["absolute path", sibling],
    ["empty string", ""],
    ["null", null],
    ["number", 42],
    ["object", { a: 1 }],
    ["null byte", `${REAL_ID}\u0000x`],
    ["percent-encoded traversal", "..%2Fsibling"],
    ["percent-encoded dots", "%2e%2e%2fsibling"],
  ];
}

describe("POST /api/encryption enable rejects an invalid projectId", () => {
  for (const passphrase of [null, PASS]) {
    for (const [label, projectId] of invalidIds()) {
      it(`${label} (passphrase ${passphrase === null ? "null" : "set"})`, async () => {
        if (passphrase === null) {
          // A null passphrase relies on an already-unlocked session, so
          // establish one with a real project first.
          const setup = await post({
            action: "enable",
            projectId: REAL_ID,
            projectName: "Real",
            passphrase: PASS,
          });
          expect(setup.status).toBe(200);
        }
        const before = snapshot(base);

        const response = await post({
          action: "enable",
          projectId,
          projectName: "x",
          passphrase,
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid projectId" });
        expect(snapshot(base)).toEqual(before);
        expect(fs.existsSync(path.join(sibling, ".encrypted.json"))).toBe(
          false,
        );
        expect(fs.existsSync(path.join(workspace, ".encrypted.json"))).toBe(
          false,
        );
        // With no earlier setup (passphrase set) there must be no keyring at all.
        expect(
          fs.existsSync(path.join(workspace, ".getwrite-keyring.json")),
        ).toBe(passphrase === null);
      });
    }
  }

  it("a well-formed UUID naming no project fails and touches nothing outside the workspace", async () => {
    const siblingBefore = snapshot(sibling);

    const response = await post({
      action: "enable",
      projectId: UNKNOWN_ID,
      projectName: "x",
      passphrase: PASS,
    });

    // Measured: the keyring and name index inside the workspace are still
    // written for an id that names no project; that is existing behaviour for a
    // valid id and is out of scope here. What must hold is that it fails and
    // nothing outside the workspace, or at its root, is encrypted.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(snapshot(sibling)).toEqual(siblingBefore);
    expect(fs.existsSync(path.join(workspace, ".encrypted.json"))).toBe(false);
    expect(
      fs.existsSync(path.join(workspace, UNKNOWN_ID, ".encrypted.json")),
    ).toBe(false);
  });
});

describe("POST /api/encryption export rejects an invalid projectId", () => {
  for (const [label, projectId] of invalidIds()) {
    it(`${label}`, async () => {
      // A real encrypted project and an unlocked session, so a rejection here
      // is the id check and not "no keyring".
      const enabled = await post({
        action: "enable",
        projectId: REAL_ID,
        projectName: "Real",
        passphrase: PASS,
      });
      expect(enabled.status).toBe(200);
      const before = snapshot(base);

      const response = await post({ action: "export", projectId });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid projectId" });
      expect(snapshot(base)).toEqual(before);
    });
  }

  it("a well-formed UUID naming no project leaves the disk unchanged", async () => {
    await post({
      action: "enable",
      projectId: REAL_ID,
      projectName: "Real",
      passphrase: PASS,
    });
    const before = snapshot(base);

    const response = await post({ action: "export", projectId: UNKNOWN_ID });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(snapshot(base)).toEqual(before);
  });
});

describe("POST /api/encryption with a valid projectId", () => {
  it("still enables and exports a real project", async () => {
    const enabled = await post({
      action: "enable",
      projectId: REAL_ID,
      projectName: "Real",
      passphrase: PASS,
    });
    expect(enabled.status).toBe(200);
    expect(
      fs.existsSync(path.join(workspace, REAL_ID, ".encrypted.json")),
    ).toBe(true);

    const exported = await post({ action: "export", projectId: REAL_ID });
    expect(exported.status).toBe(200);
    const { exportedId } = (await exported.json()) as { exportedId: string };
    expect(
      fs.readFileSync(
        path.join(workspace, exportedId, "resources", "r1", "content.txt"),
        "utf-8",
      ),
    ).toBe("chapter one");
  });
});
