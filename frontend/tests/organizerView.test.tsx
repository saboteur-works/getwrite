import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerView from "../components/WorkArea/OrganizerView";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import { setFolders, setResources } from "../src/store/resourcesSlice";

describe("OrganizerView", () => {
    it("renders header, toggle, and folder resources when expanded", () => {
        const resources = [
            createTextResource({
                name: "R1",
                plainText: "Body R1",
                folderId: "11111111-1111-4111-8111-111111111111",
            } as any),
            createTextResource({
                name: "R2",
                plainText: "Body R2",
                folderId: "11111111-1111-4111-8111-111111111111",
            } as any),
        ];

        const folders = [
            {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Folder A",
                type: "folder",
                createdAt: new Date().toISOString(),
                metadata: {},
                folderId: null,
            },
        ];

        const testStore = makeStore();
        testStore.dispatch(setFolders(folders as any));
        testStore.dispatch(setResources(resources as any));

        render(
            <Provider store={testStore}>
                <OrganizerView resources={resources} showBody={true} />
            </Provider>,
        );

        expect(screen.getByText(/Organizer/i)).toBeTruthy();
        expect(screen.getByText(/Folder A/i)).toBeTruthy();

        expect(screen.queryByText("R1")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Folder A/i }));

        expect(screen.getByText("R1")).toBeTruthy();
        expect(screen.getByText("R2")).toBeTruthy();
    });

    it("calls onToggleBody when toggle button is clicked", () => {
        const resources = [
            createTextResource({
                name: "R1",
                plainText: "Body R1",
                folderId: null,
            } as any),
            createTextResource({
                name: "R2",
                plainText: "Body R2",
                folderId: null,
            } as any),
        ];

        const folders = [
            {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Folder A",
                type: "folder",
                createdAt: new Date().toISOString(),
                metadata: {},
                folderId: null,
            },
        ];

        const onToggle = vi.fn();
        const testStore = makeStore();
        testStore.dispatch(setFolders(folders as any));
        testStore.dispatch(setResources(resources as any));

        render(
            <Provider store={testStore}>
                <OrganizerView
                    resources={resources}
                    showBody={true}
                    onToggleBody={onToggle}
                />
            </Provider>,
        );

        const button = screen.getByRole("button", {
            name: /Hide bodies|Show bodies/i,
        });
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalled();
    });
});
