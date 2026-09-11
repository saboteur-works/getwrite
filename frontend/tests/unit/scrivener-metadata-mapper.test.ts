import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScrivxFile } from "../../src/lib/models/scrivener/scrivx-parser";
import { buildMetadataPlan } from "../../src/lib/models/scrivener/metadata-mapper";
import type { ScrivxParsed } from "../../src/lib/models/scrivener/scrivx-types";

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "scrivener",
  "sample.scriv",
  "sample.scrivx",
);

const CHAPTER_TWO_UUID = "66666666-6666-4666-8666-666666666666";
const SCENE_ONE_UUID = "77777777-7777-4777-8777-777777777777";

async function loadFixture(): Promise<ScrivxParsed> {
  return parseScrivxFile(FIXTURE_PATH);
}

// FR-18: the fixture now uses the measured real-project shapes. Parsing it
// currently throws (`scrivx-parser.ts`'s `readCustomMetaDataValues` still
// requires an `ID` attribute on `MetaDataItem`), so every `it` below that
// calls `loadFixture()` fails until a later task updates the parser/mapper
// to read the new shapes — the assertions themselves already describe the
// correct target behavior.
describe("buildMetadataPlan — Status (FR-6)", () => {
  it("seeds config.statuses from StatusSettings labels", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    expect(plan.statuses).toContain("First Draft");
    expect(plan.statuses).toContain("Final Draft");
  });

  it("resolves Chapter Two's StatusID to userMetadata.status", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(CHAPTER_TWO_UUID);
    expect(values?.status).toBe("Final Draft");
  });

  // FR-18: one measured real StatusID value was -1 (meaning unconfirmed,
  // plausibly "No Status"). It does not resolve against any StatusSettings
  // entry, so the FR-8 skip path applies: no `status` key is set at all,
  // rather than a bogus/empty status value.
  it("skips resolving 'Old Draft's StatusID -1 to a status (FR-8 skip path)", async () => {
    const OLD_DRAFT_UUID = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(OLD_DRAFT_UUID);
    expect(values?.status).toBeUndefined();
  });
});

describe("buildMetadataPlan — Label (FR-15)", () => {
  it("builds a select field named Label with options from LabelSettings", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    expect(plan.labelField).toEqual({
      key: "label",
      label: "Label",
      type: "select",
      options: ["No Label", "Character POV"],
    });
  });

  it("resolves Chapter Two's LabelID to userMetadata.label", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(CHAPTER_TWO_UUID);
    expect(values?.label).toBe("Character POV");
  });
});

describe("buildMetadataPlan — CustomMetaData (FR-7)", () => {
  it("maps Text/Date/List field types to text/date/select field definitions", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    expect(plan.customFields).toHaveLength(3);

    const workingTitle = plan.customFields.find(
      (f) => f.label === "Working Title",
    );
    expect(workingTitle?.type).toBe("text");

    const deadline = plan.customFields.find((f) => f.label === "Deadline");
    expect(deadline?.type).toBe("date");

    const povCharacter = plan.customFields.find(
      (f) => f.label === "POV Character",
    );
    expect(povCharacter?.type).toBe("select");
  });

  it("derives slug-safe field keys satisfying metadata-schema.ts's SLUG_RE", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    for (const field of plan.customFields) {
      expect(field.key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("resolves Chapter Two's three CustomMetaData values, keyed by each field's derived key", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(CHAPTER_TWO_UUID);
    expect(values).toBeDefined();

    const workingTitleKey = plan.customFields.find(
      (f) => f.label === "Working Title",
    )!.key;
    const deadlineKey = plan.customFields.find(
      (f) => f.label === "Deadline",
    )!.key;
    const povCharacterKey = plan.customFields.find(
      (f) => f.label === "POV Character",
    )!.key;

    expect(values![workingTitleKey]).toBe("Working title placeholder");
    // FR-18: Chapter Two's Deadline value now carries the sub-second-
    // precision Date shape as measured off the real project.
    expect(values![deadlineKey]).toBe("2026-12-01 09:30:00.12345 +0000");
    // FR-18: a List-type value now stores the ListOptions/Option id
    // ("OPT-PROTAG"), never the option's display text — the importer must
    // resolve the id to "Protagonist" via CustomMetaDataSettings.
    expect(values![povCharacterKey]).toBe("Protagonist");
  });

  // FR-18: the second measured Date shape (no sub-second precision, same
  // shape as a BinderItem's own Created/Modified timestamp) lives on Scene
  // One's own Deadline value.
  it("resolves Scene One's Deadline value in the non-sub-second Date shape", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(SCENE_ONE_UUID);
    const deadlineKey = plan.customFields.find(
      (f) => f.label === "Deadline",
    )!.key;
    expect(values?.[deadlineKey]).toBe("2026-12-05 10:00:00 +0000");
  });

  it("reports a custom-metadata field type with no GetWrite mapping and does not include it in customFields (FR-8)", async () => {
    const parsed = await loadFixture();
    const synthetic: ScrivxParsed = {
      ...parsed,
      customMetaDataFields: [
        ...parsed.customMetaDataFields,
        { id: "CMD99", type: "Checkbox" as never, title: "Reviewed" },
      ],
    };

    const plan = buildMetadataPlan(synthetic);

    expect(
      plan.customFields.find((f) => f.label === "Reviewed"),
    ).toBeUndefined();
    expect(plan.unsupportedFields).toHaveLength(1);
    expect(plan.unsupportedFields[0]).toMatchObject({
      fieldId: "CMD99",
      fieldTitle: "Reviewed",
      type: "Checkbox",
    });
    expect(plan.unsupportedFields[0].reason.length).toBeGreaterThan(0);
  });
});

describe("buildMetadataPlan — Keywords leaf-name merge (FR-15)", () => {
  it("merges the two same-leaf-name 'Case' keywords into exactly one planned tag", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const caseTags = plan.keywordTagPlan.tags.filter((t) => t.name === "Case");
    expect(caseTags).toHaveLength(1);
    expect([...caseTags[0].keywordIds].sort()).toEqual(["K3", "K6"]);
  });

  it("resolves both documents tagged by the merged keywords to the same planned tag id", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const caseTag = plan.keywordTagPlan.tags.find((t) => t.name === "Case")!;

    const chapterTwoTagIds =
      plan.keywordTagPlan.resourceKeywordTagIds.get(CHAPTER_TWO_UUID);
    const sceneOneTagIds =
      plan.keywordTagPlan.resourceKeywordTagIds.get(SCENE_ONE_UUID);

    expect(chapterTwoTagIds).toEqual([caseTag.id]);
    expect(sceneOneTagIds).toEqual([caseTag.id]);
  });

  it("records exactly one merge entry for 'Case' with both parent paths", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    expect(plan.keywordTagPlan.merges).toHaveLength(1);

    const merge = plan.keywordTagPlan.merges[0];
    expect(merge.leafName).toBe("Case");
    expect([...merge.parentPaths].sort()).toEqual(
      ["Characters > Protagonists", "Plot > Threads"].sort(),
    );
  });

  it("does not record a merge for leaf names that appear only once", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const merge = plan.keywordTagPlan.merges.find((m) => m.leafName !== "Case");
    expect(merge).toBeUndefined();
  });
});
