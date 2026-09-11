// Last Updated: 2026-09-11

/**
 * @module scrivx-types
 *
 * Typed shape of a parsed Scrivener `.scrivx` file, as produced by
 * {@link "./scrivx-parser".parseScrivxFile}.
 *
 * These types mirror the XML shape measured directly off
 * `frontend/tests/fixtures/scrivener/sample.scriv/sample.scrivx` (Task 1),
 * not the schema-first-then-guess order: a `ScrivenerProject` root with a
 * `Binder` of nested `BinderItem`s, plus document-root
 * `StatusSettings`/`LabelSettings`/`Keywords`/`CustomMetaData` blocks. No RTF
 * content is modeled here — that is Task 3's concern; a `BinderItem` only
 * carries the metadata the `.scrivx` XML itself holds (`Type`, `Title`,
 * `UUID`, `MetaData`, per-document `Keywords` references, and nested
 * `Children`).
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
 * A single `<MetaDataItem ID="..." Value="..."/>` entry under a binder
 * item's `<MetaData><CustomMetaData>`, keyed by the field's `CustomMetaData`
 * `ID` (resolved against the document-root {@link ScrivxCustomMetaDataField}
 * definitions by a later task's mapper, not here).
 */
export interface ScrivxCustomMetaDataValue {
  /** The `CustomMetaData` field id this value belongs to, e.g. `"CMD1"`. */
  readonly fieldId: string;
  /** The raw string value, as it appeared in the `Value` attribute. */
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
  /** The `Title` attribute. */
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
  readonly title: string;
  readonly children: readonly ScrivxKeyword[];
}

/** The `Type` attribute values a `<MetaDataField>` definition may carry. */
export type ScrivxCustomMetaDataFieldType = "Text" | "Date" | "List";

/**
 * A single `<MetaDataField ID="..." Type="..." Title="..."/>` field
 * definition from the document-root `<CustomMetaData>` block.
 */
export interface ScrivxCustomMetaDataField {
  readonly id: string;
  readonly type: ScrivxCustomMetaDataFieldType;
  readonly title: string;
}

/**
 * Full parsed result returned by
 * {@link "./scrivx-parser".parseScrivxFile}: the raw `Creator` string (for
 * the FR-2 allow-list check), the binder tree's top-level items, and the
 * four document-root settings/keyword blocks.
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
  /** Document-root `<CustomMetaData><MetaDataField>` definitions. */
  readonly customMetaDataFields: readonly ScrivxCustomMetaDataField[];
}
