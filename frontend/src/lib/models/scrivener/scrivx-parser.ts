// Last Updated: 2026-09-11

/**
 * @module scrivx-parser
 *
 * Parses a Scrivener `.scrivx` project file (Task 2,
 * `specs/features/scrivener-cli-importer.md` FR-2/FR-3/FR-6/FR-7/FR-15) into
 * the typed shape declared in `scrivx-types.ts`, and implements FR-2's
 * Creator allow-list check.
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
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readFile } from "../io";
import type {
  ScrivxBinderItem,
  ScrivxBinderItemMetaData,
  ScrivxBinderItemType,
  ScrivxCustomMetaDataField,
  ScrivxCustomMetaDataFieldType,
  ScrivxCustomMetaDataValue,
  ScrivxKeyword,
  ScrivxLabel,
  ScrivxParsed,
  ScrivxStatus,
} from "./scrivx-types";

/**
 * Thrown by {@link parseScrivxFile} when the file at `scrivxPath` is not
 * well-formed XML, or is well-formed XML that does not carry the minimal
 * `ScrivenerProject`/`Binder` shape this parser requires. Deliberately not a
 * partial/best-effort parse: a malformed source file must fail loudly rather
 * than hand the importer a silently-incomplete binder tree.
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
  "MetaDataField",
  "MetaDataItem",
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
 * settings/keyword/custom-field blocks and the raw `Creator` string.
 *
 * Pure aside from the single file read: the XML text this reads is not
 * mutated, and no other filesystem effect occurs.
 *
 * @param scrivxPath - Absolute path to the `.scrivx` file.
 * @returns The fully parsed, typed project structure.
 * @throws {ScrivxParseError} When the file is not well-formed XML, or is
 *   missing the minimal `ScrivenerProject`/`Binder` shape this parser
 *   requires.
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

  let binder: readonly ScrivxBinderItem[];
  try {
    binder = readBinderItems(binderNode["BinderItem"]);
  } catch (err) {
    throw new ScrivxParseError(scrivxPath, (err as Error).message);
  }

  return {
    creator,
    binder,
    labels: readLabels(project["LabelSettings"]),
    statuses: readStatuses(project["StatusSettings"]),
    keywords: readKeywords(project["Keywords"]),
    customMetaDataFields: readCustomMetaDataFields(project["CustomMetaData"]),
  };
}

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAttr(node: XmlNode, attrName: string): string | undefined {
  const value = node[`@_${attrName}`];
  return typeof value === "string" ? value : undefined;
}

function requireAttr(node: XmlNode, attrName: string, tagName: string): string {
  const value = readAttr(node, attrName);
  if (value === undefined) {
    throw new Error(
      `<${tagName}> is missing a required "${attrName}" attribute`,
    );
  }
  return value;
}

function readTextValue(node: unknown): string {
  if (typeof node === "string") return node;
  if (isRecord(node) && typeof node["#text"] === "string") {
    return node["#text"] as string;
  }
  return "";
}

const BINDER_ITEM_TYPES: readonly ScrivxBinderItemType[] = [
  "DraftFolder",
  "ResearchFolder",
  "TrashFolder",
  "Folder",
  "Text",
  "Other",
];

function toBinderItemType(raw: string, uuid: string): ScrivxBinderItemType {
  if ((BINDER_ITEM_TYPES as readonly string[]).includes(raw)) {
    return raw as ScrivxBinderItemType;
  }
  throw new Error(`BinderItem "${uuid}" has an unrecognized Type "${raw}"`);
}

function readBinderItems(node: unknown): readonly ScrivxBinderItem[] {
  if (node === undefined) return [];
  const items = Array.isArray(node) ? node : [node];
  return items.map((item) => readBinderItem(item));
}

function readBinderItem(node: unknown): ScrivxBinderItem {
  if (!isRecord(node)) {
    throw new Error("<BinderItem> element has an unexpected shape");
  }
  const uuid = requireAttr(node, "UUID", "BinderItem");
  const rawType = requireAttr(node, "Type", "BinderItem");
  const title = readAttr(node, "Title") ?? "";

  return {
    uuid,
    type: toBinderItemType(rawType, uuid),
    title,
    metaData: readBinderItemMetaData(node["MetaData"]),
    keywordIds: readKeywordRefs(node["Keywords"]),
    children: readBinderItems(
      isRecord(node["Children"]) ? node["Children"]["BinderItem"] : undefined,
    ),
  };
}

function readBinderItemMetaData(node: unknown): ScrivxBinderItemMetaData {
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
    customMetaData: readCustomMetaDataValues(node["CustomMetaData"]),
  };
}

function readCustomMetaDataValues(
  node: unknown,
): readonly ScrivxCustomMetaDataValue[] {
  if (!isRecord(node)) return [];
  const items = node["MetaDataItem"];
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (!isRecord(item)) {
      throw new Error("<MetaDataItem> element has an unexpected shape");
    }
    return {
      fieldId: requireAttr(item, "ID", "MetaDataItem"),
      value: readAttr(item, "Value") ?? "",
    };
  });
}

function readKeywordRefs(node: unknown): readonly string[] {
  if (!isRecord(node)) return [];
  const keywords = node["Keyword"];
  if (!Array.isArray(keywords)) return [];
  return keywords.map((keyword) => {
    if (!isRecord(keyword)) {
      throw new Error("<Keyword> reference has an unexpected shape");
    }
    return requireAttr(keyword, "ID", "Keyword");
  });
}

function readLabels(node: unknown): readonly ScrivxLabel[] {
  if (!isRecord(node) || !isRecord(node["Labels"])) return [];
  const labels = node["Labels"]["Label"];
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => {
    if (!isRecord(label)) {
      throw new Error("<Label> element has an unexpected shape");
    }
    return {
      id: requireAttr(label, "ID", "Label"),
      name: readTextValue(label),
    };
  });
}

function readStatuses(node: unknown): readonly ScrivxStatus[] {
  if (!isRecord(node) || !isRecord(node["StatusItems"])) return [];
  const statuses = node["StatusItems"]["Status"];
  if (!Array.isArray(statuses)) return [];
  return statuses.map((status) => {
    if (!isRecord(status)) {
      throw new Error("<Status> element has an unexpected shape");
    }
    return {
      id: requireAttr(status, "ID", "Status"),
      name: readTextValue(status),
    };
  });
}

function readKeywords(node: unknown): readonly ScrivxKeyword[] {
  if (!isRecord(node)) return [];
  const keywords = node["Keyword"];
  if (!Array.isArray(keywords)) return [];
  return keywords.map((keyword) => readKeywordNode(keyword));
}

function readKeywordNode(node: unknown): ScrivxKeyword {
  if (!isRecord(node)) {
    throw new Error("<Keyword> definition has an unexpected shape");
  }
  return {
    id: requireAttr(node, "ID", "Keyword"),
    title: readAttr(node, "Title") ?? "",
    children: readKeywords(node["Children"]),
  };
}

const CUSTOM_METADATA_FIELD_TYPES: readonly ScrivxCustomMetaDataFieldType[] = [
  "Text",
  "Date",
  "List",
];

function readCustomMetaDataFields(
  node: unknown,
): readonly ScrivxCustomMetaDataField[] {
  if (!isRecord(node)) return [];
  const fields = node["MetaDataField"];
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => {
    if (!isRecord(field)) {
      throw new Error("<MetaDataField> element has an unexpected shape");
    }
    const id = requireAttr(field, "ID", "MetaDataField");
    const rawType = requireAttr(field, "Type", "MetaDataField");
    if (!(CUSTOM_METADATA_FIELD_TYPES as readonly string[]).includes(rawType)) {
      throw new Error(
        `<MetaDataField> "${id}" has an unrecognized Type "${rawType}"`,
      );
    }
    return {
      id,
      type: rawType as ScrivxCustomMetaDataFieldType,
      title: readAttr(field, "Title") ?? "",
    };
  });
}
