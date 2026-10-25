// Last Updated: 2026-10-25

/**
 * Spell checker, Task 51 (FR-44, AC-18): THIRD_PARTY_SPELLCHECK.txt names every
 * shipped spell-check package with its installed version and the first line of
 * its installed licence file, carries each distinct licence text once, names no
 * package that is not a frontend dependency, and exists at the repo root and at
 * frontend/public/. electron-builder.yml ships it as an extraResources entry.
 * Presence in the build outputs is Task 52's check.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(FRONTEND, "..");
const ROOT_FILE = path.join(REPO_ROOT, "THIRD_PARTY_SPELLCHECK.txt");
const PUBLIC_FILE = path.join(FRONTEND, "public", "THIRD_PARTY_SPELLCHECK.txt");
const BUILDER_YML = path.join(REPO_ROOT, "electron", "electron-builder.yml");

/** The spell-check packages that ship: the engine and its dictionary. */
const SHIPPED = ["nspell", "dictionary-en"] as const;

interface InstalledPackage {
  readonly version: string;
  readonly licenseFirstLine: string;
  readonly licenseText: string;
}

const dependencies: Record<string, string> = (
  JSON.parse(readFileSync(path.join(FRONTEND, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  }
).dependencies;

function installed(name: string): InstalledPackage {
  const dir = path.join(FRONTEND, "node_modules", name);
  const { version } = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as { version: string };
  const licenseText = readFileSync(path.join(dir, "license"), "utf8");
  const first = licenseText.split("\n")[0]?.trim();
  if (first === undefined || first.length === 0) {
    throw new Error(`No first line in the licence file of ${name}`);
  }
  return { version, licenseFirstLine: first, licenseText: licenseText.trim() };
}

function sectionOf(text: string, name: string): string {
  const header = `Package: ${name}@`;
  const start = text.indexOf(header);
  expect(start, `${name} section`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\nPackage: ", start + header.length);
  return text.slice(start, next === -1 ? undefined : next);
}

const countOf = (text: string, needle: string): number =>
  text.split(needle).length - 1;

describe("THIRD_PARTY_SPELLCHECK.txt (FR-44, AC-18)", () => {
  it("exists at the repo root and at the public path", () => {
    expect(existsSync(ROOT_FILE)).toBe(true);
    expect(existsSync(PUBLIC_FILE)).toBe(true);
  });

  it("the public copy is identical to the root file", () => {
    expect(readFileSync(PUBLIC_FILE, "utf8")).toBe(
      readFileSync(ROOT_FILE, "utf8"),
    );
  });

  it("every shipped package is a frontend dependency", () => {
    for (const name of SHIPPED) {
      expect(dependencies, name).toHaveProperty(name);
    }
  });

  it("names every shipped package with its installed version and licence first line", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    for (const name of SHIPPED) {
      const pkg = installed(name);
      const section = sectionOf(text, name);
      expect(section).toContain(`Package: ${name}@${pkg.version}\n`);
      expect(text, `${name} licence first line`).toContain(
        pkg.licenseFirstLine,
      );
    }
  });

  it("carries each distinct licence text exactly once", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    for (const name of SHIPPED) {
      const pkg = installed(name);
      expect(countOf(text, pkg.licenseText), `${name} licence text`).toBe(1);
    }
    expect(countOf(text, "\nLicence text: ")).toBe(SHIPPED.length);
  });

  it("names no package that is absent from frontend dependencies", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    const named = [...text.matchAll(/^Package: (\S+)@\S+$/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(
        dependencies,
        `${name} is named but not a dependency`,
      ).toHaveProperty(name);
    }
  });

  it("electron-builder.yml ships it as an extraResources entry", () => {
    const yml = readFileSync(BUILDER_YML, "utf8");
    const extra = yml.slice(yml.indexOf("extraResources:"));
    expect(extra).toContain("from: ../THIRD_PARTY_SPELLCHECK.txt");
    expect(extra).toContain("to: THIRD_PARTY_SPELLCHECK.txt");
  });
});
