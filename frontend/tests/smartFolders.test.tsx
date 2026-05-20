import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SmartFolders from "../components/ResourceTree/SmartFolders";
import projectsReducer, {
    setProject,
    setSelectedProjectId,
    type StoredProject,
} from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import searchReducer from "../src/store/searchSlice";
import queryReducer from "../src/store/querySlice";
import type { SavedQuery } from "../src/store/querySlice";
import type { QueryAST } from "../src/lib/models/query-ast";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEF: QueryAST = { op: "exists", field: "status" };

const QUERY_A: SavedQuery = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "All drafts",
    definition: DEF,
};

const QUERY_B: SavedQuery = {
    id: "bbbbbbbb-0000-0000-0000-000000000002",
    name: "Recent scenes",
    definition: DEF,
};

// ─── Store factory ─────────────────────────────────────────────────────────────

function makeStore(savedQueries: Record<string, SavedQuery> = {}) {
    return configureStore({
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
                selectedProjectId: "proj-1",
                projects: {
                    "proj-1": {
                        id: "proj-1",
                        name: "Test",
                        rootPath: "/tmp/test",
                        folders: [],
                        resources: [],
                    } as StoredProject,
                },
            },
            queries: {
                projectId: "proj-1",
                requestedProjectId: null,
                savedQueries,
                isLoadingQueries: false,
                isEvaluating: false,
                evaluatingForProjectId: null,
                activeQueryDefinition: null,
                activeQueryIds: [],
                savingQueryId: null,
                deletingQueryId: null,
                errorMessage: "",
            },
        },
    });
}

function renderSmartFolders(
    savedQueries: Record<string, SavedQuery> = {},
    selectedQueryId?: string,
    onSelect = vi.fn(),
    extras: Partial<React.ComponentProps<typeof SmartFolders>> = {},
) {
    const store = makeStore(savedQueries);
    return render(
        <Provider store={store}>
            <SmartFolders
                selectedQueryId={selectedQueryId}
                onSelect={onSelect}
                {...extras}
            />
        </Provider>,
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SmartFolders", () => {
    it("renders section header when queries exist", () => {
        renderSmartFolders({ [QUERY_A.id]: QUERY_A });
        expect(screen.getByText(/smart folders/i)).toBeTruthy();
    });

    it("renders each saved query as a row", () => {
        renderSmartFolders({
            [QUERY_A.id]: QUERY_A,
            [QUERY_B.id]: QUERY_B,
        });
        expect(screen.getByText("All drafts")).toBeTruthy();
        expect(screen.getByText("Recent scenes")).toBeTruthy();
    });

    it("renders nothing when no saved queries", () => {
        renderSmartFolders({});
        expect(screen.queryByRole("button", { name: "All drafts" })).toBeNull();
    });

    it("calls onSelect with the query when a row is clicked", () => {
        const onSelect = vi.fn();
        renderSmartFolders({ [QUERY_A.id]: QUERY_A }, undefined, onSelect);
        fireEvent.click(screen.getByText("All drafts"));
        expect(onSelect).toHaveBeenCalledWith(QUERY_A);
    });

    it("applies selected styling when selectedQueryId matches", () => {
        renderSmartFolders(
            { [QUERY_A.id]: QUERY_A, [QUERY_B.id]: QUERY_B },
            QUERY_A.id,
        );
        const btn = screen.getByText("All drafts").closest("button");
        expect(btn?.className).toContain("selected");
    });

    it("does not apply selected styling when selectedQueryId does not match", () => {
        renderSmartFolders({ [QUERY_A.id]: QUERY_A }, QUERY_B.id);
        const btn = screen.getByText("All drafts").closest("button");
        expect(btn?.className).not.toContain("selected");
    });

    it("renders nothing when no queries and onNewQuery not provided", () => {
        renderSmartFolders({});
        expect(screen.queryByText(/smart folders/i)).toBeNull();
    });

    it("renders the section header when no queries but onNewQuery is provided", () => {
        renderSmartFolders({}, undefined, vi.fn(), { onNewQuery: vi.fn() });
        expect(screen.getByText(/smart folders/i)).toBeTruthy();
    });

    it("calls onNewQuery when + button is clicked", () => {
        const onNewQuery = vi.fn();
        renderSmartFolders({}, undefined, vi.fn(), { onNewQuery });
        fireEvent.click(screen.getByRole("button", { name: /new smart folder/i }));
        expect(onNewQuery).toHaveBeenCalledOnce();
    });

    it("renders edit button for each row when onEditQuery is provided", () => {
        const onEditQuery = vi.fn();
        renderSmartFolders(
            { [QUERY_A.id]: QUERY_A, [QUERY_B.id]: QUERY_B },
            undefined,
            vi.fn(),
            { onEditQuery },
        );
        expect(screen.getAllByRole("button", { name: /^Edit /i })).toHaveLength(2);
    });

    it("calls onEditQuery with the query when edit button is clicked", () => {
        const onEditQuery = vi.fn();
        renderSmartFolders({ [QUERY_A.id]: QUERY_A }, undefined, vi.fn(), { onEditQuery });
        fireEvent.click(screen.getByRole("button", { name: `Edit ${QUERY_A.name}` }));
        expect(onEditQuery).toHaveBeenCalledWith(QUERY_A);
    });

    it("renders delete button for each row when onDeleteQuery is provided", () => {
        const onDeleteQuery = vi.fn();
        renderSmartFolders(
            { [QUERY_A.id]: QUERY_A, [QUERY_B.id]: QUERY_B },
            undefined,
            vi.fn(),
            { onDeleteQuery },
        );
        expect(screen.getAllByRole("button", { name: /^Delete /i })).toHaveLength(2);
    });

    it("calls onDeleteQuery with the queryId when delete button is clicked", () => {
        const onDeleteQuery = vi.fn();
        renderSmartFolders({ [QUERY_A.id]: QUERY_A }, undefined, vi.fn(), { onDeleteQuery });
        fireEvent.click(screen.getByRole("button", { name: `Delete ${QUERY_A.name}` }));
        expect(onDeleteQuery).toHaveBeenCalledWith(QUERY_A.id);
    });

    it("shows loading state while queries are loading", () => {
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
                    selectedProjectId: "proj-1",
                    projects: {
                        "proj-1": {
                            id: "proj-1",
                            name: "Test",
                            rootPath: "/tmp/test",
                            folders: [],
                            resources: [],
                        } as StoredProject,
                    },
                },
                queries: {
                    projectId: "proj-1",
                    requestedProjectId: "proj-1",
                    savedQueries: {},
                    isLoadingQueries: true,
                    isEvaluating: false,
                    evaluatingForProjectId: null,
                    activeQueryDefinition: null,
                    activeQueryIds: [],
                    savingQueryId: null,
                    deletingQueryId: null,
                    errorMessage: "",
                },
            },
        });
        render(
            <Provider store={store}>
                <SmartFolders onSelect={vi.fn()} />
            </Provider>,
        );
        expect(screen.getByText(/loading/i)).toBeTruthy();
    });
});
