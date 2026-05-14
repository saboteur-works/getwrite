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

        const durationQty = screen.getByLabelText("story-duration-quantity") as HTMLInputElement;
        expect(durationQty).toBeInTheDocument();
        expect(durationQty.value).toBe("90");

        fireEvent.change(dateInput, { target: { value: "2024-07-15" } });
        expect(onDate).toHaveBeenCalledWith("2024-07-15");

        fireEvent.change(durationQty, { target: { value: "120" } });
        expect(onDuration).toHaveBeenCalledWith(120);
    });

    it("shows computed end date when storyDate and storyDuration are set", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
            },
        });

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        // End date section should be present with Override button (read-only mode)
        expect(screen.getByLabelText("end-date-override-toggle")).toBeInTheDocument();
        // No manual input in read-only mode
        expect(screen.queryByLabelText("story-end-date-input")).not.toBeInTheDocument();
    });

    it("calls onChangeStoryEndDate when user overrides the end date", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
            },
        });
        const onEndDate = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeStoryEndDate={onEndDate} />
            </Provider>,
        );

        fireEvent.click(screen.getByLabelText("end-date-override-toggle"));
        fireEvent.change(screen.getByLabelText("story-end-date-input"), {
            target: { value: "2024-06-01T06:00" },
        });
        expect(onEndDate).toHaveBeenCalledWith("2024-06-01T06:00");
    });

    it("shows editable end date input when storyEndDate override is already set", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
                storyEndDate: "2024-06-01T04:00",
            },
        });

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        const input = screen.getByLabelText("story-end-date-input") as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe("2024-06-01T04:00");
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
