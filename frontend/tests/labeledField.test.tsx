import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LabeledField from "../components/Sidebar/controls/LabeledField";

describe("LabeledField", () => {
    it("renders the label text", () => {
        render(
            <LabeledField label="Status">
                <span>control</span>
            </LabeledField>,
        );

        expect(screen.getByText("Status")).toBeTruthy();
    });

    it("renders children", () => {
        render(
            <LabeledField label="Notes">
                <textarea aria-label="notes-field" />
            </LabeledField>,
        );

        expect(screen.getByLabelText("notes-field")).toBeTruthy();
    });

    it("applies className to the wrapper div", () => {
        const { container } = render(
            <LabeledField label="POV" className="my-custom-class">
                <input />
            </LabeledField>,
        );

        expect(container.firstChild as HTMLElement).toBeTruthy();
        expect((container.firstChild as HTMLElement).className).toBe(
            "my-custom-class",
        );
    });

    it("renders an empty wrapper when no className is provided", () => {
        const { container } = render(
            <LabeledField label="Items">
                <span>children</span>
            </LabeledField>,
        );

        expect((container.firstChild as HTMLElement).className).toBe("");
    });
});
