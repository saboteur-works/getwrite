import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Provider } from "react-redux";
import EditView from "../../components/WorkArea/EditView";
import { makeStore } from "../../src/store/store";
import {
    setResources,
    setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
    setProject,
    setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { RevisionEntry } from "../../src/store/revisionsSlice";

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

vi.mock("../../components/TipTapEditor", () => {
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
                value={
                    typeof value === "string"
                        ? value
                        : JSON.stringify(value ?? "")
                }
                onChange={(e) =>
                    onChange?.(e.target.value, {
                        type: "doc",
                        content: [],
                    })
                }
            />
        ),
    };
});

function createRevisionEntry(resourceId: string): RevisionEntry {
    return {
        id: "rev-canonical",
        resourceId,
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        filePath: "/tmp/rev-canonical.json",
        isCanonical: true,
        displayName: "Canonical",
    };
}

describe("EditView autosave integration", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("shows failure state and retries canonical autosave", async () => {
        const store = makeStore();
        const resource = createTextResource({
            name: "Draft",
            plainText: "Initial text",
        });

        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(
                async (input: RequestInfo | URL, init?: RequestInit) => {
                    const url =
                        typeof input === "string" ? input : input.toString();
                    if (
                        url.includes(`/api/resource/revision/${resource.id}`) &&
                        init?.method === "PATCH"
                    ) {
                        return {
                            ok: false,
                            status: 500,
                            json: async () => ({}),
                        } as Response;
                    }

                    return {
                        ok: false,
                        status: 404,
                        json: async () => ({}),
                    } as Response;
                },
            );

        store.dispatch(
            setProject({
                id: "project-autosave",
                name: "Autosave Project",
                rootPath: "/tmp/project",
                resources: [{ id: resource.id, name: resource.name }],
            }),
        );
        store.dispatch(setSelectedProjectId("project-autosave"));
        store.dispatch(setResources([resource]));
        store.dispatch(setSelectedResourceId(resource.id));
        seedRevisions(
            store,
            resource.id,
            [createRevisionEntry(resource.id)],
            "rev-canonical",
        );

        render(
            <Provider store={store}>
                <EditView initialContent="Initial text" />
            </Provider>,
        );

        await act(async () => {
            fireEvent.change(screen.getByTestId("tiptap-mock"), {
                target: { value: "Updated text" },
            });
        });

        expect(screen.getByText(/Autosave queued/i)).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(2600);
            await Promise.resolve();
        });

        expect(screen.getByText(/Autosave failed/i)).toBeInTheDocument();

        const retryButton = screen.getByRole("button", { name: /Retry now/i });
        await act(async () => {
            fireEvent.click(retryButton);
            await Promise.resolve();
        });

        expect(fetchMock).toHaveBeenCalled();
        const patchCalls = fetchMock.mock.calls.filter((call) => {
            const url =
                typeof call[0] === "string" ? call[0] : call[0].toString();
            return url.includes(`/api/resource/revision/${resource.id}`);
        });
        expect(patchCalls.length).toBeGreaterThanOrEqual(2);
    });
});
