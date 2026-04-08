import { describe, expect, it } from "vitest";
import {
    buildHeadingStyleAttribute,
    getNextHeadingLevel,
    getVisibleHeadingLevels,
    sanitizeEditorHeadingMap,
} from "../src/lib/editor-heading-settings";

describe("editor heading settings helpers", () => {
    it("keeps H1 through H3 visible by default", () => {
        expect(getVisibleHeadingLevels(undefined)).toEqual(["h1", "h2", "h3"]);
    });

    it("extends visible levels through the highest configured heading", () => {
        expect(
            getVisibleHeadingLevels({
                h5: { fontSize: "18px" },
            }),
        ).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    });

    it("drops empty heading values during sanitization", () => {
        expect(
            sanitizeEditorHeadingMap({
                h1: { fontSize: " 32px ", color: " " },
                h2: { fontFamily: "   " },
            }),
        ).toEqual({
            h1: { fontSize: "32px" },
        });
    });

    it("builds inline style strings without undefined declarations", () => {
        expect(
            buildHeadingStyleAttribute({
                fontSize: "28px",
                fontWeight: "700",
            }),
        ).toBe("font-size: 28px; font-weight: 700;");
    });

    it("returns the next available heading level", () => {
        expect(getNextHeadingLevel(["h1", "h2", "h3"])).toBe("h4");
        expect(
            getNextHeadingLevel(["h1", "h2", "h3", "h4", "h5", "h6"]),
        ).toBeNull();
    });
});
