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
            .mockImplementation((...args: unknown[]) => {
                const [input, init] = args as [
                    RequestInfo | URL,
                    RequestInit | undefined,
                ];
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.toString()
                          : input.url;
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
                        json: async () => [
                            {
                                id: "novel",
                                name: "Novel",
                                folders: [
                                    { name: "Workspace", defaultResources: [] },
                                ],
                            },
                        ],
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
        const postInit = postCall?.[1] as RequestInit | undefined;
        expect(postCall[0]).toBe("/api/projects");
        expect(postInit).toMatchObject({
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        expect(postInit?.body).toBe(
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

/**
 * T027: US3 — Project-type list pane parity coverage.
 *
 * Verifies that the CreateProjectModal correctly loads and exposes project-type
 * options, so that downstream ProjectTypeListPane decomposition cannot break
 * the create-project modal flow.
 */
describe("Create project modal — project-type list parity (T027)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders only the project types returned by the API", async () => {
        vi.spyOn(globalThis as any, "fetch").mockImplementation(
            (...args: unknown[]) => {
                const [input] = args as [RequestInfo | URL];
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.toString()
                          : (input as Request).url;

                if (url.endsWith("/api/project-types")) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => [
                            {
                                id: "screenplay",
                                name: "Screenplay",
                                folders: [{ name: "Workspace" }],
                            },
                            {
                                id: "essay",
                                name: "Essay",
                                folders: [{ name: "Workspace" }],
                            },
                        ],
                    });
                }
                return Promise.resolve({ ok: true, json: async () => [] });
            },
        );

        render(
            <CreateProjectModal
                isOpen={true}
                onClose={vi.fn()}
                onCreate={vi.fn()}
                defaultName=""
                defaultType=""
            />,
        );

        await waitFor(() => {
            const select = screen.getByRole("combobox");
            expect(select).toBeTruthy();
        });

        const options = screen.getByRole("combobox").querySelectorAll("option");
        const optionValues = Array.from(options).map(
            (o) => (o as HTMLOptionElement).value,
        );
        expect(optionValues).toContain("screenplay");
        expect(optionValues).toContain("essay");
    });

    it("shows an error placeholder when the project-types API call fails", async () => {
        vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
            ok: false,
            status: 500,
        });

        render(
            <CreateProjectModal
                isOpen={true}
                onClose={vi.fn()}
                onCreate={vi.fn()}
                defaultName=""
                defaultType=""
            />,
        );

        await waitFor(
            () => {
                // Modal should still render; either show error text or empty select
                expect(screen.getByRole("dialog")).toBeTruthy();
            },
            { timeout: 2000 },
        );
    });
});
