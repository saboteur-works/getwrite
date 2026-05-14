import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SidebarSection from "../components/Sidebar/SidebarSection";

describe("SidebarSection", () => {
    it("renders children when open by default", () => {
        render(
            <SidebarSection label="Synopsis">
                <textarea aria-label="synopsis" />
            </SidebarSection>,
        );
        expect(screen.getByLabelText("synopsis")).toBeInTheDocument();
    });

    it("hides children when defaultOpen is false", () => {
        render(
            <SidebarSection label="Synopsis" defaultOpen={false}>
                <textarea aria-label="synopsis" />
            </SidebarSection>,
        );
        expect(screen.queryByLabelText("synopsis")).not.toBeInTheDocument();
    });

    it("renders the section label", () => {
        render(
            <SidebarSection label="Story Timeline">
                <span>content</span>
            </SidebarSection>,
        );
        expect(screen.getByText("Story Timeline")).toBeInTheDocument();
    });

    it("collapses content when toggle is clicked while open", () => {
        render(
            <SidebarSection label="Notes">
                <textarea aria-label="notes" />
            </SidebarSection>,
        );
        expect(screen.getByLabelText("notes")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
    });

    it("expands content when toggle is clicked while collapsed", () => {
        render(
            <SidebarSection label="Notes" defaultOpen={false}>
                <textarea aria-label="notes" />
            </SidebarSection>,
        );
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /notes/i }));
        expect(screen.getByLabelText("notes")).toBeInTheDocument();
    });

    it("toggle button has aria-expanded reflecting open state", () => {
        render(
            <SidebarSection label="Tags">
                <span>content</span>
            </SidebarSection>,
        );
        const btn = screen.getByRole("button", { name: /tags/i });
        expect(btn).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(btn);
        expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("toggle button has aria-controls pointing to content region", () => {
        render(
            <SidebarSection label="Status & POV">
                <span>content</span>
            </SidebarSection>,
        );
        const btn = screen.getByRole("button", { name: /status/i });
        const controlsId = btn.getAttribute("aria-controls");
        expect(controlsId).toBeTruthy();
    });
});
