import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapBinderToImportPlan } from "../../src/lib/models/scrivener/binder-mapper";
import { parseScrivxFile } from "../../src/lib/models/scrivener/scrivx-parser";
import type {
  ScrivxBinderItem,
  ScrivxParsed,
} from "../../src/lib/models/scrivener/scrivx-types";

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "scrivener",
  "sample.scriv",
  "sample.scrivx",
);

function findFolder(
  plan: Awaited<ReturnType<typeof mapBinderToImportPlan>>,
  name: string,
  parentId: string | null,
) {
  return plan.folders.find((f) => f.name === name && f.parentId === parentId);
}

function findResource(
  plan: Awaited<ReturnType<typeof mapBinderToImportPlan>>,
  name: string,
  parentId: string | null,
) {
  return plan.resources.find((r) => r.name === name && r.parentId === parentId);
}

// FR-18: the fixture now uses the measured real-project shapes (child
// <Title> elements, <CustomMetaData><MetaDataItem><FieldID>/<Value>, etc.).
// The assertions below already describe the correct target behavior and
// need no value changes, but every one of them currently fails: parsing the
// fixture itself throws (`scrivx-parser.ts`'s `readCustomMetaDataValues`
// still requires an `ID` attribute on `MetaDataItem`, which the real shape
// no longer carries) until a later task updates the parser/mapper to read
// the new shapes.
describe("mapBinderToImportPlan — Task 1 fixture", () => {
  it("places Draft content at the project root with no wrapper folder", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    // "Chapter One" (Folder, own content.rtf) and "Chapter Two" (Text with a
    // "Scene One" child) both sit directly at the root — no "Manuscript"
    // (the DraftFolder's own title) wrapper folder exists anywhere.
    expect(plan.folders.some((f) => f.name === "Manuscript")).toBe(false);
    const chapterOne = findFolder(plan, "Chapter One", null);
    const chapterTwo = findFolder(plan, "Chapter Two", null);
    expect(chapterOne).toBeDefined();
    expect(chapterTwo).toBeDefined();
    expect(chapterOne?.orderIndex).toBeLessThan(
      chapterTwo?.orderIndex ?? Infinity,
    );
  });

  it("FR-13: a Folder with its own content.rtf gets a first-child text resource named after it", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const chapterOne = findFolder(plan, "Chapter One", null);
    expect(chapterOne).toBeDefined();
    const ownResource = findResource(plan, "Chapter One", chapterOne!.id);
    expect(ownResource).toBeDefined();
    expect(ownResource?.orderIndex).toBe(0);
    expect(ownResource?.sourceUuid).toBe(
      "55555555-5555-4555-8555-555555555555",
    );
    expect(ownResource?.contentRtfPath).toBe(
      path.join(
        path.dirname(FIXTURE_PATH),
        "Files",
        "Data",
        "55555555-5555-4555-8555-555555555555",
        "content.rtf",
      ),
    );
  });

  it("FR-13: a Text item with children becomes a folder of the same name, own text first, then children", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const chapterTwo = findFolder(plan, "Chapter Two", null);
    expect(chapterTwo).toBeDefined();

    const ownResource = findResource(plan, "Chapter Two", chapterTwo!.id);
    expect(ownResource).toBeDefined();
    expect(ownResource?.orderIndex).toBe(0);
    expect(ownResource?.sourceUuid).toBe(
      "66666666-6666-4666-8666-666666666666",
    );

    const sceneOne = findResource(plan, "Scene One", chapterTwo!.id);
    expect(sceneOne).toBeDefined();
    expect(sceneOne?.orderIndex).toBe(1);
    expect(sceneOne?.sourceUuid).toBe("77777777-7777-4777-8777-777777777777");
  });

  it("FR-16: Research text content nests under one top-level Research folder; non-text items are collected separately", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const research = findFolder(plan, "Research", null);
    expect(research).toBeDefined();

    const characterNotes = findResource(plan, "Character Notes", research!.id);
    expect(characterNotes).toBeDefined();
    expect(characterNotes?.sourceUuid).toBe(
      "88888888-8888-4888-8888-888888888888",
    );

    // "Sync Conflict Artifact" (Other, under Research) is never converted.
    expect(
      plan.resources.some((r) => r.name === "Sync Conflict Artifact"),
    ).toBe(false);
    expect(plan.folders.some((f) => f.name === "Sync Conflict Artifact")).toBe(
      false,
    );

    expect(plan.nonTextResearch).toEqual([
      {
        itemTitle: "Sync Conflict Artifact",
        binderPath: "Research/Sync Conflict Artifact",
      },
    ]);
    expect(plan.excluded).toContainEqual({
      itemTitle: "Sync Conflict Artifact",
      binderPath: "Research/Sync Conflict Artifact",
      reason: "other-type",
    });
  });

  it("FR-17: a top-level user folder ('Archive') preserves its own hierarchy", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const archive = findFolder(plan, "Archive", null);
    expect(archive).toBeDefined();
    // Archive itself has no content.rtf on disk, so it gets no synthesized
    // "own text" resource — just its converted "Old Draft" child.
    expect(findResource(plan, "Archive", archive!.id)).toBeUndefined();

    const oldDraft = findResource(plan, "Old Draft", archive!.id);
    expect(oldDraft).toBeDefined();
    expect(oldDraft?.sourceUuid).toBe("BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB");
  });

  it("excludes TrashFolder's content, e.g. 'Deleted Scene'", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    expect(plan.resources.some((r) => r.name === "Deleted Scene")).toBe(false);
    expect(plan.folders.some((f) => f.name === "Deleted Scene")).toBe(false);
    expect(plan.excluded).toContainEqual({
      itemTitle: "Deleted Scene",
      binderPath: "Trash/Deleted Scene",
      reason: "trash",
    });
  });

  it("FR-19: an untitled Research item ('CCCCCCCC...') imports under the fallback name 'Untitled'", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const research = findFolder(plan, "Research", null);
    expect(research).toBeDefined();

    const untitled = plan.resources.find(
      (r) => r.sourceUuid === "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC",
    );
    expect(untitled).toBeDefined();
    expect(untitled?.name).toBe("Untitled");
    expect(untitled?.parentId).toBe(research!.id);

    expect(plan.untitledFallbacks).toContainEqual({
      itemTitle: "Untitled",
      binderPath: "Research/Untitled",
    });
  });

  it("assigns every planned folder a distinct plan-local id and a parentId chain, not slug-matched identity", async () => {
    const parsed = await parseScrivxFile(FIXTURE_PATH);
    const plan = await mapBinderToImportPlan(parsed, FIXTURE_PATH);

    const ids = plan.folders.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const folder of plan.folders) {
      if (folder.parentId !== null) {
        expect(plan.folders.some((f) => f.id === folder.parentId)).toBe(true);
      }
    }
  });
});

describe("mapBinderToImportPlan — synthetic binder trees", () => {
  const PACKAGE_DIR = path.join(
    __dirname,
    "..",
    "fixtures",
    "scrivener",
    "sample.scriv",
  );
  const SCRIVX_PATH = path.join(PACKAGE_DIR, "sample.scrivx");

  function draftFolderItem(
    title: string,
    children: ScrivxBinderItem[],
  ): ScrivxBinderItem {
    return {
      uuid: `draft-root-${title}`,
      type: "DraftFolder",
      title,
      metaData: { customMetaData: [] },
      keywordIds: [],
      children,
    };
  }

  function textLeaf(uuid: string, title: string): ScrivxBinderItem {
    return {
      uuid,
      type: "Text",
      title,
      metaData: { customMetaData: [] },
      keywordIds: [],
      children: [],
    };
  }

  function folderItem(
    uuid: string,
    title: string,
    children: ScrivxBinderItem[] = [],
  ): ScrivxBinderItem {
    return {
      uuid,
      type: "Folder",
      title,
      metaData: { customMetaData: [] },
      keywordIds: [],
      children,
    };
  }

  function parsedFrom(binder: ScrivxBinderItem[]): ScrivxParsed {
    return {
      creator: "SCRMAC-3.5.2-99999",
      binder,
      labels: [],
      statuses: [],
      keywords: [],
      customMetaDataFields: [],
      fragmentErrors: [],
    };
  }

  it("suffixes the Research folder's name, not the colliding Draft item, and records a note", async () => {
    // A Draft root-level item literally titled "Research" collides with the
    // synthetic top-level "Research" folder FR-16 always creates.
    const parsed = parsedFrom([
      draftFolderItem("Manuscript", [textLeaf("draft-text-1", "Research")]),
      {
        uuid: "research-root",
        type: "ResearchFolder",
        title: "Research",
        metaData: { customMetaData: [] },
        keywordIds: [],
        children: [],
      },
    ]);

    const plan = await mapBinderToImportPlan(parsed, SCRIVX_PATH);

    // The Draft item keeps its original name, unrenamed, at the root.
    const draftResearch = plan.resources.find(
      (r) => r.sourceUuid === "draft-text-1",
    );
    expect(draftResearch?.name).toBe("Research");
    expect(draftResearch?.parentId).toBeNull();

    // The synthetic Research folder was suffixed instead.
    const researchFolder = plan.folders.find((f) => f.parentId === null);
    expect(researchFolder?.name).toBe("Research (2)");

    expect(plan.notes).toEqual([
      {
        message:
          'Renamed top-level folder "Research" to "Research (2)" to avoid ' +
          "colliding with an existing top-level item of the same name at the " +
          "project root.",
      },
    ]);
  });

  it("suffixes a colliding FR-17 top-level user folder rather than overwriting or merging", async () => {
    const parsed = parsedFrom([
      draftFolderItem("Manuscript", [folderItem("draft-folder-1", "Archive")]),
      folderItem("user-folder-1", "Archive", [
        textLeaf("user-text-1", "Old Notes"),
      ]),
    ]);

    const plan = await mapBinderToImportPlan(parsed, SCRIVX_PATH);

    const draftArchive = plan.folders.find(
      (f) => f.sourceUuid === "draft-folder-1",
    );
    expect(draftArchive?.name).toBe("Archive");
    expect(draftArchive?.parentId).toBeNull();

    const userArchive = plan.folders.find(
      (f) => f.sourceUuid === "user-folder-1",
    );
    expect(userArchive?.name).toBe("Archive (2)");
    expect(userArchive?.parentId).toBeNull();

    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]?.message).toContain('"Archive"');
    expect(plan.notes[0]?.message).toContain('"Archive (2)"');
  });

  it("FR-19: de-duplicates 'Untitled' among untitled siblings in binder order, counting only siblings under the same parent", async () => {
    const parsed = parsedFrom([
      draftFolderItem("Manuscript", [
        textLeaf("titled-1", "Chapter One"),
        textLeaf("untitled-1", ""),
        textLeaf("untitled-2", ""),
        folderItem("untitled-folder-1", "", [
          textLeaf("nested-untitled-1", ""),
        ]),
        textLeaf("untitled-3", ""),
      ]),
    ]);

    const plan = await mapBinderToImportPlan(parsed, SCRIVX_PATH);

    expect(
      plan.resources.find((r) => r.sourceUuid === "untitled-1")?.name,
    ).toBe("Untitled");
    expect(
      plan.resources.find((r) => r.sourceUuid === "untitled-2")?.name,
    ).toBe("Untitled 2");
    expect(
      plan.folders.find((f) => f.sourceUuid === "untitled-folder-1")?.name,
    ).toBe("Untitled 3");
    expect(
      plan.resources.find((r) => r.sourceUuid === "untitled-3")?.name,
    ).toBe("Untitled 4");
    // The nested untitled item is under a different parent (the untitled
    // folder), so its own counter restarts at 1 rather than continuing its
    // ancestor's count.
    expect(
      plan.resources.find((r) => r.sourceUuid === "nested-untitled-1")?.name,
    ).toBe("Untitled");

    expect(plan.resources.find((r) => r.sourceUuid === "titled-1")?.name).toBe(
      "Chapter One",
    );

    expect(plan.untitledFallbacks).toEqual([
      { itemTitle: "Untitled", binderPath: "Manuscript/Untitled" },
      { itemTitle: "Untitled 2", binderPath: "Manuscript/Untitled 2" },
      { itemTitle: "Untitled 3", binderPath: "Manuscript/Untitled 3" },
      { itemTitle: "Untitled", binderPath: "Manuscript/Untitled 3/Untitled" },
      { itemTitle: "Untitled 4", binderPath: "Manuscript/Untitled 4" },
    ]);
  });

  it("does not record a note or rename anything when there is no root-level collision", async () => {
    const parsed = parsedFrom([
      draftFolderItem("Manuscript", [textLeaf("draft-text-1", "Chapter One")]),
      folderItem("user-folder-1", "Notes"),
    ]);

    const plan = await mapBinderToImportPlan(parsed, SCRIVX_PATH);

    expect(plan.notes).toEqual([]);
    expect(
      plan.folders.find((f) => f.sourceUuid === "user-folder-1")?.name,
    ).toBe("Notes");
  });
});
