import {
    Document,
    Paragraph,
    TextRun,
    Packer,
    LineRuleType,
    BorderStyle,
    AlignmentType,
} from "docx";
import type { CompileSection } from "./compile-text";

// 1 inch = 1440 twips
const MARGIN = 1440;
// 11pt = 22 half-points
const BODY_SIZE = 22;
// 13pt = 26 half-points
const HEADER_SIZE = 26;
// 1.8× line height: 1.8 * 240 = 432
const LINE_SPACING = { line: 432, lineRule: LineRuleType.AUTO };
// ~33pt gap before each section start
const SECTION_SPACING_BEFORE = 480;

function bodyParagraph(text: string): Paragraph {
    return new Paragraph({
        children: [
            new TextRun({
                text,
                font: "Times New Roman",
                size: BODY_SIZE,
            }),
        ],
        spacing: { ...LINE_SPACING, before: 0, after: 0 },
    });
}

function headerParagraph(name: string): Paragraph {
    return new Paragraph({
        children: [
            new TextRun({
                text: name,
                font: "Calibri",
                size: HEADER_SIZE,
                bold: true,
            }),
        ],
        spacing: { ...LINE_SPACING, before: SECTION_SPACING_BEFORE, after: 120 },
        border: {
            bottom: {
                color: "000000",
                space: 4,
                style: BorderStyle.SINGLE,
                size: 6,
            },
        },
        alignment: AlignmentType.LEFT,
    });
}

export function buildDocxDocument(
    sections: CompileSection[],
    options: { includeHeaders: boolean },
): Document {
    const children: Paragraph[] = [];

    for (const section of sections) {
        if (options.includeHeaders) {
            children.push(headerParagraph(section.name));
        }

        const lines = section.content.split("\n");
        for (const line of lines) {
            children.push(bodyParagraph(line));
        }
    }

    return new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: MARGIN,
                            right: MARGIN,
                            bottom: MARGIN,
                            left: MARGIN,
                        },
                    },
                },
                children,
            },
        ],
    });
}

export { Packer };
