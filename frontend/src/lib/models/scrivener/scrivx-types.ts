// Last Updated: 2026-09-11

/**
 * @module scrivx-types
 *
 * Typed shape of a parsed Scrivener `.scrivx` file, as produced by
 * {@link "./scrivx-parser".parseScrivxFile}.
 *
 * These types mirror the FR-18 element shapes measured off a real
 * Scrivener 3 Mac project and recorded in
 * `specs/features/scrivener-cli-importer/scrivener-format.md`: a
 * `ScrivenerProject` root with a `Binder` of nested `BinderItem`s, plus
 * document-root `StatusSettings`/`LabelSettings`/`Keywords`/
 * `CustomMetaDataSettings` blocks. No RTF content is modeled here — that is
 * Task 3's concern; a `BinderItem` only carries the metadata the `.scrivx`
 * XML itself holds (`Type`/`UUID` attributes, a child `<Title>`, `MetaData`,
 * per-document `Keywords/KeywordID` references, and nested `Children`).
 *
 * A `BinderItem`'s, `Keyword`'s, `MetaDataField`'s, `Label`'s, and
 * `Status`'s name always comes from a child element (`<Title>` for the
 * first three, element text content for `Label`/`Status`) — never a
 * `Title`/name attribute, per FR-18.
 */

/**
 * The binder-item `Type` attribute values observed in the fixture and
 * documented by the spec. `DraftFolder`/`ResearchFolder`/`TrashFolder` only
 * ever appear as the three well-known top-level roots; `Folder`/`Text`/
 * `Other` may appear at any depth.
 */
export type ScrivxBinderItemType =
  | "DraftFolder"
  | "ResearchFolder"
  | "TrashFolder"
  | "Folder"
  | "Text"
  | "Other";

/**
 * A single `<MetaDataItem><FieldID>...</FieldID><Value>...</Value></MetaDataItem>`
 * entry under a binder item's `<MetaData><CustomMetaData>`, keyed by the
 * field's `CustomMetaData` `ID` (resolved against the document-root
 * {@link ScrivxCustomMetaDataField} definitions by a later task's mapper,
 * not here). Per FR-18, both `FieldID` and `Value` are child elements, never
 * an `ID`/`Value` attribute pair on `MetaDataItem` itself — a `MetaDataItem`
 * missing either child is recorded as a {@link ScrivxFragmentError} rather
 * than included here.
 */
export interface ScrivxCustomMetaDataValue {
  /** The `CustomMetaData` field id this value belongs to, e.g. `"CMD1"`, from the `<FieldID>` child's text content. */
  readonly fieldId: string;
  /** The raw string value, from the `<Value>` child's text content. */
  readonly value: string;
}

/**
 * A binder item's `<MetaData>` block: compile inclusion, resolved-later
 * Status/Label ids, and any per-item custom metadata values. Every field is
 * optional since the fixture shows plain structural items (folders with no
 * `MetaData` at all, or a `MetaData` with only `IncludeInCompile`).
 */
export interface ScrivxBinderItemMetaData {
  /** `<IncludeInCompile>Yes|No</IncludeInCompile>`, when present. */
  readonly includeInCompile?: boolean;
  /** `<StatusID>` text content, when present — resolved via `StatusSettings`. */
  readonly statusId?: string;
  /** `<LabelID>` text content, when present — resolved via `LabelSettings`. */
  readonly labelId?: string;
  /** Every `<CustomMetaData><MetaDataItem>` entry, when present. */
  readonly customMetaData: readonly ScrivxCustomMetaDataValue[];
}

/**
 * A single `<BinderItem>`, recursively nested via `<Children>`.
 */
export interface ScrivxBinderItem {
  /** The `UUID` attribute — stable identifier for this binder item. */
  readonly uuid: string;
  /** The `Type` attribute. */
  readonly type: ScrivxBinderItemType;
  /**
   * The item's name, from a child `<Title>` element's text content — never
   * a `Title` attribute (FR-18). A `Type="Text"` binder item legitimately
   * may carry no `<Title>` at all (an untitled document, measured on the
   * real project); this is `""` in that case, not an error. Naming the
   * "Untitled" fallback is a later task's concern (OQ-10), not this
   * parser's.
   */
  readonly title: string;
  /** This item's `<MetaData>` block, always present (empty when absent in XML). */
  readonly metaData: ScrivxBinderItemMetaData;
  /**
   * Ids of `<Keywords><Keyword ID="..."/></Keywords>` entries — this
   * document's own keyword tag references, distinct from the document-root
   * {@link ScrivxKeyword} hierarchy those ids resolve against.
   */
  readonly keywordIds: readonly string[];
  /** Nested `<Children><BinderItem>...</BinderItem></Children>` items, in binder order. */
  readonly children: readonly ScrivxBinderItem[];
}

/** A single `<Label ID="...">Name</Label>` entry from `<LabelSettings><Labels>`. */
export interface ScrivxLabel {
  readonly id: string;
  readonly name: string;
}

/** A single `<Status ID="...">Name</Status>` entry from `<StatusSettings><StatusItems>`. */
export interface ScrivxStatus {
  readonly id: string;
  readonly name: string;
}

/**
 * A single node in the document-root `<Keywords>` hierarchy: a
 * `<Keyword ID="..." Title="...">`, optionally with nested `<Children>`
 * keywords. Distinct from a binder item's own `keywordIds` (references into
 * this tree by id).
 */
export interface ScrivxKeyword {
  readonly id: string;
  /** From the `Keyword`'s child `<Title>` element's text content — never a `Title` attribute (FR-18). */
  readonly title: string;
  readonly children: readonly ScrivxKeyword[];
}

/**
 * A single `<ListOptions><Option ID="...">Display text</Option></ListOptions>`
 * entry belonging to a `List`-type {@link ScrivxCustomMetaDataField}. A
 * document's `MetaDataItem` `Value` for a List field stores this `id`, not
 * `text` — resolving `id` to `text` is a later task's (metadata-mapper's)
 * job, not this parser's.
 */
export interface ScrivxListOption {
  /** The `Option`'s `ID` attribute — what a document's `MetaDataItem` `Value` stores for this field. */
  readonly id: string;
  /** The `Option`'s own element text content — the display text. */
  readonly text: string;
}

/**
 * A single `<MetaDataField ID="..." Type="..." .../>` field definition from
 * the document-root `<CustomMetaDataSettings>` block (FR-18 — not
 * `project["CustomMetaData"]`, which is per-document values, not
 * definitions). `type` is read verbatim from the `Type` attribute rather
 * than narrowed to a closed union: the measured real-project vocabulary is
 * `"Text" | "Date" | "List"`, but mapping (or rejecting) an unrecognized
 * type is metadata-mapper's FR-8 "no GetWrite mapping" concern, not a
 * parse-time structural failure.
 */
export interface ScrivxCustomMetaDataField {
  readonly id: string;
  /** The field's `Type` attribute, verbatim. */
  readonly type: string;
  /** From the field's child `<Title>` element's text content — never a `Title` attribute (FR-18). */
  readonly title: string;
  /**
   * `<ListOptions><Option ID="..."/></ListOptions>` entries, when present
   * (List-type fields). Empty for every other field type.
   */
  readonly listOptions: readonly ScrivxListOption[];
}

/**
 * A single malformed or unexpected `.scrivx` fragment encountered anywhere
 * in the tree while parsing — a `MetaDataItem` missing `FieldID`/`Value`, a
 * `BinderItem` missing a required attribute, an unresolvable reference, or
 * any other element/attribute shape this parser does not recognize (FR-8,
 * OQ-12). Recorded rather than thrown, so parsing continues past it; only
 * an unreadable or non-XML `.scrivx` file still throws
 * ({@link "./scrivx-parser".ScrivxParseError}). Field names mirror
 * `import-report.ts`'s `ImportReportSkip` so a later task can flow this
 * list straight into the FR-9 report's skips section.
 */
export interface ScrivxFragmentError {
  /** The owning item's title, or a fallback identifier (e.g. its `UUID`) when no title is available. */
  readonly itemTitle: string;
  /** The owning item's position in the binder (or the document-root block name it lives under, e.g. `"LabelSettings"`), best-effort. */
  readonly binderPath: string;
  /** Human-readable reason the fragment was skipped. */
  readonly reason: string;
}

/**
 * Full parsed result returned by
 * {@link "./scrivx-parser".parseScrivxFile}: the raw `Creator` string (for
 * the FR-2 allow-list check), the binder tree's top-level items, the four
 * document-root settings/keyword blocks, and every FR-8 fragment error
 * encountered while parsing.
 */
export interface ScrivxParsed {
  /** The `<ScrivenerProject Creator="...">` attribute, unmodified. */
  readonly creator: string;
  /** Top-level `<Binder><BinderItem>` items, in binder order. */
  readonly binder: readonly ScrivxBinderItem[];
  /** `<LabelSettings><Labels><Label>` entries. */
  readonly labels: readonly ScrivxLabel[];
  /** `<StatusSettings><StatusItems><Status>` entries. */
  readonly statuses: readonly ScrivxStatus[];
  /** Document-root `<Keywords>` hierarchy. */
  readonly keywords: readonly ScrivxKeyword[];
  /** Document-root `<CustomMetaDataSettings><MetaDataField>` definitions. */
  readonly customMetaDataFields: readonly ScrivxCustomMetaDataField[];
  /**
   * Every malformed/unexpected `.scrivx` fragment skipped while parsing
   * (FR-8, OQ-12), in encounter order. Empty when the file parsed cleanly.
   */
  readonly fragmentErrors: readonly ScrivxFragmentError[];
}
