import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import SaveQueryDialog from "../components/QueryBuilder/SaveQueryDialog";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type { QueryAST } from "../src/lib/models/query-ast";
import type { SavedQuery } from "../src/store/querySlice";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFINITION: QueryAST = { op: "exists", field: "type" };

const EXISTING_QUERY: SavedQuery = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Existing Query",
    definition: DEFINITION,
    view: { kind: "list" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTestStore() {
    const s = makeStore();
    s.dispatch(
        setProject({ id: "proj-1", name: "Test", rootPath: "/tmp/proj" }),
    );
    s.dispatch(setSelectedProjectId("proj-1"));
    return s;
}

interface RenderOptions {
    isOpen?: boolean;
    existingQuery?: SavedQuery;
    onClose?: () => void;
    onSaved?: (id: string) => void;
}

function renderDialog(opts: RenderOptions = {}) {
    const {
        isOpen = true,
        existingQuery,
        onClose = vi.fn(),
        onSaved = vi.fn(),
    } = opts;
    const store = makeTestStore();
    const result = render(
        <Provider store={store}>
            <SaveQueryDialog
                isOpen={isOpen}
                definition={DEFINITION}
                projectId="proj-1"
                onClose={onClose}
                onSaved={onSaved}
                existingQuery={existingQuery}
            />
        </Provider>,
    );
    return { store, onClose, onSaved, ...result };
}

function mockFetchSuccess(query: SavedQuery) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ query }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

function mockFetchError(message: string) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SaveQueryDialog — new query", () => {
    it("renders with empty name input", () => {
        renderDialog();
        const input = screen.getByLabelText("Name") as HTMLInputElement;
        expect(input.value).toBe("");
    });

    it("shows 'Save query' title", () => {
        renderDialog();
        expect(screen.getByText("Save query")).toBeTruthy();
    });

    it("save button is disabled when name is empty", () => {
        renderDialog();
        const saveBtn = screen.getByRole("button", { name: "Save" });
        expect(saveBtn).toHaveProperty("disabled", true);
    });

    it("save button becomes enabled after typing a name", () => {
        renderDialog();
        const input = screen.getByLabelText("Name");
        fireEvent.change(input, { target: { value: "My Query" } });
        const saveBtn = screen.getByRole("button", { name: "Save" });
        expect(saveBtn).toHaveProperty("disabled", false);
    });

    it("cancel button calls onClose", () => {
        const { onClose } = renderDialog();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("submitting dispatches saveQuery and calls onSaved + onClose on success", async () => {
        const { onClose, onSaved } = renderDialog();

        const input = screen.getByLabelText("Name");
        fireEvent.change(input, { target: { value: "Draft chapters" } });

        let savedQueryArg: SavedQuery | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) => {
            const body = JSON.parse((init as RequestInit).body as string) as { query: SavedQuery };
            savedQueryArg = body.query;
            return new Response(JSON.stringify({ query: body.query }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });

        await act(async () => {
            fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
        });

        await waitFor(() => {
            expect(onSaved).toHaveBeenCalledOnce();
            expect(onClose).toHaveBeenCalledOnce();
        });

        expect(savedQueryArg?.name).toBe("Draft chapters");
        expect(savedQueryArg?.definition).toEqual(DEFINITION);
    });

    it("shows inline error when save fails", async () => {
        renderDialog();

        const input = screen.getByLabelText("Name");
        fireEvent.change(input, { target: { value: "Bad Query" } });

        mockFetchError("Disk full");

        await act(async () => {
            fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
        });

        await waitFor(() => {
            expect(screen.getByRole("alert")).toBeTruthy();
        });
    });
});

describe("SaveQueryDialog — rename / overwrite", () => {
    it("pre-fills name from existingQuery", () => {
        renderDialog({ existingQuery: EXISTING_QUERY });
        const input = screen.getByLabelText("Name") as HTMLInputElement;
        expect(input.value).toBe("Existing Query");
    });

    it("pre-fills view kind from existingQuery", () => {
        renderDialog({ existingQuery: EXISTING_QUERY });
        const select = screen.getByLabelText(/default view/i) as HTMLSelectElement;
        expect(select.value).toBe("list");
    });

    it("shows 'Rename query' title", () => {
        renderDialog({ existingQuery: EXISTING_QUERY });
        expect(screen.getByText("Rename query")).toBeTruthy();
    });

    it("submitting uses the existing query id", async () => {
        const { onSaved } = renderDialog({ existingQuery: EXISTING_QUERY });

        const input = screen.getByLabelText("Name");
        fireEvent.change(input, { target: { value: "Renamed" } });

        let capturedId: string | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) => {
            const body = JSON.parse((init as RequestInit).body as string) as { query: SavedQuery };
            capturedId = body.query.id;
            return new Response(JSON.stringify({ query: body.query }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });

        await act(async () => {
            fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
        });

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(capturedId).toBe(EXISTING_QUERY.id);
    });
});

describe("SaveQueryDialog — not open", () => {
    it("does not render form content when isOpen is false", () => {
        renderDialog({ isOpen: false });
        expect(screen.queryByLabelText("Name")).toBeNull();
    });
});
