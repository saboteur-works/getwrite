import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let fakeState: any = {
    projects: { selectedProjectId: null, projects: {} },
    resources: { resources: [], folders: [] },
};

vi.mock("../src/store/hooks", () => ({
    __esModule: true,
    default: (selector: any) => selector(fakeState),
}));

import TimelineView from "../components/WorkArea/TimelineView";
import { createTextResource } from "../src/lib/models/resource";

beforeEach(() => {
    fakeState = {
        projects: { selectedProjectId: "proj1", projects: { proj1: { id: "proj1", name: "My Novel" } } },
        resources: { resources: [], folders: [] },
    };
});

describe("TimelineView", () => {
    it("shows empty state when no resources have storyDate", () => {
        fakeState.resources.resources = [
            createTextResource({ name: "Undated Scene", plainText: "" }),
        ];
        render(<TimelineView />);
        expect(
            screen.getByText(/no scenes have story dates yet/i),
        ).toBeInTheDocument();
    });

    it("renders item chips for resources with storyDate", () => {
        const res = createTextResource({
            name: "Opening Scene",
            plainText: "",
            userMetadata: { storyDate: "2024-01-15" },
        });
        fakeState.resources.resources = [res];
        render(<TimelineView />);
        expect(screen.getByRole("listitem", { name: "Opening Scene" })).toBeInTheDocument();
    });

    it("renders multiple items from multiple resources", () => {
        fakeState.resources.resources = [
            createTextResource({ name: "Scene A", plainText: "", userMetadata: { storyDate: "2024-01-01" } }),
            createTextResource({ name: "Scene B", plainText: "", userMetadata: { storyDate: "2024-02-01" } }),
            createTextResource({ name: "Scene C", plainText: "", userMetadata: { storyDate: "2024-03-01" } }),
        ];
        render(<TimelineView />);
        expect(screen.getByRole("listitem", { name: "Scene A" })).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Scene B" })).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Scene C" })).toBeInTheDocument();
    });

    it("shows group labels for folders referenced by dated items", () => {
        const folderId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        fakeState.resources.folders = [{ id: folderId, name: "Act One", type: "folder" }];
        fakeState.resources.resources = [
            createTextResource({
                name: "Inciting Incident",
                plainText: "",
                folderId,
                userMetadata: { storyDate: "2024-01-10" },
            }),
        ];
        render(<TimelineView />);
        expect(screen.getByText("Act One")).toBeInTheDocument();
    });

    it("includes the project name in the heading", () => {
        render(<TimelineView />);
        expect(screen.getByText(/Timeline — My Novel/i)).toBeInTheDocument();
    });

    it("omits resources without storyDate from the timeline", () => {
        fakeState.resources.resources = [
            createTextResource({ name: "Dated", plainText: "", userMetadata: { storyDate: "2024-06-01" } }),
            createTextResource({ name: "Undated", plainText: "" }),
        ];
        render(<TimelineView />);
        expect(screen.getByRole("listitem", { name: "Dated" })).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { name: "Undated" })).not.toBeInTheDocument();
    });
});
