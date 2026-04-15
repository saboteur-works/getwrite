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

export function registerIBMPlexFonts() {
    Font.register({
        family: "IBM Plex Serif",
        fonts: [
            {
                src: "https://fonts.gstatic.com/s/ibmplexserif/v19/jizAREVNn1dOx-zrZ2X3pZvkTiUa4542.woff2",
                fontWeight: 400,
                fontStyle: "normal",
            },
            {
                src: "https://fonts.gstatic.com/s/ibmplexserif/v19/jizHREVNn1dOx-zrZ2X3pZvkTiUa2zgRnF0.woff2",
                fontWeight: 400,
                fontStyle: "italic",
            },
        ],
    });

    Font.register({
        family: "IBM Plex Sans",
        fonts: [
            {
                src: "https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKhdHeFQ.woff2",
                fontWeight: 400,
                fontStyle: "normal",
            },
            {
                src: "https://fonts.gstatic.com/s/ibmplexsans/v19/zYX8KVElMYYaJe8bpLHnCwDKhdTmrINce_fuJGl18QRY.woff2",
                fontWeight: 700,
                fontStyle: "normal",
            },
        ],
    });
}

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
    section: {
        marginBottom: 36,
    },
    headerContainer: {
        marginBottom: 12,
    },
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
    body: {
        fontFamily: "IBM Plex Serif",
        fontSize: 11,
        lineHeight: 1.8,
    },
});

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
                                <Text style={styles.headerText}>
                                    {section.name}
                                </Text>
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
