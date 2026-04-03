import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StartPage from "../components/Start/StartPage";
import ResourceTree from "../components/ResourceTree/ResourceTree";
import { makeStore } from "../src/store/store";
import { Provider } from "react-redux";
import { setProject } from "../src/store/projectsSlice";
import EditView from "../components/WorkArea/EditView";
import ExportPreviewModal from "../components/common/ExportPreviewModal";
import CompilePreviewModal from "../components/common/CompilePreviewModal";
import type { TextResource } from "../src/lib/models/types";
// Use a small, canonical test-local fixture instead of legacy `sampleProjects` placeholder.

// Integration-style flow test: Start -> Open Project -> Open Resource -> Edit
describe("Core flow: Start → Open Project → Open Resource → Edit", () => {
    it("navigates from Start to Edit view and shows word count for selected resource", async () => {
        const now = new Date().toISOString();
        const projectId = "proj_test_1";
        const projects = [
            {
                project: {
                    id: projectId,
                    name: "Sample Project 1",
                    createdAt: now,
                    updatedAt: now,
                    rootPath: "face/root/path",
                },
                resources: [
                    {
                        id: "res_ogbqoiv",
                        name: "Scene A",
                        type: "text",
                        createdAt: now,
                        updatedAt: now,
                        plainText: "Placeholder content for Scene A",
                        folderId: null,
                    },
                    {
                        id: "res_klxinf5",
                        name: "Notes",
                        type: "text",
                        createdAt: now,
                        updatedAt: now,
                        plainText: "Notes for Sample Project 1",
                        folderId: null,
                    },
                ] as TextResource[],
                folders: [],
            },
        ];

        const wrapper = projects[0];
        const project = wrapper.project;
        const resources = wrapper.resources;

        // create a test-local Redux store and TestApp harness that renders StartPage then ResourceTree
        const testStore = makeStore();

        function TestApp() {
            const [currentProject, setCurrentProject] = React.useState<
                typeof wrapper | null
            >(null);
            const [currentResourceId, setCurrentResourceId] = React.useState<
                string | null
            >(null);

            const handleOpen = (id?: string | null) => {
                // StartPage passes `project.rootPath` for Open; fall back to first project when undefined.
                const p =
                    projects.find(
                        (x) => x.project.id === id || x.project.rootPath === id,
                    ) ?? (id == null ? projects[0] : null);
                setCurrentProject(p);
                setCurrentResourceId(null);

                // Register the project in the store immediately so ResourceTree can select it synchronously.
                if (p) {
                    testStore.dispatch(
                        setProject({
                            id: p.project.id,
                            name: p.project.name,
                            resources: p.resources,
                            folders: (p as any).folders ?? [],
                        } as any),
                    );
                }
            };

            const handleSelect = (id: string) => {
                setCurrentResourceId(id);
            };

            const currentResource =
                currentProject?.resources.find(
                    (r) => r.id === currentResourceId,
                ) ?? null;

            React.useEffect(() => {
                if (currentProject) {
                    testStore.dispatch(
                        setProject({
                            id: currentProject.project.id,
                            name: currentProject.project.name,
                            resources: currentProject.resources,
                        } as any),
                    );
                }
            }, [currentProject]);

            return (
                <div>
                    {!currentProject ? (
                        <StartPage projects={projects} onOpen={handleOpen} />
                    ) : (
                        <div>
                            <h2>Project: {currentProject.project.name}</h2>
                            {/* register project in store and render ResourceTree via projectId */}
                            {/* project registered in store via effect above */}
                            <ResourceTree onResourceAction={handleSelect} />

                            <div data-testid="editor-area">
                                {currentResource ? (
                                    <EditView
                                        initialContent={
                                            (currentResource.plainText ??
                                                "") as string
                                        }
                                    />
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        render(
            <Provider store={testStore}>
                <TestApp />
            </Provider>,
        );

        // Start page should show the project title
        expect(screen.getByText(project.name)).toBeTruthy();

        // Click the first 'Open' button
        const openButtons = screen.getAllByRole("button", { name: /Open/i });
        expect(openButtons.length).toBeGreaterThan(0);
        fireEvent.click(openButtons[0]);

        // Resource tree should appear
        await waitFor(() => {
            expect(screen.getByLabelText("Resource tree")).toBeTruthy();
        });

        // Click the first resource title (fall back to first treeitem button when name is missing)
        const firstResource = resources[0];
        if (firstResource.name) {
            const resTitle = screen.getByText(firstResource.name);
            fireEvent.click(resTitle);
        } else {
            const treeitems = screen.getAllByRole("treeitem");
            expect(treeitems.length).toBeGreaterThan(0);
            const btn = treeitems[0].querySelector("button");
            if (btn) fireEvent.click(btn);
            else fireEvent.click(treeitems[0]);
        }

        // The editor area should show word count matching the resource content
        // Compute expected word count using same logic as EditView
        const text = (firstResource.plainText ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const expectedCount = text ? text.split(" ").length : 0;

        await waitFor(() => {
            expect(screen.getByTestId("editor-area")).toBeTruthy();
            // word count is rendered inside a <strong> element
            expect(
                screen.getByText(String(expectedCount), { selector: "strong" }),
            ).toBeTruthy();
        });
    });
});

/**
 * T028: US3 — AppShell modal-trigger parity coverage.
 *
 * Verifies that the ExportPreviewModal and CompilePreviewModal modal lifecycles
 * behave correctly after ShellModalCoordinator extraction.  These are
 * component-level tests that do not require the full AppShell harness.
 */
describe("AppShell modal-trigger parity (T028)", () => {
    it("ExportPreviewModal opens and closes when triggered then cancelled", () => {
        const onClose = vi.fn();

        const { rerender } = render(
            <ExportPreviewModal
                isOpen={false}
                resourceTitle="Act One"
                preview="Preview text"
                onConfirmExport={vi.fn()}
                onClose={onClose}
            />,
        );

        // Initially closed — modal should not be visible
        expect(screen.queryByText("Export Act One")).not.toBeInTheDocument();

        // Trigger open (simulates AppShell setting exportModal.open = true)
        rerender(
            <ExportPreviewModal
                isOpen={true}
                resourceTitle="Act One"
                preview="Preview text"
                onConfirmExport={vi.fn()}
                onClose={onClose}
            />,
        );

        expect(screen.getByText("Export Act One")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toHaveTextContent("Export Act One");

        // Cancel closes the modal
        fireEvent.click(screen.getByText("Cancel"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("CompilePreviewModal opens and closes when triggered then cancelled", () => {
        const onClose = vi.fn();

        const { rerender } = render(
            <CompilePreviewModal
                isOpen={false}
                resource={undefined}
                resources={[]}
                onClose={onClose}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.queryByText("Compile Preview")).not.toBeInTheDocument();

        rerender(
            <CompilePreviewModal
                isOpen={true}
                resource={undefined}
                resources={[]}
                onClose={onClose}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByText("Compile Preview")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /Generate preview/i }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /close/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
