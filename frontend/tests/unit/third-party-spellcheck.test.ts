// Last Updated: 2026-10-25

/**
 * Spell checker, Task 51 (FR-44, AC-18): THIRD_PARTY_SPELLCHECK.txt names every
 * shipped spell-check package with its installed version and the first line of
 * its installed licence file, carries each distinct licence text once, names no
 * package that is neither a frontend dependency nor on the explicit
 * BUNDLED_TRANSITIVE allowlist (is-buffer, bundled into the worker), and exists at the repo root and at
 * frontend/public/. electron-builder.yml ships it as an extraResources entry.
 * Presence in the build outputs is Task 52's check.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(FRONTEND, "..");
const ROOT_FILE = path.join(REPO_ROOT, "THIRD_PARTY_SPELLCHECK.txt");
const PUBLIC_FILE = path.join(FRONTEND, "public", "THIRD_PARTY_SPELLCHECK.txt");
const BUILDER_YML = path.join(REPO_ROOT, "electron", "electron-builder.yml");

/** The spell-check packages that ship: the engine and its dictionary. */
const SHIPPED = ["nspell", "dictionary-en"] as const;

/**
 * Packages that are not frontend dependencies but are bundled into the
 * spell-check worker script, so the notice must name them. Package name ->
 * the licence expression its installed package.json must carry. Each is found
 * beside the shipped package that depends on it. A package named in the notice
 * is accepted only if it is a frontend dependency or is listed here.
 */
const BUNDLED_TRANSITIVE: Readonly<Record<string, string>> = {
  "is-buffer": "MIT",
};

/** The shipped package whose dependency each BUNDLED_TRANSITIVE entry is. */
const BUNDLED_VIA = "nspell";

interface InstalledPackage {
  readonly version: string;
  readonly license: string;
  readonly licenseFirstLine: string;
  readonly licenseText: string;
}

const dependencies: Record<string, string> = (
  JSON.parse(readFileSync(path.join(FRONTEND, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  }
).dependencies;

function installedAt(dir: string, name: string): InstalledPackage {
  const { version, license } = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as { version: string; license: string };
  const file = readdirSync(dir).find((f) =>
    /^licen[cs]e(\.(md|txt))?$/i.test(f),
  );
  if (file === undefined) {
    throw new Error(`No licence file in the installed ${name}`);
  }
  const licenseText = readFileSync(path.join(dir, file), "utf8");
  const first = licenseText.split("\n")[0]?.trim();
  if (first === undefined || first.length === 0) {
    throw new Error(`No first line in the licence file of ${name}`);
  }
  return {
    version,
    license,
    licenseFirstLine: first,
    licenseText: licenseText.trim(),
  };
}

function installed(name: string): InstalledPackage {
  return installedAt(path.join(FRONTEND, "node_modules", name), name);
}

/** The installed copy of a bundled transitive package, beside its parent. */
function installedTransitive(name: string): InstalledPackage {
  const parent = realpathSync(path.join(FRONTEND, "node_modules", BUNDLED_VIA));
  return installedAt(path.join(path.dirname(parent), name), name);
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

  it("names every allowlisted bundled package with its installed version, licence expression and licence first line", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    for (const [name, expected] of Object.entries(BUNDLED_TRANSITIVE)) {
      const pkg = installedTransitive(name);
      expect(pkg.license, `${name} installed licence expression`).toBe(
        expected,
      );
      const section = sectionOf(text, name);
      expect(section).toContain(`Package: ${name}@${pkg.version}\n`);
      expect(section).toContain(`Licence: ${expected}\n`);
      expect(text, `${name} licence first line`).toContain(
        pkg.licenseFirstLine,
      );
    }
  });

  it("carries each distinct licence text exactly once", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    const packages = [
      ...SHIPPED.map((name) => installed(name)),
      ...Object.keys(BUNDLED_TRANSITIVE).map((n) => installedTransitive(n)),
    ];
    const distinct = new Set(packages.map((p) => p.licenseText));
    for (const licenseText of distinct) {
      expect(countOf(text, licenseText), "licence text").toBe(1);
    }
    expect(countOf(text, "\nLicence text: ")).toBe(distinct.size);
  });

  it("names only frontend dependencies or allowlisted bundled packages", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    const named = [...text.matchAll(/^Package: (\S+)@\S+$/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      const isAllowed =
        Object.hasOwn(dependencies, name) ||
        Object.hasOwn(BUNDLED_TRANSITIVE, name);
      expect(
        isAllowed,
        `${name} is named but is neither a dependency nor allowlisted`,
      ).toBe(true);
    }
  });

  it("electron-builder.yml ships it as an extraResources entry", () => {
    const yml = readFileSync(BUILDER_YML, "utf8");
    const extra = yml.slice(yml.indexOf("extraResources:"));
    expect(extra).toContain("from: ../THIRD_PARTY_SPELLCHECK.txt");
    expect(extra).toContain("to: THIRD_PARTY_SPELLCHECK.txt");
  });
});
