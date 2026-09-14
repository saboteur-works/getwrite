// Last Updated: 2026-09-13

/**
 * @module core-properties
 *
 * Implements FR-14's read side (`specs/features/docx-importer.md`): a small,
 * separate reader for a `.docx` source's core title and author. `mammoth`
 * (the conversion pipeline used elsewhere in this feature, see
 * `mammoth-to-tiptap.ts`) does not read document properties at all, so this
 * module unzips the package directly and reads `docProps/core.xml` — the
 * OPC-standard core-properties part every `.docx` package carries (present
 * even when empty; see the OOXML/OPC spec's `dc:title`/`dc:creator`
 * elements) — itself.
 *
 * Uses `jszip` (a direct `frontend/package.json` dependency added for this
 * feature, see `docx-import-report.ts`'s sibling modules) to unzip the
 * package, and `fast-xml-parser` (already a direct dependency, added for
 * `scrivx-parser.ts`) to parse the extracted XML, mirroring
 * `scrivx-parser.ts`'s parsing convention rather than introducing a second
 * XML-parsing approach.
 */
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

/** The core document properties read from `docProps/core.xml`. */
export interface DocxCoreProperties {
  /** The document's core title (`dc:title`), when present and non-empty. */
  readonly title?: string;
  /** The document's core author (`dc:creator`), when present and non-empty. */
  readonly author?: string;
}

const CORE_PROPERTIES_PART = "docProps/core.xml";

const xmlParser = new XMLParser();

/** Loose shape of what `XMLParser.parse` hands back for `core.xml`. */
type XmlNode = Record<string, unknown>;

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a `dc:title`/`dc:creator`-style element's text content, treating an
 * absent element and an element present with empty/whitespace-only text
 * identically — both become `undefined` (FR-14: never an empty string
 * treated as present).
 */
function readNonEmptyText(
  coreProperties: XmlNode,
  tagName: string,
): string | undefined {
  const value = coreProperties[tagName];
  const text = typeof value === "string" ? value : undefined;
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Reads a `.docx` package's core title and author from `docProps/core.xml`.
 *
 * Pure function of its input bytes: performs no filesystem I/O of its own —
 * callers read the source file into memory first (e.g. via `io.ts`'s
 * `readFileBuffer`) and pass the resulting `Buffer` in.
 *
 * @param docxBytes - The `.docx` package's raw bytes.
 * @returns The document's title/author, each `undefined` when absent or
 *   empty (including when `docProps/core.xml` itself is absent from the
 *   package, or the package is not a valid zip).
 */
export async function readDocxCoreProperties(
  docxBytes: Buffer,
): Promise<DocxCoreProperties> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docxBytes);
  } catch {
    return {};
  }

  const corePropertiesFile = zip.file(CORE_PROPERTIES_PART);
  if (corePropertiesFile === null) return {};

  const raw = await corePropertiesFile.async("string");

  let parsed: XmlNode;
  try {
    parsed = xmlParser.parse(raw) as XmlNode;
  } catch {
    return {};
  }

  const coreProperties = parsed["cp:coreProperties"];
  if (!isRecord(coreProperties)) return {};

  return {
    title: readNonEmptyText(coreProperties, "dc:title"),
    author: readNonEmptyText(coreProperties, "dc:creator"),
  };
}
