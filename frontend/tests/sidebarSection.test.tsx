import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CollapsibleSection from "../components/common/UI/CollapsibleSection/CollapsibleSection";

describe("SidebarSection (via CollapsibleSection variant='sidebar')", () => {
    it("renders children when open by default", () => {
        render(
            <CollapsibleSection title="Synopsis" variant="sidebar">
                <textarea aria-label="synopsis" />
            </CollapsibleSection>,
        );
        expect(screen.getByLabelText("synopsis")).toBeInTheDocument();
    });

    it("hides children when defaultOpen is false", () => {
        render(
            <CollapsibleSection title="Synopsis" variant="sidebar" defaultOpen={false}>
                <textarea aria-label="synopsis" />
            </CollapsibleSection>,
        );
        expect(screen.queryByLabelText("synopsis")).not.toBeInTheDocument();
    });

    it("renders the section label", () => {
        render(
            <CollapsibleSection title="Story Timeline" variant="sidebar">
                <span>content</span>
            </CollapsibleSection>,
        );
        expect(screen.getByText("Story Timeline")).toBeInTheDocument();
    });

    it("collapses content when toggle is clicked while open", () => {
        render(
            <CollapsibleSection title="Notes" variant="sidebar">
                <textarea aria-label="notes" />
            </CollapsibleSection>,
        );
        expect(screen.getByLabelText("notes")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
    });

    it("expands content when toggle is clicked while collapsed", () => {
        render(
            <CollapsibleSection title="Notes" variant="sidebar" defaultOpen={false}>
                <textarea aria-label="notes" />
            </CollapsibleSection>,
        );
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(screen.getByLabelText("notes")).toBeInTheDocument();
    });

    it("toggle button has aria-expanded reflecting open state", () => {
        render(
            <CollapsibleSection title="Tags" variant="sidebar">
                <span>content</span>
            </CollapsibleSection>,
        );
        const btn = screen.getByRole("button", { name: /tags/i });
        expect(btn).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(btn);
        expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("toggle button has aria-controls pointing to content region", () => {
        render(
            <CollapsibleSection title="Status & POV" variant="sidebar">
                <span>content</span>
            </CollapsibleSection>,
        );
        const btn = screen.getByRole("button", { name: /status/i });
        const controlsId = btn.getAttribute("aria-controls");
        expect(controlsId).toBeTruthy();
    });

    it("fires onToggle callback with new state", () => {
        const onToggle = vi.fn();
        render(
            <CollapsibleSection title="Notes" variant="sidebar" onToggle={onToggle}>
                <span>content</span>
            </CollapsibleSection>,
        );
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(onToggle).toHaveBeenCalledWith(false);
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(onToggle).toHaveBeenCalledWith(true);
    });
});
