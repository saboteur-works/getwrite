import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RevisionEntry } from "../src/store/revisionsSlice";
import {
    setResources,
    setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createTextResource } from "../src/lib/models/resource";

// Mock the TipTapEditor to avoid loading the real Editor in jsdom.
vi.mock("../components/TipTapEditor", () => {
    return {
        __esModule: true,
        default: ({
            value,
            onChange,
        }: {
            value?: string;
            onChange?: (
                v: string,
                doc: { type: "doc"; content: unknown[] },
            ) => void;
        }) => (
            <textarea
                data-testid="tiptap-mock"
                value={value}
                onChange={(e) =>
                    onChange &&
                    onChange(e.target.value, {
                        type: "doc",
                        content: [],
                    })
                }
            />
        ),
    };
});

import EditView from "../components/WorkArea/EditView";
import { makeStore } from "../src/store/store";
import { Provider } from "react-redux";

function seedRevisions(
    store: ReturnType<typeof makeStore>,
    resourceId: string,
    revisions: RevisionEntry[],
    currentRevisionId: string,
): void {
    store.dispatch({
        type: "revisions/loadRevisionsForSelectedResource/pending",
        meta: { arg: { resourceId } },
    });
    store.dispatch({
        type: "revisions/loadRevisionsForSelectedResource/fulfilled",
        payload: {
            resourceId,
            revisions,
            currentRevisionId,
        },
    });
}

function createRevisionEntry(
    resourceId: string,
    revisionId: string,
    isCanonical: boolean,
): RevisionEntry {
    return {
        id: revisionId,
        resourceId,
        versionNumber: isCanonical ? 2 : 1,
        createdAt: new Date().toISOString(),
        filePath: `/tmp/${revisionId}.json`,
        isCanonical,
        displayName: isCanonical ? "Canonical" : "Previous",
    };
}

describe("EditView", () => {
    it("shows autosave unavailable and unsaved warning when editing a non-canonical revision", async () => {
        const store = makeStore();
        const resource = createTextResource({
            name: "Draft",
            plainText: "hello world",
        });

        const canonicalRevision = createRevisionEntry(
            resource.id,
            "rev-canonical",
            true,
        );
        const previousRevision = createRevisionEntry(
            resource.id,
            "rev-previous",
            false,
        );

        const fetchStub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
        } as Response);

        store.dispatch(
            setProject({
                id: "project-1",
                name: "Project",
                rootPath: "/tmp/project",
                resources: [{ id: resource.id, name: resource.name }],
            }),
        );
        store.dispatch(setSelectedProjectId("project-1"));
        store.dispatch(setResources([resource]));
        store.dispatch(setSelectedResourceId(resource.id));
        seedRevisions(
            store,
            resource.id,
            [canonicalRevision, previousRevision],
            previousRevision.id,
        );

        render(
            <Provider store={store}>
                <EditView initialContent="Draft" />
            </Provider>,
        );

        expect(
            screen.getByText(
                /Autosave unavailable for non-canonical revisions/i,
            ),
        ).toBeInTheDocument();

        const editor = screen.getByTestId("tiptap-mock");
        fireEvent.change(editor, { target: { value: "Edited" } });

        expect(await screen.findByText(/Unsaved edits/i)).toBeInTheDocument();

        fetchStub.mockRestore();
    });

    it("shows initial content word count and updates on change", async () => {
        const store = makeStore();
        render(
            <Provider store={store}>
                <EditView initialContent="Hello world from test" />
            </Provider>,
        );

        // words: 4
        expect(screen.getByText(/Words:/)).toHaveTextContent("Words: 4");

        const ta = screen.getByTestId("tiptap-mock") as HTMLTextAreaElement;
        fireEvent.change(ta, { target: { value: "one two three" } });

        expect(screen.getByText(/Words:/)).toHaveTextContent("Words: 3");
    });

    it("queues autosave while editing the canonical revision", async () => {
        const store = makeStore();
        const resource = createTextResource({
            name: "Draft",
            plainText: "hello world",
        });

        const canonicalRevision = createRevisionEntry(
            resource.id,
            "rev-canonical",
            true,
        );

        const fetchStub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
        } as Response);

        store.dispatch(
            setProject({
                id: "project-2",
                name: "Project",
                rootPath: "/tmp/project",
                resources: [{ id: resource.id, name: resource.name }],
            }),
        );
        store.dispatch(setSelectedProjectId("project-2"));
        store.dispatch(setResources([resource]));
        store.dispatch(setSelectedResourceId(resource.id));
        seedRevisions(
            store,
            resource.id,
            [canonicalRevision],
            canonicalRevision.id,
        );

        render(
            <Provider store={store}>
                <EditView initialContent="Draft" />
            </Provider>,
        );

        const editor = screen.getByTestId("tiptap-mock");
        fireEvent.change(editor, { target: { value: "Edited" } });

        expect(screen.getByText(/Autosave queued/i)).toBeInTheDocument();

        fetchStub.mockRestore();
    });
});
