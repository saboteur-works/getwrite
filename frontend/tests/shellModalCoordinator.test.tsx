import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ShellModalCoordinator from "../components/Layout/ShellModalCoordinator";
import type { ShellModalCoordinatorProps } from "../components/Layout/ShellModalCoordinator";

function makeDefaultProps(overrides: Partial<ShellModalCoordinatorProps> = {}): ShellModalCoordinatorProps {
    return {
        contextAction: { open: false },
        setContextAction: vi.fn(),
        isCloseProjectConfirmOpen: false,
        setIsCloseProjectConfirmOpen: vi.fn(),
        createModal: { open: false },
        setCreateModal: vi.fn(),
        exportModal: { open: false },
        setExportModal: vi.fn(),
        compileModal: { open: false },
        setCompileModal: vi.fn(),
        renameModal: { open: false },
        setRenameModal: vi.fn(),
        onRenameConfirm: vi.fn(),
        isHeadingSettingsModalOpen: false,
        setIsHeadingSettingsModalOpen: vi.fn(),
        isBodySettingsModalOpen: false,
        setIsBodySettingsModalOpen: vi.fn(),
        onSaveBodySettings: vi.fn(),
        isDefaultRevisionNameModalOpen: false,
        setIsDefaultRevisionNameModalOpen: vi.fn(),
        initialDefaultRevisionName: "",
        onSaveDefaultRevisionName: vi.fn(),
        isPreferencesModalOpen: false,
        setIsPreferencesModalOpen: vi.fn(),
        isHelpModalOpen: false,
        setIsHelpModalOpen: vi.fn(),
        isProjectTypesModalOpen: false,
        setIsProjectTypesModalOpen: vi.fn(),
        isTagsManagerOpen: false,
        setIsTagsManagerOpen: vi.fn(),
        isResourcePaletteOpen: false,
        setIsResourcePaletteOpen: vi.fn(),
        isProjectTypesLoading: false,
        projectTypesLoadError: null,
        projectTypeTemplates: [],
        hasUnsavedEditorChanges: false,
        onDeleteConfirm: vi.fn(),
        onCloseProjectConfirm: vi.fn(),
        onSaveHeadingSettings: vi.fn(),
        onCreateConfirmed: vi.fn(),
        onExportConfirmed: vi.fn(),
        onBuildCompilePreview: vi.fn().mockReturnValue(""),
        onConfirmCompile: vi.fn(),
        ...overrides,
    };
}

describe("ShellModalCoordinator — close-project confirm dialog", () => {
    it("renders the close-project dialog when isCloseProjectConfirmOpen is true", () => {
        render(<ShellModalCoordinator {...makeDefaultProps({ isCloseProjectConfirmOpen: true })} />);
        expect(screen.getByText("Close project?")).toBeTruthy();
    });

    it("does not render the close-project dialog when isCloseProjectConfirmOpen is false", () => {
        render(<ShellModalCoordinator {...makeDefaultProps({ isCloseProjectConfirmOpen: false })} />);
        expect(screen.queryByText("Close project?")).toBeNull();
    });

    it("renders each syncBlocker label in the close-project dialog", () => {
        render(
            <ShellModalCoordinator
                {...makeDefaultProps({
                    isCloseProjectConfirmOpen: true,
                    syncBlockers: [
                        { id: "editor-content", label: "Editor content" },
                        { id: "revision-save", label: "Saving revision" },
                    ],
                })}
            />,
        );
        expect(screen.getByText("Editor content")).toBeTruthy();
        expect(screen.getByText("Saving revision")).toBeTruthy();
    });

    it("marks error blockers with a visible error indicator", () => {
        const { container } = render(
            <ShellModalCoordinator
                {...makeDefaultProps({
                    isCloseProjectConfirmOpen: true,
                    syncBlockers: [
                        { id: "revision-save", label: "Saving revision", isError: true },
                    ],
                })}
            />,
        );
        expect(container.querySelector(".sync-blocker--error")).toBeTruthy();
    });

    it("renders no blocker list when syncBlockers is empty", () => {
        const { container } = render(
            <ShellModalCoordinator
                {...makeDefaultProps({
                    isCloseProjectConfirmOpen: true,
                    syncBlockers: [],
                })}
            />,
        );
        expect(container.querySelector(".sync-blockers-list")).toBeNull();
    });

    it("renders no blocker list when syncBlockers is not provided", () => {
        const { container } = render(
            <ShellModalCoordinator
                {...makeDefaultProps({ isCloseProjectConfirmOpen: true })}
            />,
        );
        expect(container.querySelector(".sync-blockers-list")).toBeNull();
    });
});
