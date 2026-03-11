import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import SearchBar from "../components/SearchBar/SearchBar";
import type { AnyResource } from "../src/lib/models/types";
import { makeStore } from "../src/store/store";
import { setResources } from "../src/store/resourcesSlice";

describe("SearchBar", () => {
    it("shows matches and calls onSelect when clicked", () => {
        const now = new Date().toISOString();
        const resources: AnyResource[] = [
            {
                id: "r1",
                name: "Alpha",
                type: "text",
                plainText: "",
                createdAt: now,
                updatedAt: now,
                metadata: {},
            },
            {
                id: "r2",
                name: "Beta",
                type: "text",
                plainText: "",
                createdAt: now,
                updatedAt: now,
                metadata: {},
            },
            {
                id: "r3",
                name: "Gamma",
                type: "text",
                plainText: "",
                createdAt: now,
                updatedAt: now,
                metadata: {},
            },
        ];

        const onSelect = vi.fn();
        const testStore = makeStore();
        testStore.dispatch(setResources(resources));
        render(
            <Provider store={testStore}>
                <SearchBar onSelect={onSelect} />
            </Provider>,
        );

        const input = screen.getByLabelText(
            "resource-search",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "a" } });

        // Alpha and Gamma contain 'a' (case-insensitive). Because matches are
        // highlighted and split across spans, query by accessible name instead.
        expect(
            screen.getByRole("button", { name: /Alpha/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Gamma/i }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Alpha/i }));
        expect(onSelect).toHaveBeenCalledWith("r1");
    });
});
