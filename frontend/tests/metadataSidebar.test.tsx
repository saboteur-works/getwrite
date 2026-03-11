import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import MetadataSidebar from "../components/Sidebar/MetadataSidebar";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
    setResources,
    setSelectedResourceId,
} from "../src/store/resourcesSlice";

describe("MetadataSidebar", () => {
    it("renders notes and status and invokes callbacks", () => {
        const res = createTextResource({
            name: "Notes",
            plainText: "",
            metadata: { notes: "", status: "draft" },
        });
        const onNotes = vi.fn();
        const onStatus = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar
                    onChangeNotes={onNotes}
                    onChangeStatus={onStatus}
                />
            </Provider>,
        );

        const notes = screen.getByLabelText("notes") as HTMLTextAreaElement;
        expect(notes).toBeInTheDocument();

        const status = screen.getByLabelText("status") as HTMLSelectElement;
        expect(status).toBeInTheDocument();

        fireEvent.change(notes, { target: { value: "Updated notes" } });
        expect(onNotes).toHaveBeenCalledWith("Updated notes");

        fireEvent.change(status, { target: { value: "review" } });
        expect(onStatus).toHaveBeenCalledWith("review");
    });
});
