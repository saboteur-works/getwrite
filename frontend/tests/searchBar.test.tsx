import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Provider } from "react-redux";
import SearchBar from "../components/SearchBar/SearchBar";
import { makeStore } from "../src/store/store";
import { setSelectedProjectId } from "../src/store/projectsSlice";
import type { SearchResult } from "../src/store/searchSlice";

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

        expect(fetchSpy).not.toHaveBeenCalled();
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
