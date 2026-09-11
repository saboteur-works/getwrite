// Last Updated: 2026-09-11

/**
 * @module scrivx-parser
 *
 * Parses a Scrivener `.scrivx` project file (Task 2/Task 12,
 * `specs/features/scrivener-cli-importer.md` FR-2/FR-3/FR-6/FR-7/FR-8/
 * FR-15/FR-18) into the typed shape declared in `scrivx-types.ts`,
 * implements FR-2's Creator allow-list check, and implements FR-8/OQ-12's
 * skip-and-continue semantics for malformed/unexpected fragments anywhere
 * in the `.scrivx` tree.
 *
 * Reads via the `io.ts` `StorageAdapter` wrappers (`readFile`), never
 * `node:fs` directly, per `docs/standards/storage-context.md` §5. Unlike
 * every other model-layer read, the path here is an arbitrary absolute path
 * to a source `.scriv` package — not a location under a GetWrite
 * `projectRoot`/`tenantRoot` — so there is no per-project `StorageContext`
 * to establish first. `readFile` does not consult `StorageContext.projectRoot`
 * at all (only the *mutating* wrappers enforce the write barrier via it, see
 * `io.ts`'s `mutatingAdapter`), so it resolves to whatever adapter is
 * ambient — the real-fs default outside any active context, or the routed
 * adapter of an enclosing `runForTenant` scope the orchestrator (Task 8) may
 * already be inside for its own, unrelated destination-project writes. This
 * mirrors the convention `validateProjectTypeFile`
 * (`frontend/src/lib/models/schemas.ts`) established for the same
 * class of "read a spec file at an arbitrary caller-supplied path"
 * call — reading directly, with no `runForTenant` wrapping of its own —
 * except this module routes that read through `io.ts` rather than
 * `node:fs/promises` directly, since `docs/standards/storage-context.md` §5
 * requires all *new* model code to go through the adapter.
 *
 * Uses `fast-xml-parser` (already a transitive dependency elsewhere in the
 * lockfile, promoted here to a direct `frontend` dependency) rather than a
 * hand-rolled XML parser — unlike RTF parsing (Task 3), which the spec
 * explicitly scopes to a hand-rolled implementation, XML parsing is
 * out-of-scope work `docs/standards/package-selection.md` does not ask this
 * feature to duplicate.
 *
 * **FR-8/OQ-12 skip-and-continue**: every element/attribute shape this
 * module does not recognize while walking the tree below the root
 * `ScrivenerProject`/`Binder` (a `MetaDataItem` missing `FieldID`/`Value`, a
 * `BinderItem` missing a required attribute, an unrecognized reference,
 * etc.) is recorded as a {@link "./scrivx-types".ScrivxFragmentError} on the
 * returned `ScrivxParsed.fragmentErrors` and otherwise skipped —
 * `parseScrivxFile` only ever throws {@link ScrivxParseError} for an
 * unreadable/non-XML file, or a file missing the minimal root
 * `ScrivenerProject`/`Binder`/`Creator` shape (a document-level failure, not
 * a fragment-level one).
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readFile } from "../io";
import type {
  ScrivxBinderItem,
  ScrivxBinderItemMetaData,
  ScrivxBinderItemType,
  ScrivxCustomMetaDataField,
  ScrivxCustomMetaDataValue,
  ScrivxFragmentError,
  ScrivxKeyword,
  ScrivxLabel,
  ScrivxListOption,
  ScrivxParsed,
  ScrivxStatus,
} from "./scrivx-types";

/**
 * Thrown by {@link parseScrivxFile} when the file at `scrivxPath` is not
 * well-formed XML, or is well-formed XML that does not carry the minimal
 * `ScrivenerProject`/`Binder`/`Creator` shape this parser requires.
 * Deliberately not raised for a fragment-level shape problem below the root
 * — those are recorded as `ScrivxParsed.fragmentErrors` instead (FR-8,
 * OQ-12) — only an unreadable or structurally unrecognizable source file
 * fails loudly.
 */
export class ScrivxParseError extends Error {
  constructor(scrivxPath: string, reason: string) {
    super(`Failed to parse .scrivx file at "${scrivxPath}": ${reason}`);
    this.name = "ScrivxParseError";
  }
}

const ARRAY_TAG_NAMES = new Set([
  "BinderItem",
  "Label",
  "Status",
  "Keyword",
  "KeywordID",
  "MetaDataField",
  "MetaDataItem",
  "Option",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every tag value (StatusID, LabelID, Label/Status text, etc.) as a
  // literal string — this parser's own types are string-keyed throughout,
  // and letting fast-xml-parser infer numbers (e.g. `StatusID` "2" -> 2)
  // would silently diverge from that.
  parseTagValue: false,
  isArray: (name) => ARRAY_TAG_NAMES.has(name),
});

/** Loose shape of what `XMLParser.parse` hands back — narrowed by the reader helpers below. */
type XmlNode = Record<string, unknown>;

/**
 * Mutable accumulator threaded through every recursive reader below —
 * collects FR-8/OQ-12 fragment skips rather than throwing.
 */
interface ParseContext {
  readonly fragmentErrors: ScrivxFragmentError[];
}

/**
 * FR-2's Creator allow-list check: `true` only when `creator` starts with
 * the `SCRMAC-3` token identifying a Scrivener-3, Mac-authored project. This
 * is an allow-list, not a Windows/Scrivener-2 denylist — any unrecognized
 * `Creator` format (including an empty string, a Windows-authored project's
 * unsurveyed token, or a Scrivener 2 project's token) is refused by default.
 *
 * @param creator - The raw `<ScrivenerProject Creator="...">` attribute value.
 * @returns Whether the project is a supported import source.
 */
export function isSupportedScrivenerProject(creator: string): boolean {
  return creator.startsWith("SCRMAC-3");
}

/**
 * Parses a `.scrivx` file into a typed binder tree plus the document-root
 * settings/keyword/custom-field blocks, the raw `Creator` string, and every
 * FR-8/OQ-12 fragment skip encountered while walking the tree.
 *
 * Pure aside from the single file read: the XML text this reads is not
 * mutated, and no other filesystem effect occurs.
 *
 * @param scrivxPath - Absolute path to the `.scrivx` file.
 * @returns The fully parsed, typed project structure.
 * @throws {ScrivxParseError} When the file is not well-formed XML, or is
 *   missing the minimal `ScrivenerProject`/`Binder`/`Creator` shape this
 *   parser requires.
 */
export async function parseScrivxFile(
  scrivxPath: string,
): Promise<ScrivxParsed> {
  const raw = await readFile(scrivxPath, "utf8");

  const validation = XMLValidator.validate(raw);
  if (validation !== true) {
    throw new ScrivxParseError(scrivxPath, validation.err.msg);
  }

  let parsed: XmlNode;
  try {
    parsed = xmlParser.parse(raw) as XmlNode;
  } catch (err) {
    throw new ScrivxParseError(scrivxPath, (err as Error).message);
  }

  const project = parsed["ScrivenerProject"];
  if (!isRecord(project)) {
    throw new ScrivxParseError(
      scrivxPath,
      "missing root <ScrivenerProject> element",
    );
  }

  const creator = readAttr(project, "Creator");
  if (creator === undefined) {
    throw new ScrivxParseError(
      scrivxPath,
      "<ScrivenerProject> is missing a Creator attribute",
    );
  }

  const binderNode = project["Binder"];
  if (!isRecord(binderNode)) {
    throw new ScrivxParseError(scrivxPath, "missing <Binder> element");
  }

  const context: ParseContext = { fragmentErrors: [] };

  const binder = readBinderItems(binderNode["BinderItem"], context, "");

  return {
    creator,
    binder,
    labels: readLabels(project["LabelSettings"], context),
    statuses: readStatuses(project["StatusSettings"], context),
    keywords: readKeywords(project["Keywords"], context, "Keywords"),
    customMetaDataFields: readCustomMetaDataFields(
      project["CustomMetaDataSettings"],
      context,
    ),
    fragmentErrors: context.fragmentErrors,
  };
}

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAttr(node: XmlNode, attrName: string): string | undefined {
  const value = node[`@_${attrName}`];
  return typeof value === "string" ? value : undefined;
}

function readTextValue(node: unknown): string {
  if (typeof node === "string") return node;
  if (isRecord(node) && typeof node["#text"] === "string") {
    return node["#text"] as string;
  }
  return "";
}

/**
 * Reads a child element's text content, distinguishing "element absent" from
 * "element present with empty text" — the former returns `undefined`, the
 * latter `""`.
 */
function readChildText(node: XmlNode, tagName: string): string | undefined {
  const value = node[tagName];
  if (value === undefined) return undefined;
  return readTextValue(value);
}

function recordSkip(
  context: ParseContext,
  itemTitle: string,
  binderPath: string,
  reason: string,
): void {
  context.fragmentErrors.push({ itemTitle, binderPath, reason });
}

function joinPath(parentPath: string, segment: string): string {
  const label = segment || "(untitled)";
  return parentPath ? `${parentPath}/${label}` : label;
}

const BINDER_ITEM_TYPES: readonly ScrivxBinderItemType[] = [
  "DraftFolder",
  "ResearchFolder",
  "TrashFolder",
  "Folder",
  "Text",
  "Other",
];

function readBinderItems(
  node: unknown,
  context: ParseContext,
  parentPath: string,
): readonly ScrivxBinderItem[] {
  if (node === undefined) return [];
  const items = Array.isArray(node) ? node : [node];
  const result: ScrivxBinderItem[] = [];
  for (const item of items) {
    const binderItem = readBinderItem(item, context, parentPath);
    if (binderItem !== null) result.push(binderItem);
  }
  return result;
}

function readBinderItem(
  node: unknown,
  context: ParseContext,
  parentPath: string,
): ScrivxBinderItem | null {
  if (!isRecord(node)) {
    recordSkip(
      context,
      "(unknown)",
      parentPath,
      "<BinderItem> element has an unexpected shape",
    );
    return null;
  }

  // Title comes from a child <Title> element, never a Title attribute
  // (FR-18); a Type="Text" item legitimately may have none at all.
  const title = readChildText(node, "Title") ?? "";

  const uuid = readAttr(node, "UUID");
  if (uuid === undefined) {
    recordSkip(
      context,
      title || "(untitled)",
      joinPath(parentPath, title),
      '<BinderItem> is missing a required "UUID" attribute',
    );
    return null;
  }

  const binderPath = joinPath(parentPath, title || uuid);

  const rawType = readAttr(node, "Type");
  if (rawType === undefined) {
    recordSkip(
      context,
      title || uuid,
      binderPath,
      '<BinderItem> is missing a required "Type" attribute',
    );
    return null;
  }
  if (!(BINDER_ITEM_TYPES as readonly string[]).includes(rawType)) {
    recordSkip(
      context,
      title || uuid,
      binderPath,
      `<BinderItem> has an unrecognized Type "${rawType}"`,
    );
    return null;
  }
  const type = rawType as ScrivxBinderItemType;

  return {
    uuid,
    type,
    title,
    metaData: readBinderItemMetaData(
      node["MetaData"],
      context,
      title || uuid,
      binderPath,
    ),
    keywordIds: readKeywordIds(
      node["Keywords"],
      context,
      title || uuid,
      binderPath,
    ),
    children: readBinderItems(
      isRecord(node["Children"]) ? node["Children"]["BinderItem"] : undefined,
      context,
      binderPath,
    ),
  };
}

function readBinderItemMetaData(
  node: unknown,
  context: ParseContext,
  itemTitle: string,
  binderPath: string,
): ScrivxBinderItemMetaData {
  if (!isRecord(node)) {
    return { customMetaData: [] };
  }

  const includeRaw = node["IncludeInCompile"];
  const includeInCompile =
    typeof includeRaw === "string" ? includeRaw === "Yes" : undefined;

  const statusId =
    typeof node["StatusID"] === "string" ? node["StatusID"] : undefined;
  const labelId =
    typeof node["LabelID"] === "string" ? node["LabelID"] : undefined;

  return {
    includeInCompile,
    statusId,
    labelId,
    customMetaData: readCustomMetaDataValues(
      node["CustomMetaData"],
      context,
      itemTitle,
      binderPath,
    ),
  };
}

/**
 * Reads a binder item's `<MetaData><CustomMetaData><MetaDataItem>` entries.
 * Per FR-18, a value lives in `FieldID`/`Value` child elements — never an
 * `ID`/`Value` attribute pair — and a `MetaDataItem` missing either child is
 * an FR-8 skip of that value only, not the whole item (OQ-12).
 */
function readCustomMetaDataValues(
  node: unknown,
  context: ParseContext,
  itemTitle: string,
  binderPath: string,
): readonly ScrivxCustomMetaDataValue[] {
  if (!isRecord(node)) return [];
  const items = node["MetaDataItem"];
  if (!Array.isArray(items)) return [];

  const values: ScrivxCustomMetaDataValue[] = [];
  for (const item of items) {
    if (!isRecord(item)) {
      recordSkip(
        context,
        itemTitle,
        binderPath,
        "<MetaDataItem> element has an unexpected shape",
      );
      continue;
    }
    const fieldId = readChildText(item, "FieldID");
    if (fieldId === undefined) {
      recordSkip(
        context,
        itemTitle,
        binderPath,
        '<MetaDataItem> is missing a required "FieldID" child element',
      );
      continue;
    }
    const value = readChildText(item, "Value");
    if (value === undefined) {
      recordSkip(
        context,
        itemTitle,
        binderPath,
        '<MetaDataItem> is missing a required "Value" child element',
      );
      continue;
    }
    values.push({ fieldId, value });
  }
  return values;
}

/** Reads a binder item's own `<Keywords><KeywordID>` tag references (FR-18). */
function readKeywordIds(
  node: unknown,
  context: ParseContext,
  itemTitle: string,
  binderPath: string,
): readonly string[] {
  if (!isRecord(node)) return [];
  const ids = node["KeywordID"];
  if (!Array.isArray(ids)) return [];

  const result: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") {
      recordSkip(
        context,
        itemTitle,
        binderPath,
        "<KeywordID> element has an unexpected shape",
      );
      continue;
    }
    result.push(id);
  }
  return result;
}

function readLabels(
  node: unknown,
  context: ParseContext,
): readonly ScrivxLabel[] {
  if (!isRecord(node) || !isRecord(node["Labels"])) return [];
  const labels = node["Labels"]["Label"];
  if (!Array.isArray(labels)) return [];

  const result: ScrivxLabel[] = [];
  for (const label of labels) {
    if (!isRecord(label)) {
      recordSkip(
        context,
        "(unknown)",
        "LabelSettings",
        "<Label> element has an unexpected shape",
      );
      continue;
    }
    const id = readAttr(label, "ID");
    if (id === undefined) {
      recordSkip(
        context,
        readTextValue(label) || "(unknown)",
        "LabelSettings",
        '<Label> is missing a required "ID" attribute',
      );
      continue;
    }
    // Name is the element's own text content, never a Title attribute (FR-18).
    result.push({ id, name: readTextValue(label) });
  }
  return result;
}

function readStatuses(
  node: unknown,
  context: ParseContext,
): readonly ScrivxStatus[] {
  if (!isRecord(node) || !isRecord(node["StatusItems"])) return [];
  const statuses = node["StatusItems"]["Status"];
  if (!Array.isArray(statuses)) return [];

  const result: ScrivxStatus[] = [];
  for (const status of statuses) {
    if (!isRecord(status)) {
      recordSkip(
        context,
        "(unknown)",
        "StatusSettings",
        "<Status> element has an unexpected shape",
      );
      continue;
    }
    const id = readAttr(status, "ID");
    if (id === undefined) {
      recordSkip(
        context,
        readTextValue(status) || "(unknown)",
        "StatusSettings",
        '<Status> is missing a required "ID" attribute',
      );
      continue;
    }
    // Name is the element's own text content, never a Title attribute (FR-18).
    result.push({ id, name: readTextValue(status) });
  }
  return result;
}

function readKeywords(
  node: unknown,
  context: ParseContext,
  parentPath: string,
): readonly ScrivxKeyword[] {
  if (!isRecord(node)) return [];
  const keywords = node["Keyword"];
  if (!Array.isArray(keywords)) return [];

  const result: ScrivxKeyword[] = [];
  for (const keyword of keywords) {
    const readKeyword = readKeywordNode(keyword, context, parentPath);
    if (readKeyword !== null) result.push(readKeyword);
  }
  return result;
}

function readKeywordNode(
  node: unknown,
  context: ParseContext,
  parentPath: string,
): ScrivxKeyword | null {
  if (!isRecord(node)) {
    recordSkip(
      context,
      "(unknown)",
      parentPath,
      "<Keyword> definition has an unexpected shape",
    );
    return null;
  }

  const title = readChildText(node, "Title") ?? "";
  const id = readAttr(node, "ID");
  if (id === undefined) {
    recordSkip(
      context,
      title || "(untitled)",
      joinPath(parentPath, title),
      '<Keyword> is missing a required "ID" attribute',
    );
    return null;
  }

  const keywordPath = joinPath(parentPath, title || id);
  return {
    id,
    title,
    children: readKeywords(node["Children"], context, keywordPath),
  };
}

/**
 * Reads the document-root `<CustomMetaDataSettings><MetaDataField>` field
 * definitions (FR-18 — never `project["CustomMetaData"]`, which is
 * per-document values, not definitions), including `List`-type fields'
 * `<ListOptions><Option ID="..."/></ListOptions>` entries.
 */
function readCustomMetaDataFields(
  node: unknown,
  context: ParseContext,
): readonly ScrivxCustomMetaDataField[] {
  if (!isRecord(node)) return [];
  const fields = node["MetaDataField"];
  if (!Array.isArray(fields)) return [];

  const result: ScrivxCustomMetaDataField[] = [];
  for (const field of fields) {
    if (!isRecord(field)) {
      recordSkip(
        context,
        "(unknown)",
        "CustomMetaDataSettings",
        "<MetaDataField> element has an unexpected shape",
      );
      continue;
    }
    const title = readChildText(field, "Title") ?? "";
    const id = readAttr(field, "ID");
    if (id === undefined) {
      recordSkip(
        context,
        title || "(untitled)",
        "CustomMetaDataSettings",
        '<MetaDataField> is missing a required "ID" attribute',
      );
      continue;
    }
    const fieldPath = joinPath("CustomMetaDataSettings", title || id);
    const type = readAttr(field, "Type");
    if (type === undefined) {
      recordSkip(
        context,
        title || id,
        fieldPath,
        '<MetaDataField> is missing a required "Type" attribute',
      );
      continue;
    }

    result.push({
      id,
      type,
      title,
      listOptions: readListOptions(
        field["ListOptions"],
        context,
        title || id,
        fieldPath,
      ),
    });
  }
  return result;
}

function readListOptions(
  node: unknown,
  context: ParseContext,
  fieldTitle: string,
  fieldPath: string,
): readonly ScrivxListOption[] {
  if (!isRecord(node)) return [];
  const options = node["Option"];
  if (!Array.isArray(options)) return [];

  const optionsPath = joinPath(fieldPath, "ListOptions");
  const result: ScrivxListOption[] = [];
  for (const option of options) {
    if (!isRecord(option)) {
      recordSkip(
        context,
        fieldTitle,
        optionsPath,
        "<Option> element has an unexpected shape",
      );
      continue;
    }
    const id = readAttr(option, "ID");
    if (id === undefined) {
      recordSkip(
        context,
        fieldTitle,
        optionsPath,
        '<Option> is missing a required "ID" attribute',
      );
      continue;
    }
    result.push({ id, text: readTextValue(option) });
  }
  return result;
}
