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
    it("renders story date/duration controls and invokes callbacks", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 90,
            },
        });
        const onDate = vi.fn();
        const onDuration = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar
                    onChangeStoryDate={onDate}
                    onChangeStoryDuration={onDuration}
                />
            </Provider>,
        );

        const dateInput = screen.getByLabelText("story-date-input") as HTMLInputElement;
        expect(dateInput).toBeInTheDocument();
        expect(dateInput.value).toBe("2024-06-01");

        const durationInput = screen.getByLabelText("story-duration-input") as HTMLInputElement;
        expect(durationInput).toBeInTheDocument();
        expect(durationInput.value).toBe("90");

        fireEvent.change(dateInput, { target: { value: "2024-07-15" } });
        expect(onDate).toHaveBeenCalledWith("2024-07-15");

        fireEvent.change(durationInput, { target: { value: "120" } });
        expect(onDuration).toHaveBeenCalledWith(120);
    });

    it("renders notes and status and invokes callbacks", () => {
        const res = createTextResource({
            name: "Notes",
            plainText: "",
            userMetadata: { notes: "", status: "draft" },
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
