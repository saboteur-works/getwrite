import { fileURLToPath } from "node:url";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { CompileSection } from "./compile-text";

/**
 * Server and desktop builds resolve the asset reference to a `file:` URL,
 * which becomes a local path. The static native client bundle has no `node:url`
 * `fileURLToPath` (its polyfill lacks it) and resolves the reference to the
 * app's own `/_next/static/media/...` path, which is kept as that same-origin
 * path. No remote URL is produced on either route.
 */
function localFontPath(url: URL): string {
  return url.protocol === "file:" ? fileURLToPath(url) : url.pathname;
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
        "../../../node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff2",
        import.meta.url,
      ),
    ),
    serifItalic: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff2",
        import.meta.url,
      ),
    ),
    sansRegular: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
        import.meta.url,
      ),
    ),
    sansBold: localFontPath(
      new URL(
        "../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2",
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
});
// GW-HEX-EXEMPT-END

export interface CompilePDFDocumentProps {
  sections: CompileSection[];
  includeHeaders: boolean;
}

export function CompilePDFDocument({
  sections,
  includeHeaders,
}: CompilePDFDocumentProps) {
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
            <Text style={styles.body}>{section.content}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
