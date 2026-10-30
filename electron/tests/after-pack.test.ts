/**
 * The electron-builder afterPack hook that removes dangling symlinks from the
 * packaged standalone server before the app is signed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  pruneDanglingSymlinks,
  standaloneNodeModulesDir,
} from "../scripts/after-pack.cjs";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-after-pack-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("pruneDanglingSymlinks", () => {
  it("removes a symlink whose target does not exist and keeps one that resolves", async () => {
    const hoisted = path.join(dir, ".pnpm", "node_modules");
    fs.mkdirSync(path.join(dir, ".pnpm", "react@19", "node_modules", "react"), {
      recursive: true,
    });
    fs.mkdirSync(hoisted, { recursive: true });
    fs.symlinkSync(
      "../react@19/node_modules/react",
      path.join(hoisted, "react"),
    );
    fs.symlinkSync(
      "../scheduler@0.27.0/node_modules/scheduler",
      path.join(hoisted, "scheduler"),
    );

    const removed = await pruneDanglingSymlinks(dir);

    expect(removed).toEqual([path.join(hoisted, "scheduler")]);
    expect(fs.existsSync(path.join(hoisted, "react"))).toBe(true);
    expect(() => fs.lstatSync(path.join(hoisted, "scheduler"))).toThrow();
  });

  it("does not descend through a symlinked directory", async () => {
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    fs.symlinkSync("missing", path.join(real, "broken"));
    fs.mkdirSync(path.join(dir, "tree"));
    fs.symlinkSync(real, path.join(dir, "tree", "link-to-real"));

    const removed = await pruneDanglingSymlinks(path.join(dir, "tree"));

    expect(removed).toEqual([]);
    expect(fs.lstatSync(path.join(real, "broken")).isSymbolicLink()).toBe(true);
  });

  it("returns nothing when the directory does not exist", async () => {
    expect(await pruneDanglingSymlinks(path.join(dir, "absent"))).toEqual([]);
  });
});

describe("standaloneNodeModulesDir", () => {
  const packager = { appInfo: { productFilename: "GetWrite" } };

  it("points inside the .app bundle on macOS", () => {
    expect(
      standaloneNodeModulesDir({
        appOutDir: "/out/mac",
        electronPlatformName: "darwin",
        packager,
      }),
    ).toBe(
      "/out/mac/GetWrite.app/Contents/Resources/frontend/.next/standalone/node_modules",
    );
  });

  it("points at resources/ on Windows and Linux", () => {
    expect(
      standaloneNodeModulesDir({
        appOutDir: "/out/linux",
        electronPlatformName: "linux",
        packager,
      }),
    ).toBe("/out/linux/resources/frontend/.next/standalone/node_modules");
  });
});
