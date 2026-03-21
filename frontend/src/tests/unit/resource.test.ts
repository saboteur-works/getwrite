import { describe, it, expect } from "vitest";
import {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
} from "../../lib/models/resource";
import { isValidUUID } from "../../lib/models/uuid";

describe("models/resource", () => {
    it("creates and validates TextResource", () => {
        const r = createTextResource({
            name: "Chapter 1",
            plainText: "Hello world\n\nSecond para",
        });
        expect(r.type).toBe("text");
        expect(r.slug).toBe("chapter-1");
        expect(isValidUUID(r.id)).toBe(true);
        expect(Date.parse(r.createdAt)).not.toBeNaN();
        expect(r.wordCount).toBeGreaterThan(0);
        expect(r.charCount).toBe(r.plainText?.length);
        expect(r.paragraphCount).toBe(2);
        const v = validateResource(r);
        expect(v.type).toBe("text");
        expect(v.id).toBe(r.id);
    });

    it("creates and validates ImageResource", () => {
        const r = createImageResource({
            name: "Cover",
            width: 600,
            height: 800,
            metadata: { focalPoint: "center" },
        });
        expect(r.type).toBe("image");
        expect(r.slug).toBe("cover");
        expect(isValidUUID(r.id)).toBe(true);
        expect(r.metadata?.focalPoint).toBe("center");
        const v = validateResource(r);
        expect(v.type).toBe("image");
        expect(v.width).toBe(600);
        expect(v.height).toBe(800);
    });

    it("creates and validates AudioResource", () => {
        const r = createAudioResource({
            name: "Narration",
            durationSeconds: 120.5,
            format: "mp3",
            metadata: { narrator: "Test Voice" },
        });
        expect(r.type).toBe("audio");
        expect(r.slug).toBe("narration");
        expect(isValidUUID(r.id)).toBe(true);
        expect(r.metadata?.narrator).toBe("Test Voice");
        const v = validateResource(r);
        expect(v.type).toBe("audio");
        expect(v.durationSeconds).toBe(120.5);
        expect(v.format).toBe("mp3");
    });
});
