import { describe, expect, it } from "vitest";

import {
    createFolderResource,
    createResourceOfType,
    validateResource,
} from "../../lib/models/resource";
import type { ResourceType } from "../../lib/models/types";
import { isValidUUID } from "../../lib/models/uuid";

const folderId = "11111111-1111-4111-8111-111111111111";

describe("models/resource factory regressions (T007)", () => {
    it("preserves resource identity and metadata through typed factory dispatch", () => {
        const metadata = {
            chapter: 3,
            tags: ["draft", "scene"],
        };

        const created = createResourceOfType("text", {
            name: "Scene 3!",
            type: "text",
            folderId,
            orderIndex: 7,
            metadata,
            text: {
                plainText: "First line\n\nSecond line",
            },
        });

        expect(created.type).toBe("text");
        expect(created.id).not.toBe("");
        expect(isValidUUID(created.id)).toBe(true);
        expect(created.folderId).toBe(folderId);
        expect(created.slug).toBe("scene-3");
        expect(created.orderIndex).toBe(7);
        expect(created.metadata).toEqual(metadata);
        if (created.type !== "text") {
            throw new Error(
                "Expected text resource from typed factory dispatch",
            );
        }
        expect(created.wordCount).toBe(4);
        expect(created.paragraphCount).toBe(2);

        const validated = validateResource(created);
        expect(validated.id).toBe(created.id);
        expect(validated.name).toBe("Scene 3!");
        expect(validated.type).toBe("text");
    });

    it("creates folder resources with stable parent mapping and slug normalization", () => {
        const folder = createFolderResource({
            name: "Workspace!",
            parentFolderId: folderId,
            orderIndex: 0,
            special: true,
        });

        expect(folder.type).toBe("folder");
        expect(folder.folderId).toBe(folderId);
        expect(folder.special).toBe(true);
        expect(folder.orderIndex).toBe(0);
        expect(folder.slug).toBe("workspace");
        expect(isValidUUID(folder.id)).toBe(true);
        expect(Date.parse(folder.createdAt)).not.toBeNaN();
    });

    it("rejects unsupported resource payloads at validation and dispatch boundaries", () => {
        expect(() =>
            validateResource({
                id: "not-a-uuid",
                name: "Broken",
                type: "text",
                createdAt: "not-a-date",
            }),
        ).toThrow();

        expect(() =>
            createResourceOfType("video" as unknown as ResourceType, {
                name: "Unsupported",
                type: "text",
            }),
        ).toThrow("Unsupported resource type: video");
    });
});
