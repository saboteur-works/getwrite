import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Provider } from "react-redux";
import SearchBar from "../components/SearchBar/SearchBar";
import SearchFilterPanel from "../components/SearchBar/SearchFilterPanel";
import { makeStore } from "../src/store/store";
import { setSelectedProjectId } from "../src/store/projectsSlice";
import { setFolders } from "../src/store/resourcesSlice";
import type { SearchResult } from "../src/store/searchSlice";
import type { Folder } from "../src/lib/models/types";

const mockResults: SearchResult[] = [
    {
        resourceId: "r1",
        title: "Alpha",
        snippet: "...contains alpha content...",
    },
    {
        resourceId: "r2",
        title: "Gamma",
        snippet: "...gamma related text...",
    },
];

/**
 * Flush all pending microtasks through the full async-thunk + fetch-mock chain.
 * With vi.useFakeTimers(), waitFor's internal polling timer is also faked and
 * never fires, causing it to hang. Flushing microtasks manually inside act
 * avoids that pitfall.
 */
async function flushThunkAndRender(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("SearchBar", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("shows API results and calls onSelect when clicked", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => mockResults,
        } as Response);

        const onSelect = vi.fn();
        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));

        render(
            <Provider store={testStore}>
                <SearchBar onSelect={onSelect} />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "al" } });

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        expect(
            screen.getByRole("button", { name: /Alpha/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Gamma/i }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Alpha/i }));
        expect(onSelect).toHaveBeenCalledWith("r1");
    });

    it("does not fire an API call for fewer than 2 characters", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => [],
        } as Response);

        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));

        render(
            <Provider store={testStore}>
                <SearchBar />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "a" } });

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        // The reindex effect fires once on mount (project selected), but no
        // search call should be made for a sub-2-character query.
        const searchCalls = fetchSpy.mock.calls.filter(([url]) =>
            String(url).includes("/search"),
        );
        expect(searchCalls).toHaveLength(0);
    });

    it("disables the input when no project is selected", () => {
        const testStore = makeStore();

        render(
            <Provider store={testStore}>
                <SearchBar />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        expect(input).toBeDisabled();
    });

    it("navigates results with keyboard and selects on Enter", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => mockResults,
        } as Response);

        const onSelect = vi.fn();
        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));

        render(
            <Provider store={testStore}>
                <SearchBar onSelect={onSelect} />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "al" } });

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        expect(
            screen.getByRole("button", { name: /Alpha/i }),
        ).toBeInTheDocument();

        // ArrowDown moves highlight from 0 → 1 (Gamma), Enter selects it
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onSelect).toHaveBeenCalledWith("r2");
    });

    it("includes status filter in search URL when a chip is selected via SearchBar", async () => {
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input: RequestInfo | URL) => {
                const url =
                    typeof input === "string" ? input : input.toString();
                if (url.includes("/search")) capturedUrl = url;
                return {
                    ok: true,
                    json: async () =>
                        url.includes("/search") ? mockResults : { tags: [] },
                } as Response;
            },
        );

        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));
        // Inject statuses so the SearchBar reads them from Redux
        testStore.dispatch({
            type: "projects/setProject",
            payload: {
                id: "project-1",
                rootPath: "/tmp/p1",
                statuses: ["Draft", "Final"],
            },
        });

        render(
            <Provider store={testStore}>
                <SearchBar />
            </Provider>,
        );

        const input = screen.getByLabelText("resource-search") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "al" } });

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        fireEvent.click(
            screen.getByRole("button", { name: /Toggle search filters/i }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Draft" }));

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        expect(capturedUrl).toContain("status=Draft");
    });

    it("closes the results list on Escape", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => mockResults,
        } as Response);

        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));

        render(
            <Provider store={testStore}>
                <SearchBar />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "al" } });

        await act(async () => {
            vi.advanceTimersByTime(200);
            await flushThunkAndRender();
        });

        expect(
            screen.getByRole("button", { name: /Alpha/i }),
        ).toBeInTheDocument();

        fireEvent.keyDown(input, { key: "Escape" });

        expect(
            screen.queryByRole("button", { name: /Alpha/i }),
        ).not.toBeInTheDocument();
    });
});

describe("SearchFilterPanel", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const now = new Date().toISOString();

    const mockFolders: Folder[] = [
        {
            id: "folder-1",
            name: "Chapter One",
            slug: "chapter-one",
            type: "folder",
            orderIndex: 0,
            createdAt: now,
            userMetadata: {},
        },
    ];

    it("opens and closes the filter panel via toggle button", () => {
        const testStore = makeStore();
        testStore.dispatch(setSelectedProjectId("project-1"));

        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({ tags: [] }),
        } as Response);

        render(
            <Provider store={testStore}>
                <SearchBar />
            </Provider>,
        );

        expect(
            screen.queryByRole("region", { name: /Search filters/i }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Toggle search filters/i }),
        );

        expect(
            screen.getByRole("region", { name: /Search filters/i }),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: /Toggle search filters/i }),
        );

        expect(
            screen.queryByRole("region", { name: /Search filters/i }),
        ).not.toBeInTheDocument();
    });

    it("renders status chips and toggles active state", () => {
        const onFilterChange = vi.fn();

        render(
            <SearchFilterPanel
                folders={[]}
                statuses={["Draft", "Final"]}
                tags={[]}
                activeFilters={{}}
                onFilterChange={onFilterChange}
            />,
        );

        const draftChip = screen.getByRole("button", { name: "Draft" });
        expect(draftChip).toHaveAttribute("aria-pressed", "false");

        fireEvent.click(draftChip);
        expect(onFilterChange).toHaveBeenCalledWith({ status: "Draft" });
    });

    it("combines multiple filters in a single onFilterChange call", () => {
        const onFilterChange = vi.fn();

        render(
            <SearchFilterPanel
                folders={mockFolders}
                statuses={["Draft"]}
                tags={[
                    { id: "tag-1", name: "Romance" },
                    { id: "tag-2", name: "Fantasy" },
                ]}
                activeFilters={{ status: "Draft" }}
                onFilterChange={onFilterChange}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Romance" }));
        expect(onFilterChange).toHaveBeenCalledWith({
            status: "Draft",
            tags: ["tag-1"],
        });
    });

    it("clears a filter by clicking its chip again", () => {
        const onFilterChange = vi.fn();

        render(
            <SearchFilterPanel
                folders={[]}
                statuses={["Draft", "Final"]}
                tags={[]}
                activeFilters={{ status: "Draft" }}
                onFilterChange={onFilterChange}
            />,
        );

        const draftChip = screen.getByRole("button", { name: "Draft" });
        expect(draftChip).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(draftChip);
        expect(onFilterChange).toHaveBeenCalledWith({ status: undefined });
    });

    it("renders a folder selector when folders are provided", () => {
        const onFilterChange = vi.fn();

        render(
            <SearchFilterPanel
                folders={mockFolders}
                statuses={[]}
                tags={[]}
                activeFilters={{}}
                onFilterChange={onFilterChange}
            />,
        );

        const select = screen.getByRole("combobox", {
            name: /Filter by folder/i,
        }) as HTMLSelectElement;
        expect(select).toBeInTheDocument();

        fireEvent.change(select, { target: { value: "folder-1" } });
        expect(onFilterChange).toHaveBeenCalledWith({ folder: "folder-1" });
    });

    it("clears folder filter when 'All folders' is selected", () => {
        const onFilterChange = vi.fn();

        render(
            <SearchFilterPanel
                folders={mockFolders}
                statuses={[]}
                tags={[]}
                activeFilters={{ folder: "folder-1" }}
                onFilterChange={onFilterChange}
            />,
        );

        const select = screen.getByRole("combobox", {
            name: /Filter by folder/i,
        }) as HTMLSelectElement;
        fireEvent.change(select, { target: { value: "" } });
        expect(onFilterChange).toHaveBeenCalledWith({ folder: undefined });
    });
});
