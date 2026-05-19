import type { MetadataSchema } from "./types";

/**
 * Authoritative built-in schema for all projects. Injected into Redux when a
 * project has no persisted `config.metadataSchema`. Import from here rather
 * than re-declaring field definitions in the sidebar or schema manager.
 */
export const DEFAULT_METADATA_SCHEMA: MetadataSchema = {
    groups: [
        {
            id: "builtin-document",
            label: "Document",
            fields: [
                { key: "synopsis", label: "Synopsis", type: "text", locked: true },
                { key: "notes", label: "Notes", type: "text", locked: true },
                { key: "status", label: "Status", type: "select", locked: true },
                {
                    key: "pov",
                    label: "Point of View",
                    type: "resource-ref",
                    locked: true,
                    multiple: false,
                },
            ],
        },
        {
            id: "builtin-story-timeline",
            label: "Story Timeline",
            fields: [
                { key: "storyDate", label: "Story Date", type: "date", locked: true },
                {
                    key: "storyDuration",
                    label: "Duration (minutes)",
                    type: "number",
                    locked: true,
                },
                { key: "storyEndDate", label: "Story End Date", type: "date", locked: true },
            ],
        },
    ],
};
