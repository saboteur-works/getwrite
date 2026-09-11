import path from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  isSupportedScrivenerProject,
  parseScrivxFile,
  ScrivxParseError,
} from "../../src/lib/models/scrivener/scrivx-parser";

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "scrivener",
  "sample.scriv",
  "sample.scrivx",
);

describe("isSupportedScrivenerProject", () => {
  it("accepts the Task 1 fixture's Creator string", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(isSupportedScrivenerProject(parsed.creator)).toBe(true);
  });

  it("accepts any Creator starting with SCRMAC-3", () => {
    expect(isSupportedScrivenerProject("SCRMAC-3.1.1-1")).toBe(true);
    expect(isSupportedScrivenerProject("SCRMAC-3")).toBe(true);
  });

  it("rejects a synthetic non-SCRMAC-3 Creator string", () => {
    expect(isSupportedScrivenerProject("SCRWIN-3.5.2-12345")).toBe(false);
    expect(isSupportedScrivenerProject("SCRMAC-2.9.0-9999")).toBe(false);
    expect(isSupportedScrivenerProject("")).toBe(false);
    expect(isSupportedScrivenerProject("something-unexpected")).toBe(false);
  });
});

describe("parseScrivxFile — malformed input", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws rather than partially parsing a truncated .scrivx file", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const truncatedPath = path.join(tmpDir, "truncated.scrivx");
    writeFileSync(
      truncatedPath,
      '<?xml version="1.0" encoding="UTF-8"?>\n<ScrivenerProject Creator="SCRMAC-3.5.2-17487"><Binder><BinderItem UUID="1" Type="Text" Title="Unclosed"',
      "utf8",
    );

    await expect(parseScrivxFile(truncatedPath)).rejects.toThrow(
      ScrivxParseError,
    );
  });

  it("throws when the root <ScrivenerProject>/<Binder> shape is missing", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const wrongShapePath = path.join(tmpDir, "wrong-shape.scrivx");
    writeFileSync(wrongShapePath, "<NotAScrivenerProject/>", "utf8");

    await expect(parseScrivxFile(wrongShapePath)).rejects.toThrow(
      ScrivxParseError,
    );
  });

  it("throws when a required attribute is missing from a BinderItem", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const missingAttrPath = path.join(tmpDir, "missing-attr.scrivx");
    writeFileSync(
      missingAttrPath,
      '<?xml version="1.0" encoding="UTF-8"?>\n<ScrivenerProject Creator="SCRMAC-3.5.2-17487"><Binder><BinderItem Type="Text" Title="No UUID"/></Binder></ScrivenerProject>',
      "utf8",
    );

    await expect(parseScrivxFile(missingAttrPath)).rejects.toThrow(
      ScrivxParseError,
    );
  });
});

describe("parseScrivxFile — Task 1 fixture", () => {
  it("parses the raw Creator string", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.creator).toBe("SCRMAC-3.5.2-17487");
  });

  it("parses the DraftFolder's nested children", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const draft = parsed.binder.find((item) => item.type === "DraftFolder");
    expect(draft).toBeDefined();
    expect(draft?.title).toBe("Manuscript");
    expect(draft?.children).toHaveLength(2);

    const [chapterOne, chapterTwo] = draft!.children;
    expect(chapterOne.type).toBe("Folder");
    expect(chapterOne.title).toBe("Chapter One");
    expect(chapterOne.children).toHaveLength(0);

    expect(chapterTwo.type).toBe("Text");
    expect(chapterTwo.title).toBe("Chapter Two");
    expect(chapterTwo.metaData.statusId).toBe("2");
    expect(chapterTwo.metaData.labelId).toBe("2");
    expect(chapterTwo.metaData.includeInCompile).toBe(true);
    expect(chapterTwo.keywordIds).toEqual(["K3"]);
    expect(chapterTwo.metaData.customMetaData).toEqual([
      { fieldId: "CMD1", value: "Working title placeholder" },
      { fieldId: "CMD2", value: "2026-12-01" },
      { fieldId: "CMD3", value: "Protagonist" },
    ]);

    // FR-13: a Text-type binder item with its own children.
    expect(chapterTwo.children).toHaveLength(1);
    const sceneOne = chapterTwo.children[0];
    expect(sceneOne.type).toBe("Text");
    expect(sceneOne.title).toBe("Scene One");
    expect(sceneOne.keywordIds).toEqual(["K6"]);
  });

  it("parses the Research folder's Text and non-Text (Other) items", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const research = parsed.binder.find(
      (item) => item.type === "ResearchFolder",
    );
    expect(research).toBeDefined();
    expect(research?.children).toHaveLength(2);

    const [characterNotes, syncConflict] = research!.children;
    expect(characterNotes.type).toBe("Text");
    expect(characterNotes.title).toBe("Character Notes");
    expect(syncConflict.type).toBe("Other");
    expect(syncConflict.title).toBe("Sync Conflict Artifact");
  });

  it("parses the TrashFolder subtree and a top-level user folder", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const trash = parsed.binder.find((item) => item.type === "TrashFolder");
    expect(trash).toBeDefined();
    expect(trash?.children).toHaveLength(1);
    expect(trash?.children[0].title).toBe("Deleted Scene");

    const archive = parsed.binder.find(
      (item) => item.type === "Folder" && item.title === "Archive",
    );
    expect(archive).toBeDefined();
    expect(archive?.children).toHaveLength(1);
    expect(archive?.children[0].type).toBe("Text");
    expect(archive?.children[0].title).toBe("Old Draft");
  });

  it("parses the StatusSettings and LabelSettings blocks", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.statuses).toEqual([
      { id: "1", name: "First Draft" },
      { id: "2", name: "Final Draft" },
    ]);
    expect(parsed.labels).toEqual([
      { id: "1", name: "No Label" },
      { id: "2", name: "Character POV" },
    ]);
  });

  it("parses the CustomMetaData field definitions", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.customMetaDataFields).toEqual([
      { id: "CMD1", type: "Text", title: "Working Title" },
      { id: "CMD2", type: "Date", title: "Deadline" },
      { id: "CMD3", type: "List", title: "POV Character" },
    ]);
  });

  it("parses the two same-leaf-name keywords nested under different parents", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.keywords).toHaveLength(2);

    const [characters, plot] = parsed.keywords;
    expect(characters.title).toBe("Characters");
    expect(plot.title).toBe("Plot");

    const protagonists = characters.children[0];
    const threads = plot.children[0];
    expect(protagonists.title).toBe("Protagonists");
    expect(threads.title).toBe("Threads");

    const caseUnderProtagonists = protagonists.children[0];
    const caseUnderThreads = threads.children[0];
    expect(caseUnderProtagonists.title).toBe("Case");
    expect(caseUnderThreads.title).toBe("Case");
    expect(caseUnderProtagonists.id).not.toBe(caseUnderThreads.id);
    expect(caseUnderProtagonists.id).toBe("K3");
    expect(caseUnderThreads.id).toBe("K6");
  });
});
