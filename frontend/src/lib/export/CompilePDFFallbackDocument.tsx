import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CompileSection } from "./compile-text";

// Uses only built-in PDF fonts (no network fetch required).
// Times-Roman is the closest built-in analog to IBM Plex Serif.
// Helvetica-Bold is the closest built-in analog to IBM Plex Sans.
const styles = StyleSheet.create({
    page: {
        fontFamily: "Times-Roman",
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
        fontFamily: "Helvetica-Bold",
        fontSize: 13,
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
        fontFamily: "Times-Roman",
        fontSize: 11,
        lineHeight: 1.8,
    },
});

export interface CompilePDFFallbackDocumentProps {
    sections: CompileSection[];
    includeHeaders: boolean;
}

export function CompilePDFFallbackDocument({
    sections,
    includeHeaders,
}: CompilePDFFallbackDocumentProps) {
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
