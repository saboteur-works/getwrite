import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import SaveQueryDialog from "../../components/QueryBuilder/SaveQueryDialog";
import projectsReducer, {
    setProject,
    setSelectedProjectId,
    type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import type { QueryAST } from "../../src/lib/models/query-ast";
import type { SavedQuery } from "../../src/store/querySlice";

// ─── Fixture data ─────────────────────────────────────────────────────────────

const DEFINITION: QueryAST = {
    op: "and",
    children: [
        { op: "exists", field: "status" },
        { op: "eq", field: "status", value: "draft" },
    ],
};

const EXISTING_QUERY: SavedQuery = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Draft chapters",
    definition: DEFINITION,
    view: { kind: "list" },
};

// ─── Store factory ────────────────────────────────────────────────────────────

function makeStoryStore() {
    const store = configureStore({
        reducer: {
            projects: projectsReducer,
            resources: resourcesReducer,
            revisions: revisionsReducer,
            editorConfig: editorConfigReducer,
            search: searchReducer,
            queries: queryReducer,
        },
        preloadedState: {
            projects: {
                selectedProjectId: "story-proj",
                projects: {
                    "story-proj": {
                        id: "story-proj",
                        name: "Story Project",
                        rootPath: "/story",
                        folders: [],
                        resources: [],
                    } as StoredProject,
                },
            },
        },
    });
    return store;
}

function withQueryStore(Story: React.ComponentType) {
    return (
        <Provider store={makeStoryStore()}>
            <Story />
        </Provider>
    );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof SaveQueryDialog> = {
    title: "QueryBuilder/SaveQueryDialog",
    component: SaveQueryDialog,
    decorators: [withQueryStore],
    parameters: {
        layout: "centered",
    },
};

export default meta;

type Story = StoryObj<typeof SaveQueryDialog>;

// ─── Static stories ───────────────────────────────────────────────────────────

/** New query — empty name field, ready for input. */
export const NewQuery: Story = {
    args: {
        isOpen: true,
        definition: DEFINITION,
        projectId: "story-proj",
        onClose: fn(),
        onSaved: fn(),
    },
};

/** Rename / overwrite — name and view kind pre-filled from existingQuery. */
export const RenameQuery: Story = {
    args: {
        isOpen: true,
        definition: DEFINITION,
        projectId: "story-proj",
        existingQuery: EXISTING_QUERY,
        onClose: fn(),
        onSaved: fn(),
    },
};

/** Not open — dialog is dismissed. */
export const Closed: Story = {
    args: {
        isOpen: false,
        definition: DEFINITION,
        projectId: "story-proj",
        onClose: fn(),
        onSaved: fn(),
    },
};

// ─── Interactive stories ──────────────────────────────────────────────────────

/** User types a name and saves — verifies onSaved is called. */
export const SaveSuccess: Story = {
    args: {
        isOpen: true,
        definition: DEFINITION,
        projectId: "story-proj",
        onClose: fn(),
        onSaved: fn(),
    },
    beforeEach() {
        globalThis.fetch = async () =>
            new Response(
                JSON.stringify({
                    query: {
                        id: "cccccccc-0000-0000-0000-000000000003",
                        name: "All drafts",
                        definition: DEFINITION,
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
    },
    play: async ({ canvas, args }) => {
        const nameInput = canvas.getByLabelText("Name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "All drafts");

        const saveBtn = canvas.getByRole("button", { name: "Save" });
        await expect(saveBtn).not.toBeDisabled();
        await userEvent.click(saveBtn);

        await expect(args.onSaved).toHaveBeenCalled();
        await expect(args.onClose).toHaveBeenCalled();
    },
};

/** Save button disabled until a name is entered. */
export const SaveDisabledWhenEmpty: Story = {
    args: {
        isOpen: true,
        definition: DEFINITION,
        projectId: "story-proj",
        onClose: fn(),
        onSaved: fn(),
    },
    play: async ({ canvas }) => {
        const saveBtn = canvas.getByRole("button", { name: "Save" });
        await expect(saveBtn).toBeDisabled();

        const nameInput = canvas.getByLabelText("Name");
        await userEvent.type(nameInput, "My query");
        await expect(saveBtn).not.toBeDisabled();

        await userEvent.clear(nameInput);
        await expect(saveBtn).toBeDisabled();
    },
};

/** Cancel button calls onClose without saving. */
export const CancelDismisses: Story = {
    args: {
        isOpen: true,
        definition: DEFINITION,
        projectId: "story-proj",
        onClose: fn(),
        onSaved: fn(),
    },
    play: async ({ canvas, args }) => {
        const cancelBtn = canvas.getByRole("button", { name: "Cancel" });
        await userEvent.click(cancelBtn);
        await expect(args.onClose).toHaveBeenCalledOnce();
        await expect(args.onSaved).not.toHaveBeenCalled();
    },
};
