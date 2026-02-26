import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StartPage from "../components/Start/StartPage";
import CreateProjectModal from "../components/Start/CreateProjectModal";

describe("Create project flow (integration) - modal calls API and adds project", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads project types, posts creation, and shows new project in the list", async () => {
        console.log("[test-debug] start create-project-modal test");
        // Mock global fetch and route responses by URL/method to avoid
        // ordering races with StartPage initial requests.
        const fetchSpy = vi
            .spyOn(globalThis as any, "fetch")
            .mockImplementation((input: RequestInfo, init?: RequestInit) => {
                const url = typeof input === "string" ? input : input.url;
                // initial projects list on mount
                if (
                    url.endsWith("/api/projects") &&
                    (!init || !init.method || init.method === "GET")
                ) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => [],
                    });
                }
                if (url.endsWith("/api/project-types")) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => [{ id: "novel", name: "Novel" }],
                    });
                }
                if (
                    url.endsWith("/api/projects") &&
                    init &&
                    init.method === "POST"
                ) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            project: {
                                id: "proj_new",
                                name: "My Novel",
                                resources: [],
                            },
                            folders: [],
                            resources: [],
                        }),
                    });
                }
                return Promise.resolve({ ok: true, json: async () => ({}) });
            });

        console.log("[test-debug] rendering CreateProjectModal directly");
        // Render modal directly to avoid StartPage mounting side-effects
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
        console.log("[test-debug] modal rendered");

        // Wait for types to load (modal select present)
        console.log("[test-debug] waiting for combobox");
        await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy(), {
            timeout: 2000,
        });
        console.log("[test-debug] combobox present");

        // Fill name and select type
        const nameInput = screen.getByLabelText(/Name/i);
        fireEvent.change(nameInput, { target: { value: "My Novel" } });
        const select = screen.getByRole("combobox");
        fireEvent.change(select, { target: { value: "novel" } });

        // Submit
        const createBtn = screen.getByRole("button", { name: /Create/i });
        console.log("[test-debug] clicking Create");
        fireEvent.click(createBtn);

        // Ensure fetch was called for GET and POST
        console.log("[test-debug] waiting for fetch calls");
        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2), {
            timeout: 2000,
        });
        console.log(
            "[test-debug] fetch calls observed",
            fetchSpy.mock.calls.length,
        );

        // Assert POST called with expected payload
        const postCall = fetchSpy.mock.calls[1];
        expect(postCall[0]).toBe("/api/projects");
        expect(postCall[1]).toMatchObject({
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        expect(postCall[1].body).toBe(
            JSON.stringify({ name: "My Novel", projectType: "novel" }),
        );

        // Assert the modal invoked onCreate with the created project
        console.log(
            "[test-debug] asserting onCreate was called with created project",
        );
        await waitFor(() => expect(onCreate).toHaveBeenCalled(), {
            timeout: 2000,
        });
        const call = onCreate.mock.calls[0];
        expect(call[0]).toMatchObject({
            name: "My Novel",
            projectType: "novel",
        });
        expect(call[1]).toBeDefined();
        expect(call[1].project).toMatchObject({
            id: "proj_new",
            name: "My Novel",
        });
        console.log("[test-debug] onCreate received created project");
    });
});
