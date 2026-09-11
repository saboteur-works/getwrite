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

  // FR-8/OQ-12: a malformed or unexpected element anywhere in the .scrivx
  // tree — including a BinderItem missing a required attribute — is a
  // recorded skip, not an aborting throw. Only an unreadable/non-XML file
  // (or a missing root ScrivenerProject/Binder/Creator shape) still throws.
  // This supersedes an earlier version of this test (pre-FR-18) that
  // expected a throw here.
  it("records a skip, and continues parsing, when a required attribute is missing from a BinderItem", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const missingAttrPath = path.join(tmpDir, "missing-attr.scrivx");
    writeFileSync(
      missingAttrPath,
      '<?xml version="1.0" encoding="UTF-8"?>\n<ScrivenerProject Creator="SCRMAC-3.5.2-17487"><Binder><BinderItem Type="Text"><Title>No UUID</Title></BinderItem><BinderItem UUID="ok-1" Type="Text"><Title>Fine</Title></BinderItem></Binder></ScrivenerProject>',
      "utf8",
    );

    const parsed = await parseScrivxFile(missingAttrPath);
    expect(parsed.binder).toHaveLength(1);
    expect(parsed.binder[0].uuid).toBe("ok-1");
    expect(parsed.fragmentErrors).toHaveLength(1);
    expect(parsed.fragmentErrors[0]).toMatchObject({
      itemTitle: "No UUID",
      reason: expect.stringContaining('"UUID"'),
    });
  });

  it("records a skip, and continues parsing, when a MetaDataItem is missing FieldID", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const missingFieldIdPath = path.join(tmpDir, "missing-field-id.scrivx");
    writeFileSync(
      missingFieldIdPath,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ScrivenerProject Creator="SCRMAC-3.5.2-17487"><Binder>',
        '<BinderItem UUID="doc-1" Type="Text"><Title>Doc One</Title>',
        "<MetaData><CustomMetaData>",
        "<MetaDataItem><Value>orphaned value</Value></MetaDataItem>",
        "<MetaDataItem><FieldID>CMD1</FieldID><Value>kept</Value></MetaDataItem>",
        "</CustomMetaData></MetaData>",
        "</BinderItem>",
        "</Binder></ScrivenerProject>",
      ].join(""),
      "utf8",
    );

    const parsed = await parseScrivxFile(missingFieldIdPath);
    expect(parsed.binder).toHaveLength(1);
    expect(parsed.binder[0].metaData.customMetaData).toEqual([
      { fieldId: "CMD1", value: "kept" },
    ]);
    expect(parsed.fragmentErrors).toHaveLength(1);
    expect(parsed.fragmentErrors[0]).toMatchObject({
      itemTitle: "Doc One",
      reason: expect.stringContaining('"FieldID"'),
    });
  });

  it("still throws on a fully malformed/non-XML .scrivx file", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "scrivx-parser-test-"));
    const notXmlPath = path.join(tmpDir, "not-xml.scrivx");
    writeFileSync(notXmlPath, "this is not XML at all { } <<<", "utf8");

    await expect(parseScrivxFile(notXmlPath)).rejects.toThrow(ScrivxParseError);
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
    // FR-18: per-document custom metadata now comes from
    // <CustomMetaData><MetaDataItem><FieldID>/<Value> child elements, never
    // an `ID`/`Value` attribute pair on `MetaDataItem`. CMD2 (a Date field)
    // carries the sub-second-precision timestamp shape here; CMD3 (a List
    // field) carries the raw `ListOptions/Option` id, not the option's
    // display text — resolving that id to "Protagonist" is
    // metadata-mapper's job (FR-7), not the parser's.
    expect(chapterTwo.metaData.customMetaData).toEqual([
      { fieldId: "CMD1", value: "Working title placeholder" },
      { fieldId: "CMD2", value: "2026-12-01 09:30:00.12345 +0000" },
      { fieldId: "CMD3", value: "OPT-PROTAG" },
    ]);

    // FR-13: a Text-type binder item with its own children.
    expect(chapterTwo.children).toHaveLength(1);
    const sceneOne = chapterTwo.children[0];
    expect(sceneOne.type).toBe("Text");
    expect(sceneOne.title).toBe("Scene One");
    expect(sceneOne.keywordIds).toEqual(["K6"]);
    // FR-18: the second measured Date-value shape (no sub-second precision,
    // same shape as a BinderItem's own Created/Modified timestamp).
    expect(sceneOne.metaData.customMetaData).toEqual([
      { fieldId: "CMD2", value: "2026-12-05 10:00:00 +0000" },
    ]);
  });

  it("parses the Research folder's Text and non-Text (Other) items, including an untitled Text item", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const research = parsed.binder.find(
      (item) => item.type === "ResearchFolder",
    );
    expect(research).toBeDefined();
    expect(research?.children).toHaveLength(3);

    const [characterNotes, syncConflict, untitled] = research!.children;
    expect(characterNotes.type).toBe("Text");
    expect(characterNotes.title).toBe("Character Notes");
    expect(syncConflict.type).toBe("Other");
    expect(syncConflict.title).toBe("Sync Conflict Artifact");

    // FR-18: a real Scrivener project has `Type="Text"` BinderItems with no
    // child <Title> element at all (untitled documents) — Title is optional
    // per item, not guaranteed.
    expect(untitled.type).toBe("Text");
    expect(untitled.title).toBe("");
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
    // FR-18: one measured real StatusID value was -1, meaning unconfirmed
    // (plausibly "No Status") — the parser still hands back the raw id
    // unresolved; resolving it against StatusSettings (and skipping when it
    // doesn't resolve, FR-8) is metadata-mapper's job.
    expect(archive?.children[0].metaData.statusId).toBe("-1");
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

  it("parses the CustomMetaData field definitions, including List-type ListOptions", async () => {
    // FR-18: project-level field definitions now live under
    // <CustomMetaDataSettings><MetaDataField>, with the field's name coming
    // from a child <Title> element rather than a Title attribute, and a
    // List-type field's <ListOptions><Option ID="..."/></ListOptions>
    // entries are exposed for a later task to resolve a document's raw
    // Option id against.
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.customMetaDataFields).toEqual([
      { id: "CMD1", type: "Text", title: "Working Title", listOptions: [] },
      { id: "CMD2", type: "Date", title: "Deadline", listOptions: [] },
      {
        id: "CMD3",
        type: "List",
        title: "POV Character",
        listOptions: [
          { id: "OPT-PROTAG", text: "Protagonist" },
          { id: "OPT-ANTAG", text: "Antagonist" },
        ],
      },
    ]);
  });

  it("parses the fixture cleanly, with no fragment errors", async () => {
    // FR-8/OQ-12: the Task 11 fixture is a well-formed real-project-shaped
    // .scrivx — it must parse with zero recorded skips.
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    expect(parsed.fragmentErrors).toEqual([]);
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
