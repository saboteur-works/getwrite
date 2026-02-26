import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OrganizerCard from "../components/WorkArea/OrganizerCard";
import { createTextResource } from "../src/lib/models/resource";

describe("OrganizerCard", () => {
    it("renders title, type, date, body and metadata when showBody is true", () => {
        const res = createTextResource({
            name: "Test Resource",
            plainText: "Placeholder content for Test Resource",
            metadata: { wordCount: 42, status: "draft" },
        } as any);

        render(<OrganizerCard resource={res} showBody={true} />);

        expect(screen.getByText("Test Resource")).toBeTruthy();
        expect(screen.getByText(/text/i)).toBeTruthy();
        expect(screen.getByText(/Words:/i)).toHaveTextContent("42");
        expect(screen.getByText(/Status:/i)).toHaveTextContent("draft");
        // body/content should be visible
        expect(
            screen.getByText(/Placeholder content for Test Resource/i),
        ).toBeTruthy();
    });

    it("hides the body when showBody is false", () => {
        const res = createTextResource({
            name: "Hidden Body",
            plainText: "Placeholder content for Hidden Body",
            metadata: {},
        } as any);
        render(<OrganizerCard resource={res} showBody={false} />);

        expect(screen.getByText("Hidden Body")).toBeTruthy();
        // body text should not be present
        expect(
            screen.queryByText(/Placeholder content for Hidden Body/i),
        ).toBeNull();
    });
});
