// Last Updated: 2026-09-13

/**
 * @module heading-split
 *
 * Splits a single DOCX document's converted content into one section per
 * heading at a configurable level (`specs/features/docx-importer.md`, FR-2).
 *
 * **Input.** Consumes Task 6's `convertDocxToTiptap` output directly — the
 * `DocxTipTapDocument` and its sibling `notes: DocxNoteRef[]` array — rather
 * than the broader `types.ts` `TipTapDocument`, for the same reason
 * `mammoth-to-tiptap.ts` defines its own local types (see that module's
 * doc). This module does not construct or persist GetWrite resources
 * itself; Task 9's orchestrator turns each returned section into a
 * resource.
 *
 * **Split levels.** `level` is `1`-`6` (a heading level, default `1` per
 * FR-9) or `"none"` (import the whole document as a single, unsplit
 * section). At a numeric level, every top-level `heading` node whose
 * `attrs.level` matches starts a new section; the heading node itself stays
 * in that section's `content` (dropping it would lose real document
 * structure/formatting for no benefit — the extracted `title` is a
 * separate, derived field, not a destructive rename). Any heading at a
 * *different* level (e.g. an H2 encountered while splitting at H1) is left
 * exactly where it falls, inside whichever section it lands in — it never
 * starts a new section of its own.
 *
 * **No heading at the chosen level.** Per FR-2 (resolved parent OQ-19), this
 * is not an error: the whole document becomes a single section, and the
 * result's `noHeadingFound` flag is set so Task 8's report (FR-6(f)) can
 * record it. `noHeadingFound` is only ever `true` for a numeric `level`;
 * `"none"` means "no split requested," not "no heading found," so it is
 * always `false` for that mode.
 *
 * **Section titles and `titleSource` (FR-14, Stage 6.5, 2026-09-13).** A
 * section that starts with a matching heading whose own flattened inline
 * text is non-empty takes that text as its title, with `titleSource:
 * "heading"`. Every other section — the whole document under `"none"` or
 * when `noHeadingFound` is `true`, the content before the first matching
 * heading (when that content is non-empty), and (rare) a matching heading
 * whose own text is empty — gets `titleSource: "auto"` and a generated
 * placeholder name: {@link UNTITLED_SECTION_TITLE} ("Untitled"), or
 * "Untitled 2", "Untitled 3", ... for a second, third, ... auto-named
 * section within the same call's result, de-duplicated only among each
 * other in document order (mirroring `scrivener/binder-mapper.ts`'s
 * `resolveSiblingTitles`). This module only produces that numbering; it does
 * not know whether its single whole-document section (the `noHeadingFound`/
 * `"none"` case) will end up named from the source document's own core
 * title or filename instead — Task 9's orchestrator makes that substitution
 * for that one case, since only it has the core-properties/filename inputs
 * needed, and does not report it under the "Untitled Fallback Names"
 * category (FR-6(h)) — only a section actually named "Untitled"/"Untitled
 * 2"/... within an otherwise-successful split is reported there. Purely
 * blank leading content (no non-whitespace text anywhere in it) before the
 * first heading is dropped rather than becoming its own placeholder-titled
 * section, since an empty section carries no information worth a resource
 * of its own.
 *
 * **Attributing footnotes/endnotes to a section (a real design decision).**
 * Task 6 leaves each note reference in the running text as plain `"[n]"`
 * text (FR-13/resolved OQ-1) rather than as a distinct node type or a marked
 * span, so there is no structured way to ask "which section owns note
 * `n`?" — the reference is indistinguishable, structurally, from any other
 * text. This module resolves that by treating the `"[n]"` marker as the
 * sole source of truth for ownership: after a section's `content` is
 * carved out, its full text is flattened and scanned with `/\[(\d+)\]/g`,
 * and every distinct `n` found is looked up in the original `notes` array
 * (by `n`, not by position) to build that section's own `notes` list, in
 * the original array's order. A note whose number never appears as `"[n]"`
 * in any section's text (shouldn't happen given Task 6's own invariants,
 * but not assumed) is simply never attributed to any section, rather than
 * defaulting into the first one. This is a text-pattern match, not a
 * semantic one: a literal, human-typed `"[3]"` in the prose would be
 * mis-attributed as note 3. That is an accepted limitation of Task 6's own
 * "no footnote node yet" placeholder representation (OQ-1), not something
 * this module can repair without a structural change upstream.
 */
import type {
  DocxNoteRef,
  DocxTipTapBlockNode,
  DocxTipTapDocument,
} from "./mammoth-to-tiptap";

/** A footnote/endnote reference attributed to a single section, identical
 * in shape to Task 6's {@link DocxNoteRef}. */
type NoteRef = DocxNoteRef;

/** The heading level to split at (FR-9's `--split-level`), or `"none"` for
 * no split — the whole document imports as a single section. */
export type HeadingSplitLevel = 1 | 2 | 3 | 4 | 5 | 6 | "none";

/** Placeholder title (before any same-call de-duplication numbering — see
 * the module doc's "Section titles and `titleSource`" note) for a section
 * with no heading of its own to name it — pre-first-heading content, the
 * single section under `level: "none"`, the whole document when no heading
 * exists at the chosen level, or a matching heading with no text of its
 * own. */
export const UNTITLED_SECTION_TITLE = "Untitled";

/** How a {@link DocxSection}'s `title` was determined (FR-14, Stage 6.5,
 * 2026-09-13): `"heading"` when it is the section's own starting heading's
 * flattened, non-empty text; `"auto"` when it is a generated
 * {@link UNTITLED_SECTION_TITLE}-based placeholder. Task 9's orchestrator
 * uses this to decide the FR-14 no-heading/preamble naming rule and the
 * FR-6(h) report. */
export type DocxSectionTitleSource = "heading" | "auto";

/**
 * One heading-delimited (or, under `"none"`/`noHeadingFound`, whole-document)
 * section of a split DOCX document.
 */
export interface DocxSection {
  /** The section's title: the starting heading's flattened text
   * (`titleSource: "heading"`), or a generated, same-call-deduplicated
   * {@link UNTITLED_SECTION_TITLE} placeholder (`titleSource: "auto"`). */
  readonly title: string;
  /** How `title` was determined; see {@link DocxSectionTitleSource}. */
  readonly titleSource: DocxSectionTitleSource;
  /** This section's own slice of the original document, as a complete,
   * independently valid `DocxTipTapDocument`. */
  readonly content: DocxTipTapDocument;
  /** Footnotes/endnotes referenced within this section's own content
   * range, in the original `notes` array's order (see the module doc's
   * attribution algorithm). */
  readonly notes: readonly NoteRef[];
}

/** Result of {@link splitDocxAtHeadingLevel}. */
export interface SplitDocxResult {
  /** The ordered sections the document was split into; always at least
   * one. */
  readonly sections: readonly DocxSection[];
  /** `true` when a numeric `level` was requested but the document has no
   * heading at that level, so the whole document became a single section
   * (FR-2/FR-6(f)). Always `false` for `level: "none"`. */
  readonly noHeadingFound: boolean;
}

/** Flattened, whitespace-trimmed plain text of every inline text run inside
 * `nodes`, used both for a heading's own title text and for scanning a
 * section's body for `"[n]"` note markers. */
function flattenBlockText(nodes: readonly DocxTipTapBlockNode[]): string {
  return nodes
    .map((node) =>
      node.content
        .map((inline) => (inline.type === "text" ? inline.text : ""))
        .join(""),
    )
    .join("\n");
}

/** `true` when `nodes` contains at least one non-whitespace character of
 * inline text anywhere — used to decide whether pre-first-heading content
 * is substantial enough to become its own placeholder-titled section. */
function hasNonEmptyContent(nodes: readonly DocxTipTapBlockNode[]): boolean {
  return flattenBlockText(nodes).trim().length > 0;
}

/**
 * Every distinct footnote/endnote number referenced as a `"[n]"` marker
 * anywhere in `nodes`' flattened text (see the module doc's attribution
 * algorithm).
 */
function collectReferencedNoteNumbers(
  nodes: readonly DocxTipTapBlockNode[],
): Set<number> {
  const text = flattenBlockText(nodes);
  const referenced = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    referenced.add(Number(match[1]));
  }
  return referenced;
}

/**
 * Builds one {@link DocxSection} from a slice of the original document's
 * top-level nodes, attributing notes per the module doc's `"[n]"`-scanning
 * algorithm.
 *
 * @param title - The section's title (a heading's text, or a generated
 *   placeholder).
 * @param titleSource - How `title` was determined; see
 *   {@link DocxSectionTitleSource}.
 * @param nodes - This section's own top-level block nodes.
 * @param notes - The full, original notes array to attribute from.
 * @returns The assembled section.
 */
function buildSection(
  title: string,
  titleSource: DocxSectionTitleSource,
  nodes: readonly DocxTipTapBlockNode[],
  notes: readonly DocxNoteRef[],
): DocxSection {
  const referenced = collectReferencedNoteNumbers(nodes);
  return {
    title,
    titleSource,
    content: { type: "doc", content: [...nodes] },
    notes: notes.filter((note) => referenced.has(note.n)),
  };
}

/**
 * One not-yet-titled section, produced by a first pass over a normal
 * (heading-found) split, before {@link deduplicateAutoTitles} assigns final,
 * same-call-unique names to every `"auto"` one.
 */
interface RawSection {
  readonly title: string;
  readonly titleSource: DocxSectionTitleSource;
  readonly nodes: readonly DocxTipTapBlockNode[];
}

/**
 * Assigns final titles to a normal split's raw sections (FR-14, Stage 6.5,
 * 2026-09-13): every `"heading"` section keeps its own title unchanged; every
 * `"auto"` section is renumbered "Untitled", "Untitled 2", "Untitled 3", ...
 * in document order, de-duplicated only among the *other* `"auto"` sections
 * in this same result (mirroring `scrivener/binder-mapper.ts`'s
 * `resolveSiblingTitles`).
 */
function deduplicateAutoTitles(rawSections: readonly RawSection[]): string[] {
  let autoCount = 0;
  return rawSections.map((raw) => {
    if (raw.titleSource === "heading") return raw.title;
    autoCount += 1;
    return autoCount === 1
      ? UNTITLED_SECTION_TITLE
      : `${UNTITLED_SECTION_TITLE} ${autoCount}`;
  });
}

/**
 * Splits `document`'s converted content into one section per heading at
 * `level` (FR-2), attributing each of `notes` to whichever section
 * references it.
 *
 * @param document - The converted document from Task 6's
 *   `convertDocxToTiptap`.
 * @param notes - That same conversion's footnotes/endnotes.
 * @param level - The heading level to split at, or `"none"` for no split.
 * @returns The ordered sections plus the FR-6(f) `noHeadingFound` flag.
 * @example
 * const { document, notes } = await convertDocxToTiptap(docxBytes);
 * const { sections } = splitDocxAtHeadingLevel(document, notes, 1);
 */
export function splitDocxAtHeadingLevel(
  document: DocxTipTapDocument,
  notes: readonly DocxNoteRef[],
  level: HeadingSplitLevel,
): SplitDocxResult {
  if (level === "none") {
    return {
      sections: [
        buildSection(UNTITLED_SECTION_TITLE, "auto", document.content, notes),
      ],
      noHeadingFound: false,
    };
  }

  const headingIndexes = document.content
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "heading" && node.attrs.level === level)
    .map(({ index }) => index);

  if (headingIndexes.length === 0) {
    return {
      sections: [
        buildSection(UNTITLED_SECTION_TITLE, "auto", document.content, notes),
      ],
      noHeadingFound: true,
    };
  }

  const rawSections: RawSection[] = [];

  const leading = document.content.slice(0, headingIndexes[0]);
  if (hasNonEmptyContent(leading)) {
    rawSections.push({
      title: UNTITLED_SECTION_TITLE,
      titleSource: "auto",
      nodes: leading,
    });
  }

  headingIndexes.forEach((startIndex, position) => {
    const endIndex = headingIndexes[position + 1] ?? document.content.length;
    const sectionNodes = document.content.slice(startIndex, endIndex);
    const headingNode = sectionNodes[0];
    const headingTitle =
      headingNode.type === "heading"
        ? flattenBlockText([headingNode]).trim()
        : "";
    rawSections.push(
      headingTitle.length > 0
        ? { title: headingTitle, titleSource: "heading", nodes: sectionNodes }
        : {
            title: UNTITLED_SECTION_TITLE,
            titleSource: "auto",
            nodes: sectionNodes,
          },
    );
  });

  const titles = deduplicateAutoTitles(rawSections);
  const sections = rawSections.map((raw, index) =>
    buildSection(titles[index], raw.titleSource, raw.nodes, notes),
  );

  return { sections, noHeadingFound: false };
}
