import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateProjectModal from "../../components/Start/CreateProjectModal";

describe("a11y: CreateProjectModal keyboard navigation (T018)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(globalThis as any, "fetch").mockImplementation(
            (...args: unknown[]) => {
                const [input] = args as [RequestInfo | URL, RequestInit?];
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.toString()
                          : input.url;
                if (url.endsWith("/api/project-types")) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => [
                            {
                                id: "novel",
                                name: "Novel",
                                folders: [{ name: "Workspace" }],
                            },
                        ],
                    });
                }
                return Promise.resolve({ ok: true, json: async () => ({}) });
            },
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("focuses controls in a logical order and supports Escape to close", async () => {
        const onClose = vi.fn();
        const onCreate = vi.fn();

        render(
            <CreateProjectModal
                isOpen={true}
                onClose={onClose}
                onCreate={onCreate}
                defaultName=""
                defaultType="novel"
            />,
        );

        // Wait for name input to be focused (modal focuses it on open)
        await waitFor(() => {
            const nameInput = screen.getByLabelText(/Name/i) as HTMLElement;
            expect(document.activeElement).toBe(nameInput);
        });

        const user = userEvent.setup();

        // Tab sequence: Name -> Filter -> Select -> Cancel -> Create
        await user.tab(); // to filter/search input
        const filter = screen.getByRole("searchbox", {
            name: /Filter project types/i,
        });
        expect(document.activeElement).toBe(filter);

        await user.tab(); // to select
        const select = screen.getByRole("combobox");
        expect(document.activeElement).toBe(select);

        await user.tab(); // to Cancel button
        const cancel = screen.getByRole("button", { name: /Cancel/i });
        expect(document.activeElement).toBe(cancel);

        await user.tab(); // to Create button
        const create = screen.getByRole("button", { name: /Create/i });
        expect(document.activeElement).toBe(create);

        // Press Escape should call onClose
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });
});
