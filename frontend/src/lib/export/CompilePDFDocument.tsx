import nodeUrl from "node:url";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Styles } from "@react-pdf/renderer";
import type { CitationRun } from "../citations/citation-engine";
import type { CompileSection } from "./compile-text";

/** One react-pdf style object. */
type Style = Styles[string];

/**
 * Server and desktop builds resolve the asset reference to a `file:` URL,
 * which becomes a local path. The static native client bundle has no `node:url`
 * `fileURLToPath` (its polyfill lacks it) and resolves the reference to the
 * app's own `/_next/static/media/...` path, which is kept as that same-origin
 * path. No remote URL is produced on either route.
 */
function localFontPath(url: URL): string {
  return url.protocol === "file:" ? nodeUrl.fileURLToPath(url) : url.pathname;
}

/**
 * Local file paths of the bundled @fontsource faces the PDF export embeds.
 * Each `new URL(literal, import.meta.url)` is an asset reference the bundler
 * and the standalone file tracer follow; no font host is contacted (FR-4).
 */
function plexFontFiles(): {
  serifRegular: string;
  serifItalic: string;
  sansRegular: string;
  sansBold: string;
} {
  return {
    serifRegular: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff",
        import.meta.url,
      ),
    ),
    serifItalic: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff",
        import.meta.url,
      ),
    ),
    sansRegular: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff",
        import.meta.url,
      ),
    ),
    sansBold: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff",
        import.meta.url,
      ),
    ),
  };
}

export function registerIBMPlexFonts() {
  const files = plexFontFiles();

  Font.register({
    family: "IBM Plex Serif",
    fonts: [
      { src: files.serifRegular, fontWeight: 400, fontStyle: "normal" },
      { src: files.serifItalic, fontWeight: 400, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: files.sansRegular, fontWeight: 400, fontStyle: "normal" },
      { src: files.sansBold, fontWeight: 700, fontStyle: "normal" },
    ],
  });
}

// GW-HEX-EXEMPT-START: @react-pdf/renderer StyleSheet — CSS variables are not supported in PDF rendering context
const styles = StyleSheet.create({
  page: {
    fontFamily: "IBM Plex Serif",
    fontSize: 11,
    lineHeight: 1.8,
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    color: "#1a1a1a",
  },
  section: { marginBottom: 36 },
  headerContainer: { marginBottom: 12 },
  headerText: {
    fontFamily: "IBM Plex Sans",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.3,
    color: "#1a1a1a",
    marginBottom: 6,
  },
  headerRule: {
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
  },
  body: { fontFamily: "IBM Plex Serif", fontSize: 11, lineHeight: 1.8 },
  noteMark: { fontSize: 7, verticalAlign: "super" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 72,
    right: 72,
    fontFamily: "IBM Plex Serif",
    fontSize: 8,
  },
  // Task 36 measured the footer text present only with lineHeight 1 on each
  // footer Text under the page's 1.8; the cause was not established.
  footerNote: { lineHeight: 1, marginTop: 1 },
  bibliographyEntry: { marginBottom: 6 },
});
// GW-HEX-EXEMPT-END

/** One note: the reference mark goes at `offset` (UTF-16) in `sections[sectionIndex].content`. */
export interface PdfNote {
  sectionIndex: number;
  offset: number;
  /** Manuscript-wide note number from 1, unique across the input. */
  noteNumber: number;
  runs: readonly CitationRun[];
}

export interface PdfBibliography {
  heading: string;
  entries: readonly { runs: readonly CitationRun[] }[];
}

/**
 * Optional citations input. Absent, the document is exactly today's. Notes
 * are drawn by the two-pass build of `experiments/task-36.md`; the caller
 * drives the passes: render with no `notePlacement`, extract per-page text,
 * call `placeNotesOnPages`, render again with the returned placement, and
 * compare the two page counts.
 */
export interface PdfCitationsInput {
  notes: readonly PdfNote[];
  bibliography?: PdfBibliography;
}

/** Page number (1-based) to the note numbers drawn in that page's footer. */
export type PdfNotePlacement = ReadonlyMap<number, readonly number[]>;

export type PlaceNotesResult =
  | { ok: true; placement: Map<number, number[]> }
  | { ok: false; message: string };

/**
 * Style of one run. Italic uses the registered Serif italic; bold uses the
 * registered Sans bold (Serif has no bold face and Sans no italic, so a run
 * that is both prints bold only). Small caps gives the style of the
 * lower-case letters (capitals, smaller); `renderRuns` applies it to those
 * letters only. A `link` is never styled or linked: its text prints as
 * plain text (FR-21).
 */
export function citationRunStyle(
  run: CitationRun,
  baseFontSize: number,
): Style {
  const style: Style = {};
  if (run.italic) style.fontStyle = "italic";
  if (run.bold) {
    style.fontFamily = "IBM Plex Sans";
    style.fontWeight = 700;
    style.fontStyle = "normal";
  }
  if (run.smallCaps) {
    style.textTransform = "uppercase";
    style.fontSize = baseFontSize * 0.8;
  }
  if (run.superscript) {
    style.verticalAlign = "super";
    style.fontSize = baseFontSize * 0.7;
  } else if (run.subscript) {
    style.verticalAlign = "sub";
    style.fontSize = baseFontSize * 0.7;
  }
  return style;
}

/** Splits text into lower-case stretches (shrunk capitals) and the rest. */
function smallCapsSegments(text: string): { text: string; lower: boolean }[] {
  const out: { text: string; lower: boolean }[] = [];
  for (const m of text.matchAll(/(\p{Ll}+)|([^\p{Ll}]+)/gu)) {
    out.push({ text: m[0], lower: m[1] !== undefined });
  }
  return out;
}

function renderRuns(
  runs: readonly CitationRun[],
  baseFontSize: number,
  keyPrefix: string,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  runs.forEach((run, i) => {
    if (!run.smallCaps) {
      out.push(
        <Text
          key={`${keyPrefix}-${i}`}
          style={citationRunStyle(run, baseFontSize)}
        >
          {run.text}
        </Text>,
      );
      return;
    }
    const plain = citationRunStyle({ ...run, smallCaps: false }, baseFontSize);
    const shrunk = citationRunStyle(run, baseFontSize);
    smallCapsSegments(run.text).forEach((seg, j) => {
      out.push(
        <Text key={`${keyPrefix}-${i}-${j}`} style={seg.lower ? shrunk : plain}>
          {seg.text}
        </Text>,
      );
    });
  });
  return out;
}

/** Throws an Error naming the problem (numbers only, no content) for a bad input. */
export function validateNotes(
  sections: readonly CompileSection[],
  notes: readonly PdfNote[],
): void {
  const seen = new Set<number>();
  for (const note of notes) {
    const section = sections[note.sectionIndex];
    if (!Number.isInteger(note.sectionIndex) || section === undefined) {
      throw new Error(
        `Note ${note.noteNumber} names a section that is not in the compile.`,
      );
    }
    if (
      !Number.isInteger(note.offset) ||
      note.offset < 0 ||
      note.offset > section.content.length
    ) {
      throw new Error(
        `Note ${note.noteNumber} has an offset outside its section.`,
      );
    }
    if (!Number.isInteger(note.noteNumber) || note.noteNumber < 1) {
      throw new Error("A note number must be a whole number from 1.");
    }
    if (seen.has(note.noteNumber)) {
      throw new Error(`Duplicate note number ${note.noteNumber}.`);
    }
    seen.add(note.noteNumber);
  }
}

function inDocumentOrder(notes: readonly PdfNote[]): PdfNote[] {
  return [...notes].sort(
    (a, b) =>
      a.sectionIndex - b.sectionIndex ||
      a.offset - b.offset ||
      a.noteNumber - b.noteNumber,
  );
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

const CONTEXT_CHARACTERS = 4;

/**
 * Pass 1 helper: finds the page of each reference mark in the extracted
 * per-page text of a render with no footer. Marks are searched in document
 * order, each after the previous one, as the mark number glued to the last
 * few non-space characters before it; a mark that wrapped to the first line
 * of a page is matched across the page boundary. A mark that cannot be found
 * fails the result naming its number; it is never dropped.
 */
export function placeNotesOnPages(
  pass1PageTexts: readonly string[],
  sections: readonly CompileSection[],
  notes: readonly PdfNote[],
): PlaceNotesResult {
  validateNotes(sections, notes);
  const pages = pass1PageTexts.map(squash);
  const placement = new Map<number, number[]>();
  let page = 0;
  let pos = 0;
  for (const note of inDocumentOrder(notes)) {
    const content = sections[note.sectionIndex]?.content ?? "";
    const tail = squash(content.slice(0, note.offset)).slice(
      -CONTEXT_CHARACTERS,
    );
    const mark = String(note.noteNumber);
    let found: { page: number; pos: number } | undefined;
    for (let p = page; p < pages.length && found === undefined; p += 1) {
      const text = pages[p] ?? "";
      const idx = text.indexOf(tail + mark, p === page ? pos : 0);
      if (idx >= 0) {
        found = { page: p, pos: idx + tail.length + mark.length };
        continue;
      }
      const next = pages[p + 1];
      if (next !== undefined && text.endsWith(tail) && next.startsWith(mark)) {
        found = { page: p + 1, pos: mark.length };
      }
    }
    if (found === undefined) {
      return {
        ok: false,
        message: `The reference mark of note ${note.noteNumber} was not found in the rendered pages.`,
      };
    }
    page = found.page;
    pos = found.pos;
    placement.set(page + 1, [
      ...(placement.get(page + 1) ?? []),
      note.noteNumber,
    ]);
  }
  return { ok: true, placement };
}

export interface CompilePDFDocumentProps {
  sections: CompileSection[];
  includeHeaders: boolean;
  citations?: PdfCitationsInput;
  /** Pass 2 only: the footer of each page draws these notes. */
  notePlacement?: PdfNotePlacement;
}

function SectionBody({
  section,
  notes,
}: {
  section: CompileSection;
  notes: readonly PdfNote[];
}) {
  if (notes.length === 0) {
    return <Text style={styles.body}>{section.content}</Text>;
  }
  const pieces: React.ReactNode[] = [];
  let at = 0;
  for (const note of notes) {
    pieces.push(section.content.slice(at, note.offset));
    pieces.push(
      <Text key={`mark-${note.noteNumber}`} style={styles.noteMark}>
        {String(note.noteNumber)}
      </Text>,
    );
    at = note.offset;
  }
  pieces.push(section.content.slice(at));
  return <Text style={styles.body}>{pieces}</Text>;
}

function NotesFooter({
  notesByNumber,
  numbers,
}: {
  notesByNumber: ReadonlyMap<number, PdfNote>;
  numbers: readonly number[];
}) {
  return (
    <View>
      {numbers.map((n) => {
        const note = notesByNumber.get(n);
        if (note === undefined) return null;
        return (
          <Text key={n} style={styles.footerNote}>
            <Text style={styles.noteMark}>{String(n)}</Text>{" "}
            {renderRuns(note.runs, 8, `f${n}`)}
          </Text>
        );
      })}
    </View>
  );
}

export function CompilePDFDocument({
  sections,
  includeHeaders,
  citations,
  notePlacement,
}: CompilePDFDocumentProps) {
  const notes = citations?.notes ?? [];
  validateNotes(sections, notes);
  const ordered = inDocumentOrder(notes);
  const notesByNumber = new Map(notes.map((n) => [n.noteNumber, n]));
  const bibliography = citations?.bibliography;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            {includeHeaders && (
              <View style={styles.headerContainer}>
                <Text style={styles.headerText}>{section.name}</Text>
                <View style={styles.headerRule} />
              </View>
            )}
            <SectionBody
              section={section}
              notes={ordered.filter((n) => n.sectionIndex === i)}
            />
          </View>
        ))}
        {bibliography !== undefined && (
          <View style={styles.section}>
            <View style={styles.headerContainer}>
              <Text style={styles.headerText}>{bibliography.heading}</Text>
              <View style={styles.headerRule} />
            </View>
            {bibliography.entries.map((entry, i) => (
              <Text key={i} style={[styles.body, styles.bibliographyEntry]}>
                {renderRuns(entry.runs, 11, `b${i}`)}
              </Text>
            ))}
          </View>
        )}
        {notePlacement !== undefined && notes.length > 0 && (
          <View
            fixed
            style={styles.footer}
            render={({ pageNumber }) => (
              <NotesFooter
                notesByNumber={notesByNumber}
                numbers={notePlacement.get(pageNumber) ?? []}
              />
            )}
          />
        )}
      </Page>
    </Document>
  );
}
