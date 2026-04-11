import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    inspectResourceTemplate,
    listResourceTemplates,
    saveResourceTemplate,
    scaffoldResourcesFromTemplate,
    validateResourceTemplate,
} from "../../src/lib/models/resource-templates";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/template-service regressions (T007)", () => {
    it("returns an empty template list when the template directory has not been created", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-template-list-"),
        );

        try {
            await expect(listResourceTemplates(projectRoot)).resolves.toEqual(
                [],
            );
        } finally {
            await removeDirRetry(projectRoot);
        }
    });

    it("inspects placeholders from template content while surfacing metadata keys separately", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-template-inspect-"),
        );

        try {
            await saveResourceTemplate(projectRoot, {
                id: "tpl-nested-placeholders",
                name: "{{TITLE}}",
                type: "text",
                plainText: "{{TITLE}}\n\n{{SUBTITLE}}",
                userMetadata: {
                    nested: {
                        header: "{{TITLE}}",
                        footer: "{{AUTHOR}}",
                    },
                },
            });

            const inspection = await inspectResourceTemplate(
                projectRoot,
                "tpl-nested-placeholders",
            );

            expect(inspection.placeholders.sort()).toEqual([
                "SUBTITLE",
                "TITLE",
            ]);
            expect(inspection.metadataKeys).toEqual(["nested"]);
        } finally {
            await removeDirRetry(projectRoot);
        }
    });

    it("reports schema validation errors for malformed saved templates", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-template-validate-"),
        );

        try {
            const templatesDir = path.join(projectRoot, "meta", "templates");
            await fs.mkdir(templatesDir, { recursive: true });
            await fs.writeFile(
                path.join(templatesDir, "tpl-invalid.json"),
                JSON.stringify({
                    id: "tpl-invalid",
                    name: "Broken Template",
                    type: "folder",
                }),
                "utf8",
            );

            const result = await validateResourceTemplate(
                projectRoot,
                "tpl-invalid",
            );

            expect(result.valid).toBe(false);
            if (result.valid) {
                throw new Error(
                    "expected validation to fail for malformed template",
                );
            }
            expect(result.errors.some((error) => error.includes("type"))).toBe(
                true,
            );
        } finally {
            await removeDirRetry(projectRoot);
        }
    });

    it("scaffolds multiple resources from one template with sequential names", async () => {
        const projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "getwrite-template-scaffold-"),
        );

        try {
            await saveResourceTemplate(projectRoot, {
                id: "tpl-batch",
                name: "Scene",
                type: "text",
                plainText: "Body",
            });

            const createdIds = await scaffoldResourcesFromTemplate(
                projectRoot,
                "tpl-batch",
                3,
            );

            expect(createdIds).toHaveLength(3);
            expect(new Set(createdIds).size).toBe(3);

            const resourceEntries = await fs.readdir(
                path.join(projectRoot, "resources"),
            );
            expect(resourceEntries).toHaveLength(3);

            const sidecars = await Promise.all(
                createdIds.map((resourceId) =>
                    readSidecar(projectRoot, resourceId),
                ),
            );
            expect(sidecars).toEqual([
                expect.objectContaining({ name: "Scene 1", type: "text" }),
                expect.objectContaining({ name: "Scene 2", type: "text" }),
                expect.objectContaining({ name: "Scene 3", type: "text" }),
            ]);
        } finally {
            await removeDirRetry(projectRoot);
        }
    });
});
