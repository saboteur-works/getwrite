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

    const skip = plan.valueSkips.find((s) => s.sourceUuid === OLD_DRAFT_UUID);
    expect(skip).toBeDefined();
    expect(skip?.itemTitle).toBe("Old Draft");
    expect(skip?.reason.length).toBeGreaterThan(0);
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
    expect(plan.customFields).toHaveLength(4);

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

    const pov = plan.customFields.find((f) => f.label === "POV");
    expect(pov?.type).toBe("text");
  });

  // Task 16 precondition for FR-7's collision-suffix rule (Task 17): the
  // fixture's "POV" field derives the *unsuffixed* key "pov" from
  // `deriveFieldKey`'s within-import-only disambiguation, which has no
  // knowledge of the destination project's built-in metadata schema.
  // `plan.customFields` deliberately keeps exposing this pre-collision-check
  // key — see `resolveBuiltInFieldKeyCollisions`'s doc comment
  // (`metadata-mapper.ts`) — while the built-in-aware resolution (Task 17)
  // is exposed separately via `plan.fieldKeyRenames`, asserted below.
  it("derives the unsuffixed key 'pov' for the field titled 'POV' (Task 16 fixture precondition for FR-7)", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const pov = plan.customFields.find((f) => f.label === "POV");
    expect(pov).toBeDefined();
    expect(pov?.key).toBe("pov");
  });

  // Task 17/FR-7's amendment: "pov" collides with `default-metadata-schema.ts`'s
  // built-in Point of View field, so `buildMetadataPlan`'s final plan
  // records a rename to the first free `pov-scrivener` key, keeping "POV"
  // as the field's own title/label.
  it("FR-7/Task 17: resolves the 'POV' field's built-in collision to 'pov-scrivener' via fieldKeyRenames", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const rename = plan.fieldKeyRenames.find((r) => r.originalKey === "pov");
    expect(rename).toBeDefined();
    expect(rename?.fieldTitle).toBe("POV");
    expect(rename?.renamedKey).toBe("pov-scrivener");
  });

  it("resolves Chapter Two's POV field value under the derived key 'pov'", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    const values = plan.resourceUserMetadata.get(CHAPTER_TWO_UUID);
    expect(values?.pov).toBe("Third Limited");
  });

  it("derives slug-safe field keys satisfying metadata-schema.ts's SLUG_RE", async () => {
    const plan = buildMetadataPlan(await loadFixture());
    for (const field of plan.customFields) {
      expect(field.key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("resolves Chapter Two's four CustomMetaData values, keyed by each field's derived key", async () => {
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
    // FR-18/FR-20: a List-type value stores the ListOptions/Option id
    // ("OPT-PROTAG"), never the option's display text — the importer must
    // resolve the id to "Protagonist" via CustomMetaDataSettings.
    expect(values![povCharacterKey]).toBe("Protagonist");
    expect(plan.valueSkips.some((s) => s.sourceUuid === CHAPTER_TWO_UUID)).toBe(
      false,
    );
  });

  it("FR-20: records an FR-8 skip for a List field value whose Option@ID has no matching ListOptions entry", async () => {
    const parsed = await loadFixture();
    const synthetic: ScrivxParsed = {
      ...parsed,
      binder: [
        {
          uuid: "synthetic-list-item",
          type: "Text",
          title: "Untracked Cast Member",
          metaData: {
            customMetaData: [{ fieldId: "CMD3", value: "OPT-UNKNOWN" }],
          },
          keywordIds: [],
          children: [],
        },
        ...parsed.binder,
      ],
    };

    const plan = buildMetadataPlan(synthetic);

    const povCharacterKey = plan.customFields.find(
      (f) => f.label === "POV Character",
    )!.key;
    const values = plan.resourceUserMetadata.get("synthetic-list-item");
    expect(values?.[povCharacterKey]).toBeUndefined();

    const skip = plan.valueSkips.find(
      (s) => s.sourceUuid === "synthetic-list-item",
    );
    expect(skip).toBeDefined();
    expect(skip?.itemTitle).toBe("Untracked Cast Member");
    expect(skip?.reason.length).toBeGreaterThan(0);
  });

  it("FR-20: records an FR-8 skip for a Date field value matching neither measured shape", async () => {
    const parsed = await loadFixture();
    const synthetic: ScrivxParsed = {
      ...parsed,
      binder: [
        {
          uuid: "synthetic-date-item",
          type: "Text",
          title: "Malformed Deadline Doc",
          metaData: {
            customMetaData: [{ fieldId: "CMD2", value: "not-a-date" }],
          },
          keywordIds: [],
          children: [],
        },
        ...parsed.binder,
      ],
    };

    const plan = buildMetadataPlan(synthetic);

    const deadlineKey = plan.customFields.find(
      (f) => f.label === "Deadline",
    )!.key;
    const values = plan.resourceUserMetadata.get("synthetic-date-item");
    expect(values?.[deadlineKey]).toBeUndefined();

    const skip = plan.valueSkips.find(
      (s) => s.sourceUuid === "synthetic-date-item",
    );
    expect(skip).toBeDefined();
    expect(skip?.itemTitle).toBe("Malformed Deadline Doc");
    expect(skip?.reason.length).toBeGreaterThan(0);
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
        { id: "CMD99", type: "Checkbox", title: "Reviewed", listOptions: [] },
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
