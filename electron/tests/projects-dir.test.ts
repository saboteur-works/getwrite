// Last Updated: 2026-08-06

/**
 * The desktop build's projects directory, and the rescue of projects an earlier
 * build put inside the app bundle.
 *
 * This is data-loss-adjacent code — the bug it fixes destroyed every project a
 * user had, silently, on a routine drag-to-Applications update — so the
 * migration is exercised against a real filesystem rather than a mock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  clearConfiguredProjectsDir,
  defaultProjectsDir,
  ensureProjectsDir,
  legacyProjectsDirs,
  migrateLegacyProjectsDir,
  readConfiguredProjectsDir,
  readGlobalNoiseWords,
  readSharingEnabled,
  resolveProjectsDir,
  validateWorkspaceDir,
  writeConfiguredProjectsDir,
  writeGlobalNoiseWords,
  writeSharingEnabled,
  type ProjectsDirEnvironment,
} from "../src/projects-dir";

let root: string;
let legacy: string;
let destination: string;

/**
 * Writes a file, creating its parents.
 *
 * @param target - File path.
 * @param contents - File contents.
 */
function write(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "getwrite-projects-dir-"));
  legacy = path.join(root, "bundle", "projects");
  userDataDir = path.join(root, "userData");
  destination = path.join(root, "userData", "projects");
  fs.mkdirSync(destination, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let userDataDir: string;

/**
 * Builds a packaged-build environment rooted in the test's temp directory.
 *
 * @param overrides - Fields to replace.
 * @returns A complete environment.
 */
function packagedEnv(
  overrides: Partial<ProjectsDirEnvironment> = {},
): ProjectsDirEnvironment {
  return {
    isPackaged: true,
    documentsDir: path.join(root, "Documents"),
    userDataDir,
    resourcesPath: path.join(root, "bundle"),
    repoRoot: path.join(root, "repo"),
    ...overrides,
  };
}

describe("defaultProjectsDir", () => {
  it("puts a packaged build's projects somewhere the user can find them", () => {
    const environment = packagedEnv();

    const resolved = defaultProjectsDir(environment);

    // Documents, not userData: a manuscript is the user's document, and
    // ~/Library is hidden by default on macOS. A writer who cannot find their
    // own work cannot back it up either.
    expect(resolved).toBe(path.join(environment.documentsDir, "GetWrite"));
    // And emphatically not inside the app bundle, which an update replaces.
    expect(resolved).not.toContain(environment.resourcesPath);
  });

  it("leaves development builds on the repo's projects directory", () => {
    const resolved = defaultProjectsDir(
      packagedEnv({ isPackaged: false, repoRoot: "/repo" }),
    );

    // Every contributor's working copy expects this; the fix must not move it.
    expect(resolved).toBe(path.join("/repo", "projects"));
  });

  it("knows every location an older build may have used", () => {
    const environment = packagedEnv();

    expect(legacyProjectsDirs(environment)).toEqual([
      path.join(environment.resourcesPath, "projects"),
      path.join(environment.userDataDir, "projects"),
    ]);
  });
});

describe("the configured workspace location", () => {
  it("defaults to Documents when the user has chosen nothing", () => {
    expect(resolveProjectsDir(packagedEnv())).toBe(
      defaultProjectsDir(packagedEnv()),
    );
  });

  it("honours a recorded choice", () => {
    const chosen = path.join(root, "elsewhere", "Novels");
    writeConfiguredProjectsDir(userDataDir, chosen);

    expect(readConfiguredProjectsDir(userDataDir)).toBe(chosen);
    expect(resolveProjectsDir(packagedEnv())).toBe(chosen);
  });

  it("returns to the default once the choice is cleared", () => {
    writeConfiguredProjectsDir(userDataDir, path.join(root, "elsewhere"));
    clearConfiguredProjectsDir(userDataDir);

    expect(resolveProjectsDir(packagedEnv())).toBe(
      defaultProjectsDir(packagedEnv()),
    );
  });

  it("treats a corrupt config as no choice at all", () => {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, "workspace.json"), "{not json");

    // Refusing to start because a preferences file is damaged would be a much
    // worse failure than quietly using the default.
    expect(readConfiguredProjectsDir(userDataDir)).toBeNull();
    expect(resolveProjectsDir(packagedEnv())).toBe(
      defaultProjectsDir(packagedEnv()),
    );
  });

  it("ignores a recorded choice in development builds", () => {
    writeConfiguredProjectsDir(userDataDir, path.join(root, "elsewhere"));

    expect(
      resolveProjectsDir(packagedEnv({ isPackaged: false, repoRoot: "/repo" })),
    ).toBe(path.join("/repo", "projects"));
  });
});

describe("the global noise-word list", () => {
  it("is empty when nothing has been recorded yet", () => {
    expect(readGlobalNoiseWords(userDataDir)).toEqual([]);
  });

  it("persists a recorded list and reflects it back", () => {
    writeGlobalNoiseWords(userDataDir, ["said", "look", "time"]);

    expect(readGlobalNoiseWords(userDataDir)).toEqual(["said", "look", "time"]);
  });

  it("overwrites a previously recorded list with the new one", () => {
    writeGlobalNoiseWords(userDataDir, ["said"]);
    writeGlobalNoiseWords(userDataDir, ["look", "time"]);

    expect(readGlobalNoiseWords(userDataDir)).toEqual(["look", "time"]);
  });

  it("treats a corrupt config as no list at all", () => {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, "workspace.json"), "{not json");

    expect(readGlobalNoiseWords(userDataDir)).toEqual([]);
  });

  it("does not clobber a workspace-location override already on disk", () => {
    const chosen = path.join(root, "elsewhere", "Novels");
    writeConfiguredProjectsDir(userDataDir, chosen);

    writeGlobalNoiseWords(userDataDir, ["said"]);

    expect(readConfiguredProjectsDir(userDataDir)).toBe(chosen);
    expect(readGlobalNoiseWords(userDataDir)).toEqual(["said"]);
  });

  it("does not clobber a global noise-word list already on disk when the workspace location is set", () => {
    writeGlobalNoiseWords(userDataDir, ["said", "look"]);

    const chosen = path.join(root, "elsewhere", "Novels");
    writeConfiguredProjectsDir(userDataDir, chosen);

    expect(readGlobalNoiseWords(userDataDir)).toEqual(["said", "look"]);
    expect(readConfiguredProjectsDir(userDataDir)).toBe(chosen);
  });

  it("throws rather than silently losing the write when userData is unwritable", () => {
    // `getwrite:global-noise-words-set`'s `ipcMain.handle` catches this throw
    // and turns it into `{ ok: false, message }`, mirroring
    // `choose-workspace-dir`'s own try/catch around a write failure — the
    // part this test exercises is the underlying throw it depends on.
    const readOnlyUserData = path.join(root, "read-only-user-data");
    fs.mkdirSync(path.dirname(readOnlyUserData), { recursive: true });
    fs.mkdirSync(readOnlyUserData, { recursive: true });
    fs.chmodSync(readOnlyUserData, 0o555);

    try {
      expect(() => writeGlobalNoiseWords(readOnlyUserData, ["said"])).toThrow();
    } finally {
      fs.chmodSync(readOnlyUserData, 0o755);
    }
  });
});

describe("the sharing setting", () => {
  const configFile = (): string => path.join(userDataDir, "workspace.json");

  it("reads as off for a fresh userData directory", () => {
    expect(readSharingEnabled(userDataDir)).toBe(false);
  });

  it("reads as off for an empty object", () => {
    write(configFile(), "{}");
    expect(readSharingEnabled(userDataDir)).toBe(false);
  });

  it("reads as off for a corrupt file", () => {
    write(configFile(), "{not json");
    expect(readSharingEnabled(userDataDir)).toBe(false);
  });

  it.each(['"true"', "1", "null", '"yes"'])(
    "reads as off for the non-boolean value %s",
    (value) => {
      write(configFile(), `{"sharingEnabled": ${value}}`);
      expect(readSharingEnabled(userDataDir)).toBe(false);
    },
  );

  it("reads as on only for true", () => {
    write(configFile(), '{"sharingEnabled": true}');
    expect(readSharingEnabled(userDataDir)).toBe(true);
  });

  it("round-trips and keeps projectsDir and globalNoiseWords unchanged", () => {
    const chosen = path.join(root, "elsewhere");
    writeConfiguredProjectsDir(userDataDir, chosen);
    writeGlobalNoiseWords(userDataDir, ["alpha", "beta"]);

    writeSharingEnabled(userDataDir, true);

    expect(readSharingEnabled(userDataDir)).toBe(true);
    expect(readConfiguredProjectsDir(userDataDir)).toBe(chosen);
    expect(readGlobalNoiseWords(userDataDir)).toEqual(["alpha", "beta"]);

    writeSharingEnabled(userDataDir, false);
    expect(readSharingEnabled(userDataDir)).toBe(false);
    expect(readConfiguredProjectsDir(userDataDir)).toBe(chosen);
  });

  it("is unchanged by setting or clearing the workspace folder (FR-5)", () => {
    writeSharingEnabled(userDataDir, true);

    writeConfiguredProjectsDir(userDataDir, path.join(root, "one"));
    expect(readSharingEnabled(userDataDir)).toBe(true);

    clearConfiguredProjectsDir(userDataDir);
    expect(readSharingEnabled(userDataDir)).toBe(true);
  });
});

describe("writing workspace.json atomically (Feature 88, FR-12 to FR-15)", () => {
  const configFile = (): string => path.join(userDataDir, "workspace.json");
  const known = `${JSON.stringify({ projectsDir: "/known/place", sharingEnabled: true }, null, 2)}\n`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Lists userData, ignoring the `projects` directory the fixture creates. */
  function entriesBesidesProjects(): string[] {
    return fs.readdirSync(userDataDir).filter((name) => name !== "projects");
  }

  /**
   * Replaces the file write with one that writes the first half of the body
   * to the path it was given and then throws.
   */
  function failPartWayThroughWrite(): void {
    const realWrite = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((
      target: fs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
    ) => {
      const body = String(data);
      realWrite(target, body.slice(0, Math.floor(body.length / 2)));
      throw new Error("injected write failure");
    }) as typeof fs.writeFileSync);
  }

  it("leaves the existing bytes unchanged when the write fails part-way", () => {
    write(configFile(), known);
    failPartWayThroughWrite();

    expect(() => writeGlobalNoiseWords(userDataDir, ["said", "look"])).toThrow(
      "injected write failure",
    );
    vi.restoreAllMocks();

    expect(fs.readFileSync(configFile(), "utf8")).toBe(known);
  });

  it("leaves no temporary file after a successful write", () => {
    write(configFile(), known);

    writeGlobalNoiseWords(userDataDir, ["said"]);

    expect(entriesBesidesProjects()).toEqual(["workspace.json"]);
  });

  it("leaves no temporary file after a failed write", () => {
    write(configFile(), known);
    failPartWayThroughWrite();

    expect(() => writeGlobalNoiseWords(userDataDir, ["said"])).toThrow();
    vi.restoreAllMocks();

    expect(entriesBesidesProjects()).toEqual(["workspace.json"]);
  });

  it("writes the file with the process default mode, not 0600", () => {
    fs.mkdirSync(userDataDir, { recursive: true });
    const baseline = path.join(userDataDir, "baseline.txt");
    fs.writeFileSync(baseline, "x");
    const defaultMode = fs.statSync(baseline).mode & 0o777;
    fs.rmSync(baseline);

    writeSharingEnabled(userDataDir, true);

    expect(fs.statSync(configFile()).mode & 0o777).toBe(defaultMode);
  });

  it("keeps only the field being set after a damaged file reads as empty", () => {
    write(configFile(), "{not json");

    writeSharingEnabled(userDataDir, true);

    expect(JSON.parse(fs.readFileSync(configFile(), "utf8"))).toEqual({
      sharingEnabled: true,
    });
  });

  it("keeps the two-space JSON format with a trailing newline", () => {
    writeSharingEnabled(userDataDir, true);

    expect(fs.readFileSync(configFile(), "utf8")).toBe(
      `${JSON.stringify({ sharingEnabled: true }, null, 2)}\n`,
    );
  });

  it("preserves the other fields when one is set", () => {
    write(configFile(), known);

    writeGlobalNoiseWords(userDataDir, ["said"]);

    expect(JSON.parse(fs.readFileSync(configFile(), "utf8"))).toEqual({
      projectsDir: "/known/place",
      sharingEnabled: true,
      globalNoiseWords: ["said"],
    });
  });
});

describe("durability and mode of the workspace.json replacement (Feature 88, Task 17)", () => {
  const configFile = (): string => path.join(userDataDir, "workspace.json");
  const known = `${JSON.stringify({ projectsDir: "/known/place" }, null, 2)}\n`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Passes every call through to the real fs and records the order of the ones that matter. */
  function recordCalls(): string[] {
    const events: string[] = [];
    const paths = new Map<number, string>();
    const label = (fd: number): string =>
      paths.get(fd) === userDataDir ? "dir" : "tmp";
    const realOpen = fs.openSync.bind(fs);
    const realWrite = fs.writeFileSync.bind(fs);
    const realFsync = fs.fsyncSync.bind(fs);
    const realClose = fs.closeSync.bind(fs);
    const realRename = fs.renameSync.bind(fs);
    vi.spyOn(fs, "openSync").mockImplementation(((
      target: fs.PathLike,
      flags?: fs.OpenMode,
      mode?: fs.Mode | null,
    ) => {
      const fd = realOpen(target, flags, mode);
      paths.set(fd, String(target));
      return fd;
    }) as typeof fs.openSync);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((
      target: fs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
    ) => {
      events.push("write");
      realWrite(target, data);
    }) as typeof fs.writeFileSync);
    vi.spyOn(fs, "fsyncSync").mockImplementation(((fd: number) => {
      events.push(`fsync:${label(fd)}`);
      realFsync(fd);
    }) as typeof fs.fsyncSync);
    vi.spyOn(fs, "closeSync").mockImplementation(((fd: number) => {
      events.push(`close:${label(fd)}`);
      realClose(fd);
    }) as typeof fs.closeSync);
    vi.spyOn(fs, "renameSync").mockImplementation(((
      from: fs.PathLike,
      to: fs.PathLike,
    ) => {
      events.push("rename");
      realRename(from, to);
    }) as typeof fs.renameSync);
    return events;
  }

  function leftovers(): string[] {
    return fs.readdirSync(userDataDir).filter((n) => n !== "projects");
  }

  it("calls write, fsync of the temporary file, close, rename, fsync of the directory, in that order", () => {
    write(configFile(), known);
    const events = recordCalls();

    writeSharingEnabled(userDataDir, true);

    expect(events).toEqual([
      "write",
      "fsync:tmp",
      "close:tmp",
      "rename",
      "fsync:dir",
      "close:dir",
    ]);
  });

  it("still succeeds, with the new content in place, when opening the directory throws", () => {
    write(configFile(), known);
    const realOpen = fs.openSync.bind(fs);
    vi.spyOn(fs, "openSync").mockImplementation(((
      target: fs.PathLike,
      flags?: fs.OpenMode,
      mode?: fs.Mode | null,
    ) => {
      if (String(target) === userDataDir) throw new Error("injected dir open");
      return realOpen(target, flags, mode);
    }) as typeof fs.openSync);

    expect(() => writeSharingEnabled(userDataDir, true)).not.toThrow();
    vi.restoreAllMocks();

    expect(JSON.parse(fs.readFileSync(configFile(), "utf8"))).toEqual({
      projectsDir: "/known/place",
      sharingEnabled: true,
    });
    expect(leftovers()).toEqual(["workspace.json"]);
  });

  it("still succeeds, with the new content in place, when fsync of the directory throws", () => {
    write(configFile(), known);
    const events = recordCalls();
    const fsyncSpy = vi.mocked(fs.fsyncSync);
    const recording = fsyncSpy.getMockImplementation() as (fd: number) => void;
    let calls = 0;
    fsyncSpy.mockImplementation(((fd: number) => {
      calls += 1;
      if (calls === 2) throw new Error("injected dir fsync");
      recording(fd);
    }) as typeof fs.fsyncSync);

    expect(() => writeSharingEnabled(userDataDir, true)).not.toThrow();
    expect(events).toContain("rename");
    vi.restoreAllMocks();

    expect(JSON.parse(fs.readFileSync(configFile(), "utf8"))).toEqual({
      projectsDir: "/known/place",
      sharingEnabled: true,
    });
  });

  it("fails the write, keeps the old bytes and leaves no temporary file when fsync of the temporary file throws", () => {
    write(configFile(), known);
    vi.spyOn(fs, "fsyncSync").mockImplementation(() => {
      throw new Error("injected tmp fsync");
    });

    expect(() => writeSharingEnabled(userDataDir, true)).toThrow(
      "injected tmp fsync",
    );
    vi.restoreAllMocks();

    expect(fs.readFileSync(configFile(), "utf8")).toBe(known);
    expect(leftovers()).toEqual(["workspace.json"]);
  });

  it.each([0o600, 0o644])(
    "keeps an existing file's mode %o across a write",
    (mode) => {
      write(configFile(), known);
      fs.chmodSync(configFile(), mode);

      writeSharingEnabled(userDataDir, true);

      expect(fs.statSync(configFile()).mode & 0o777).toBe(mode);
    },
  );

  it("gives a file that did not exist the process default mode, not 0600", () => {
    fs.mkdirSync(userDataDir, { recursive: true });
    const baseline = path.join(userDataDir, "baseline.txt");
    fs.writeFileSync(baseline, "x");
    const defaultMode = fs.statSync(baseline).mode & 0o777;
    fs.rmSync(baseline);

    writeSharingEnabled(userDataDir, true);

    expect(fs.statSync(configFile()).mode & 0o777).toBe(defaultMode);
    expect(defaultMode).not.toBe(0o600);
  });

  it("fails the write, keeping the old content, when stat fails for a reason other than not found", () => {
    write(configFile(), known);
    const realStat = fs.statSync.bind(fs);
    vi.spyOn(fs, "statSync").mockImplementation(((
      target: fs.PathLike,
      options?: fs.StatSyncOptions,
    ) => {
      if (String(target) === configFile()) {
        throw Object.assign(new Error("injected stat"), { code: "EACCES" });
      }
      return realStat(target, options);
    }) as typeof fs.statSync);

    expect(() => writeSharingEnabled(userDataDir, true)).toThrow(
      "injected stat",
    );
    vi.restoreAllMocks();

    expect(fs.readFileSync(configFile(), "utf8")).toBe(known);
    expect(leftovers()).toEqual(["workspace.json"]);
  });
});

describe("validateWorkspaceDir", () => {
  it("accepts a writable folder", () => {
    expect(
      validateWorkspaceDir(path.join(root, "somewhere"), packagedEnv()),
    ).toEqual({ ok: true });
  });

  it("refuses a relative path", () => {
    const result = validateWorkspaceDir("./projects", packagedEnv());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("not-absolute");
  });

  it("refuses a folder inside the app bundle", () => {
    const environment = packagedEnv();
    const inside = path.join(environment.resourcesPath, "projects");

    const result = validateWorkspaceDir(inside, environment);

    // This is the exact mistake the module exists to undo. A user must not be
    // able to re-create it by hand, however deliberately.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("inside-app-bundle");
    expect(result.ok === false && result.message).toMatch(/delete/i);
  });
});

describe("migrateLegacyProjectsDir", () => {
  it("moves projects out of the bundle", () => {
    write(path.join(legacy, "project-a", "project.json"), '{"name":"A"}');
    write(path.join(legacy, "project-b", "project.json"), '{"name":"B"}');

    const result = migrateLegacyProjectsDir(legacy, destination);

    expect(result).toEqual({ moved: 2, kept: 0, failed: 0 });
    expect(
      fs.readFileSync(
        path.join(destination, "project-a", "project.json"),
        "utf8",
      ),
    ).toBe('{"name":"A"}');
    // Moved, not copied: nothing is left behind to be lost or to confuse.
    expect(fs.existsSync(path.join(legacy, "project-a"))).toBe(false);
  });

  it("carries the keyring and name index, not just the projects", () => {
    write(path.join(legacy, ".getwrite-keyring.json"), '{"version":1}');
    write(path.join(legacy, ".getwrite-names"), "sealed-bytes");
    write(path.join(legacy, "project-a", "project.json"), "{}");

    migrateLegacyProjectsDir(legacy, destination);

    // An encrypted workspace whose keyring was left behind is unrecoverable
    // ciphertext, not a missing file.
    expect(
      fs.existsSync(path.join(destination, ".getwrite-keyring.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(destination, ".getwrite-names"))).toBe(true);
  });

  it("never overwrites what is already in the destination", () => {
    write(path.join(legacy, "project-a", "project.json"), '{"name":"stale"}');
    write(
      path.join(destination, "project-a", "project.json"),
      '{"name":"live"}',
    );

    const result = migrateLegacyProjectsDir(legacy, destination);

    // The destination is the live workspace. A stale copy from inside the
    // bundle must never clobber it.
    expect(result).toEqual({ moved: 0, kept: 1, failed: 0 });
    expect(
      fs.readFileSync(
        path.join(destination, "project-a", "project.json"),
        "utf8",
      ),
    ).toBe('{"name":"live"}');
  });

  it("is a no-op when there is nothing left to move", () => {
    expect(migrateLegacyProjectsDir(legacy, destination)).toEqual({
      moved: 0,
      kept: 0,
      failed: 0,
    });

    fs.mkdirSync(legacy, { recursive: true });
    expect(migrateLegacyProjectsDir(legacy, destination)).toEqual({
      moved: 0,
      kept: 0,
      failed: 0,
    });
  });

  it("can run on every launch without re-migrating", () => {
    write(path.join(legacy, "project-a", "project.json"), "{}");

    expect(migrateLegacyProjectsDir(legacy, destination).moved).toBe(1);
    // The legacy directory's own emptiness is the "already migrated" flag —
    // there is no separate marker that could disagree with the filesystem.
    expect(migrateLegacyProjectsDir(legacy, destination)).toEqual({
      moved: 0,
      kept: 0,
      failed: 0,
    });
    expect(
      fs.existsSync(path.join(destination, "project-a", "project.json")),
    ).toBe(true);
  });

  it("refuses to migrate a directory onto itself", () => {
    write(path.join(destination, "project-a", "project.json"), "{}");

    expect(migrateLegacyProjectsDir(destination, destination)).toEqual({
      moved: 0,
      kept: 0,
      failed: 0,
    });
    expect(
      fs.existsSync(path.join(destination, "project-a", "project.json")),
    ).toBe(true);
  });

  it("reports what it did", () => {
    write(path.join(legacy, "project-a", "project.json"), "{}");
    const lines: string[] = [];

    migrateLegacyProjectsDir(legacy, destination, (message) =>
      lines.push(message),
    );

    // Silent data movement is not acceptable here; the log is the only record
    // a user or a support request can appeal to.
    expect(lines.join("\n")).toMatch(/migrat/i);
  });
});

describe("ensureProjectsDir", () => {
  it("creates the directory and its parents", () => {
    const target = path.join(root, "deep", "nested", "GetWrite");

    ensureProjectsDir(target);

    expect(fs.existsSync(target)).toBe(true);
  });

  it("is happy when the directory already exists", () => {
    expect(() => ensureProjectsDir(destination)).not.toThrow();
  });

  it("names the path and the cause when it cannot create the folder", () => {
    const readOnly = path.join(root, "read-only");
    fs.mkdirSync(readOnly, { recursive: true });
    fs.chmodSync(readOnly, 0o555);
    const target = path.join(readOnly, "GetWrite");

    // The raw mkdirSync throw this replaces ran before the window existed, so
    // it killed app.whenReady() and left the user with no window and no
    // dialog. The Linux AppImage hit exactly that, from a read-only SquashFS
    // mount, on every launch since the first release.
    try {
      expect(() => ensureProjectsDir(target)).toThrow(/could not create/i);
      expect(() => ensureProjectsDir(target)).toThrow(
        new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } finally {
      fs.chmodSync(readOnly, 0o755);
    }
  });
});
