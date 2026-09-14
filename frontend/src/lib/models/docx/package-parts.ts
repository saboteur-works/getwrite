// Last Updated: 2026-09-13

/**
 * @module package-parts
 *
 * Implements FR-18's package-part detection for the DOCX importer
 * (`specs/features/docx-importer.md`): comments, tracked changes, and
 * images/embedded media, detected by inspecting the DOCX package's own XML
 * parts directly — never by reading `mammoth`'s conversion messages, which
 * FR-18 explicitly rules out as the source for these three counts.
 *
 * A `.docx` file is a ZIP (OPC) package. This module unzips it with `jszip`
 * (a direct `frontend/package.json` dependency, added by Task 1 as one of
 * `mammoth`'s runtime deps) and parses `word/document.xml` — and, when
 * present, `word/comments.xml` — with `fast-xml-parser`, mirroring the
 * parsing-library convention `scrivx-parser.ts` established for the
 * Scrivener importer (a direct dependency chosen over a hand-rolled parser,
 * since XML parsing is out-of-scope work `docs/standards/package-selection.md`
 * does not ask this feature to duplicate).
 *
 * Detection counts occurrences of specific element tag names in the parsed
 * XML tree, not text search over the raw XML string, so a tag name occurring
 * inside e.g. an attribute value or a text run's contents is never
 * miscounted:
 *
 * - Tracked changes: every `w:ins` (inserted-content wrapper) and `w:del`
 *   (deleted-content wrapper) element in `word/document.xml`.
 * - Images/embedded media: every `w:drawing` (modern floating/inline
 *   image), `w:pict` (legacy VML image), and `w:object` (embedded OLE
 *   object) element in `word/document.xml`.
 * - Comments: every top-level `<w:comment>` element in `word/comments.xml`,
 *   when that part exists. A DOCX package with no comments never has this
 *   part at all — its absence is `0` comments, not an error.
 *
 * This module takes the already-read package bytes as input and performs no
 * filesystem I/O of its own; a caller (Task 9's orchestrator) is responsible
 * for reading the source `.docx` file.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

/**
 * The three FR-18 package-part detection counts for a single `.docx`
 * package. Consumed by Task 9's orchestrator to populate the FR-6 report's
 * `commentsNotImportedCount`, `trackedChangesCount`, and
 * `imagesNotImportedCount` fields (see `docx-import-report.ts`) — the field
 * names here are deliberately shorter, since this module makes no claim
 * about whether any of these were "not imported" (that is Task 9's
 * pipeline-level decision, mirroring FR-18's stripping requirement for
 * images), only how many of each the package itself contains.
 */
export interface DocxPackageFeatures {
  /** Number of `<w:comment>` elements found in `word/comments.xml`, or `0` when that part is absent. */
  readonly commentCount: number;
  /** Number of `w:ins`/`w:del` tracked-change elements found in `word/document.xml`. */
  readonly trackedChangeCount: number;
  /** Number of `w:drawing`/`w:pict`/`w:object` image/embedded-media elements found in `word/document.xml`. */
  readonly imageCount: number;
}

/** Tag names counted as tracked changes, per FR-18. */
const TRACKED_CHANGE_TAGS = ["w:ins", "w:del"] as const;

/** Tag names counted as images/embedded media, per FR-18. */
const IMAGE_TAGS = ["w:drawing", "w:pict", "w:object"] as const;

/**
 * `fast-xml-parser` returns a single node directly (not wrapped in an array)
 * when a repeated tag occurs exactly once, and only wraps it in an array
 * when it occurs more than once. `isArray` is not configured here since the
 * exact set of possible tag names is open-ended (any element in
 * `word/document.xml`) — instead, {@link countMatchingTags} walks the parsed
 * tree recursively and counts every key match at any depth, handling both
 * shapes.
 */
type XmlNode = Record<string, unknown>;

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively walks a parsed XML tree, counting every occurrence of any of
 * `tagNames` as an object key, regardless of depth or of whether
 * `fast-xml-parser` represents a given occurrence as a single node object or
 * as an array of nodes (which it does once the same tag repeats under the
 * same parent).
 */
function countMatchingTags(
  node: unknown,
  tagNames: readonly string[],
): number {
  if (Array.isArray(node)) {
    return node.reduce(
      (sum, child) => sum + countMatchingTags(child, tagNames),
      0,
    );
  }
  if (!isRecord(node)) return 0;

  let count = 0;
  for (const [key, value] of Object.entries(node)) {
    if (tagNames.includes(key)) {
      count += Array.isArray(value) ? value.length : 1;
    }
    count += countMatchingTags(value, tagNames);
  }
  return count;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Detects FR-18's three package-part features — comments, tracked changes,
 * and images/embedded media — directly from a `.docx` package's own XML
 * parts, never from `mammoth`'s conversion messages.
 *
 * @param docxBytes - The raw bytes of a `.docx` (ZIP/OPC) package.
 * @returns The three detection counts. Never throws for a missing
 *   `word/comments.xml` part (comments count `0`); a malformed or
 *   non-ZIP `docxBytes` propagates `jszip`'s own rejection, since that is a
 *   document-level failure this module does not attempt to recover from.
 */
export async function detectDocxPackageFeatures(
  docxBytes: Uint8Array | Buffer,
): Promise<DocxPackageFeatures> {
  const zip = await JSZip.loadAsync(docxBytes);

  const documentXml = await readZipEntryText(zip, "word/document.xml");
  const documentTree =
    documentXml === undefined
      ? undefined
      : (xmlParser.parse(documentXml) as XmlNode);

  const trackedChangeCount = documentTree
    ? countMatchingTags(documentTree, TRACKED_CHANGE_TAGS)
    : 0;
  const imageCount = documentTree
    ? countMatchingTags(documentTree, IMAGE_TAGS)
    : 0;

  const commentsXml = await readZipEntryText(zip, "word/comments.xml");
  const commentCount =
    commentsXml === undefined
      ? 0
      : countMatchingTags(xmlParser.parse(commentsXml) as XmlNode, [
          "w:comment",
        ]);

  return { commentCount, trackedChangeCount, imageCount };
}

/**
 * Reads a single ZIP entry as UTF-8 text, returning `undefined` when the
 * entry does not exist in the package rather than throwing — this is how
 * `word/comments.xml`'s absence (a package with no comments) is
 * distinguished from a parse error.
 */
async function readZipEntryText(
  zip: JSZip,
  entryPath: string,
): Promise<string | undefined> {
  const entry = zip.file(entryPath);
  if (entry === null) return undefined;
  return entry.async("string");
}
