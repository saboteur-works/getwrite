import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the TipTapEditor to avoid loading the real Editor in jsdom.
vi.mock("../components/TipTapEditor", () => {
    return {
        __esModule: true,
        default: ({
            value,
            onChange,
        }: {
            value?: string;
            onChange?: (v: string) => void;
        }) => (
            <textarea
                data-testid="tiptap-mock"
                value={value}
                onChange={(e) => onChange && onChange(e.target.value)}
            />
        ),
    };
});

import EditView from "../components/WorkArea/EditView";
import { makeStore } from "../src/store/store";
import { Provider } from "react-redux";

describe("EditView", () => {
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
});
