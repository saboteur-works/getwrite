import { describe, it, expect } from "vitest";
import {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
} from "../../lib/models/resource";
import { isValidUUID } from "../../lib/models/uuid";

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";

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
            userMetadata: { focalPoint: "center" },
        });
        expect(r.type).toBe("image");
        expect(r.slug).toBe("cover");
        expect(isValidUUID(r.id)).toBe(true);
        expect(r.userMetadata?.focalPoint).toBe("center");
        const v = validateResource(r);
        expect(v.type).toBe("image");
        if (v.type !== "image") {
            throw new Error("expected validated image resource");
        }
        expect(v.width).toBe(600);
        expect(v.height).toBe(800);
    });

    it("creates and validates AudioResource", () => {
        const r = createAudioResource({
            name: "Narration",
            durationSeconds: 120.5,
            format: "mp3",
            userMetadata: { narrator: "Test Voice" },
        });
        expect(r.type).toBe("audio");
        expect(r.slug).toBe("narration");
        expect(isValidUUID(r.id)).toBe(true);
        expect(r.userMetadata?.narrator).toBe("Test Voice");
        const v = validateResource(r);
        expect(v.type).toBe("audio");
        if (v.type !== "audio") {
            throw new Error("expected validated audio resource");
        }
        expect(v.durationSeconds).toBe(120.5);
        expect(v.format).toBe("mp3");
    });

    it("preserves folder identity and ordering userMetadata through validation", () => {
        const r = createTextResource({
            name: "Scene 2",
            folderId: FOLDER_ID,
            plainText: "A focused scene",
            userMetadata: { status: "Draft" },
        });

        const validated = validateResource(r);
        expect(validated.id).toBe(r.id);
        expect(validated.folderId).toBe(FOLDER_ID);
        expect(validated.userMetadata?.status).toBe("Draft");
    });
});
