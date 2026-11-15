#!/usr/bin/env node
// FR-1 (b) and (f) fidelity harness, Feature 116 Task 3.
//
// Usage:
//   node scripts/citations-engine-fidelity.mjs <candidate> <style-id> \
//     --style-file <path.csl> --locale-file <locales-en-US.xml> [--out <file>] [--fixture <file>]
//
// <candidate> is "citeproc-js" (candidate A) or "hayagriva" (candidate B).
// <style-id> is a label recorded with the output; the CSL text comes from --style-file.
//
// Candidates and the reference processor (citeproc-js, package "citeproc") are imported
// dynamically. When a needed package is not present the script exits non-zero (code 2)
// with a message naming it. It never reports a pass for a candidate it did not run.
//
// Candidate "hayagriva" must resolve a package that exports
//   renderCitations(items, citations, styleXml, localeXml) -> { citations: string[], bibliography: string[] }
// The package name is read from GETWRITE_HAYAGRIVA_PACKAGE, default "hayagriva-wasm".
// A package without that export exits with code 3, naming the missing export.
//
// Only whitespace and markup are normalised before comparing. Every difference is written
// verbatim (raw and normalised). Exit 0 means no difference was found, 1 means differences
// were found, 2 a missing package, 3 bad input. Judging differences is the owner's.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EXIT_DIFFERENCES = 1;
const EXIT_MISSING_PACKAGE = 2;
const EXIT_BAD_INPUT = 3;

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(EXIT_BAD_INPUT, `Flag ${arg} needs a value.`);
      }
      flags[arg.slice(2)] = value;
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function importOrExit(packageName, role) {
  try {
    return await import(packageName);
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      fail(
        EXIT_MISSING_PACKAGE,
        `Missing package "${packageName}" (${role}). Nothing was rendered and this is not a pass. Installing it is an owner step.`,
      );
    }
    fail(
      EXIT_BAD_INPUT,
      `Package "${packageName}" (${role}) is present but failed to load: ${String(error)}`,
    );
  }
}

function readTextOrExit(path, role) {
  try {
    return readFileSync(resolve(path), "utf8");
  } catch (error) {
    fail(EXIT_BAD_INPUT, `Cannot read ${role} at "${path}": ${String(error)}`);
  }
}

function loadFixture(path) {
  const fixture = JSON.parse(readTextOrExit(path, "fixture"));
  if (!Array.isArray(fixture.items) || !Array.isArray(fixture.citations)) {
    fail(
      EXIT_BAD_INPUT,
      "Fixture must have an items array and a citations array.",
    );
  }
  return fixture;
}

function citeprocEngineClass(module) {
  const CSL = module.default ?? module;
  if (!CSL || typeof CSL.Engine !== "function") {
    fail(EXIT_BAD_INPUT, 'Package "citeproc" has no CSL.Engine export.');
  }
  return CSL;
}

/** Render the fixture through citeproc-js: one string per citation, then the bibliography. */
function renderWithCiteproc(module, fixture, styleXml, localeXml) {
  const CSL = citeprocEngineClass(module);
  const byId = new Map(fixture.items.map((item) => [item.id, item]));
  const sys = {
    retrieveLocale: () => localeXml,
    retrieveItem: (id) => byId.get(id),
  };
  const engine = new CSL.Engine(sys, styleXml, "en-US");
  engine.updateItems(fixture.items.map((item) => item.id));
  const rendered = [];
  const pre = [];
  fixture.citations.forEach((cite, index) => {
    const cluster = {
      citationID: cite.id,
      citationItems: [
        {
          id: cite.itemId,
          ...(cite.locator
            ? { label: cite.locator.label, locator: cite.locator.value }
            : {}),
          ...(cite.suffix ? { suffix: cite.suffix } : {}),
        },
      ],
      properties: { noteIndex: index + 1 },
    };
    const result = engine.processCitationCluster(cluster, [...pre], []);
    for (const [position, text] of result[1]) {
      rendered[position] = text;
    }
    pre.push([cite.id, index + 1]);
  });
  const bibliography = engine.makeBibliography();
  return {
    citations: rendered,
    bibliography: bibliography ? bibliography[1] : [],
  };
}

async function renderWithHayagriva(fixture, styleXml, localeXml) {
  const packageName =
    process.env.GETWRITE_HAYAGRIVA_PACKAGE ?? "hayagriva-wasm";
  const module = await importOrExit(packageName, "candidate B");
  if (typeof module.renderCitations !== "function") {
    fail(
      EXIT_BAD_INPUT,
      `Package "${packageName}" does not export renderCitations(items, citations, styleXml, localeXml). Its binding surface is not known to this script.`,
    );
  }
  return module.renderCitations(
    fixture.items,
    fixture.citations,
    styleXml,
    localeXml,
  );
}

/** Normalise whitespace and markup only: strip tags, collapse whitespace runs, trim. */
function normalise(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareLists(kind, reference, candidate, ids) {
  const differences = [];
  const length = Math.max(reference.length, candidate.length);
  for (let i = 0; i < length; i += 1) {
    const ref = reference[i];
    const cand = candidate[i];
    if (normalise(ref) !== normalise(cand)) {
      differences.push({
        kind,
        index: i,
        id: ids?.[i] ?? null,
        reference: ref ?? null,
        candidate: cand ?? null,
        referenceNormalised: ref === undefined ? null : normalise(ref),
        candidateNormalised: cand === undefined ? null : normalise(cand),
      });
    }
  }
  return differences;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [candidate, styleId] = positional;
  if (!candidate || !styleId || !flags["style-file"] || !flags["locale-file"]) {
    fail(
      EXIT_BAD_INPUT,
      "Usage: citations-engine-fidelity.mjs <citeproc-js|hayagriva> <style-id> --style-file <csl> --locale-file <xml> [--out <file>] [--fixture <file>]",
    );
  }
  if (candidate !== "citeproc-js" && candidate !== "hayagriva") {
    fail(
      EXIT_BAD_INPUT,
      `Unknown candidate "${candidate}". Use citeproc-js or hayagriva.`,
    );
  }

  // Imports come first so a missing package is reported before any file is needed.
  const referenceModule = await importOrExit(
    "citeproc",
    "reference processor, citeproc-js",
  );
  const fixturePath =
    flags.fixture ??
    new URL("./citations-fidelity-fixture.json", import.meta.url).pathname;
  const fixture = loadFixture(fixturePath);
  const styleXml = readTextOrExit(flags["style-file"], "style file");
  const localeXml = readTextOrExit(flags["locale-file"], "locale file");

  const reference = renderWithCiteproc(
    referenceModule,
    fixture,
    styleXml,
    localeXml,
  );
  const candidateOutput =
    candidate === "citeproc-js"
      ? renderWithCiteproc(referenceModule, fixture, styleXml, localeXml)
      : await renderWithHayagriva(fixture, styleXml, localeXml);

  const ids = fixture.citations.map((cite) => cite.id);
  const differences = [
    ...compareLists(
      "citation",
      reference.citations,
      candidateOutput.citations,
      ids,
    ),
    ...compareLists(
      "bibliography",
      reference.bibliography,
      candidateOutput.bibliography,
    ),
  ];
  const report = {
    candidate,
    styleId,
    referenceProcessor: "citeproc-js (package citeproc)",
    normalisation:
      "markup tags stripped and whitespace collapsed; nothing else",
    citationCount: fixture.citations.length,
    differenceCount: differences.length,
    differences,
    referenceOutput: reference,
    candidateOutput,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (flags.out) writeFileSync(resolve(flags.out), json);
  else process.stdout.write(json);
  process.exit(differences.length === 0 ? 0 : EXIT_DIFFERENCES);
}

main().catch((error) =>
  fail(EXIT_BAD_INPUT, `Unexpected failure: ${String(error)}`),
);
