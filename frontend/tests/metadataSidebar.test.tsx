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
import {
    setProject,
    setSelectedProjectId,
} from "../src/store/projectsSlice";
import type { MetadataSchema } from "../src/lib/models/types";

describe("MetadataSidebar", () => {
    it("renders story date/duration controls and invokes onChangeField", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 90,
            },
        });
        const onChangeField = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeField={onChangeField} />
            </Provider>,
        );

        const dateInput = screen.getByLabelText("story-date-input") as HTMLInputElement;
        expect(dateInput).toBeInTheDocument();
        expect(dateInput.value).toBe("2024-06-01");

        const durationQty = screen.getByLabelText("story-duration-quantity") as HTMLInputElement;
        expect(durationQty).toBeInTheDocument();
        expect(durationQty.value).toBe("90");

        fireEvent.change(dateInput, { target: { value: "2024-07-15" } });
        expect(onChangeField).toHaveBeenCalledWith("storyDate", "2024-07-15");

        fireEvent.change(durationQty, { target: { value: "120" } });
        expect(onChangeField).toHaveBeenCalledWith("storyDuration", 120);
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

        expect(screen.getByLabelText("end-date-override-toggle")).toBeInTheDocument();
        expect(screen.queryByLabelText("story-end-date-input")).not.toBeInTheDocument();
    });

    it("calls onChangeField for storyEndDate when user overrides the end date", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
            },
        });
        const onChangeField = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeField={onChangeField} />
            </Provider>,
        );

        fireEvent.click(screen.getByLabelText("end-date-override-toggle"));
        fireEvent.change(screen.getByLabelText("story-end-date-input"), {
            target: { value: "2024-06-01T06:00" },
        });
        expect(onChangeField).toHaveBeenCalledWith("storyEndDate", "2024-06-01T06:00");
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

    it("renders synopsis input with initial value from userMetadata", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: { synopsis: "A duel at dawn." },
        });

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        const synopsis = screen.getByLabelText("synopsis") as HTMLTextAreaElement;
        expect(synopsis).toBeInTheDocument();
        expect(synopsis.value).toBe("A duel at dawn.");
    });

    it("calls onChangeField with key 'synopsis' when synopsis changes", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: { synopsis: "" },
        });
        const onChangeField = vi.fn();

        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeField={onChangeField} />
            </Provider>,
        );

        const synopsis = screen.getByLabelText("synopsis") as HTMLTextAreaElement;
        fireEvent.change(synopsis, { target: { value: "A new synopsis." } });
        expect(onChangeField).toHaveBeenCalledWith("synopsis", "A new synopsis.");
    });

    it("renders schema group sections as collapsible headings", () => {
        const res = createTextResource({ name: "Scene", plainText: "" });
        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.getByRole("button", { name: /document/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /story timeline/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /tags/i })).toBeInTheDocument();
    });

    it("collapses the Document section and hides synopsis and notes", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: { synopsis: "A duel at dawn." },
        });
        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.getByLabelText("synopsis")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /document/i }));
        expect(screen.queryByLabelText("synopsis")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
    });

    it("expands the Document section again when its header is clicked twice", () => {
        const res = createTextResource({ name: "Scene", plainText: "" });
        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        const docBtn = screen.getByRole("button", { name: /document/i });
        fireEvent.click(docBtn);
        expect(screen.queryByLabelText("notes")).not.toBeInTheDocument();
        fireEvent.click(docBtn);
        expect(screen.getByLabelText("notes")).toBeInTheDocument();
    });

    it("collapses story timeline and hides all three inputs", () => {
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: { storyDate: "2024-06-01", storyDuration: 90 },
        });
        const testStore = makeStore();
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.getByLabelText("story-date-input")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /story timeline/i }));
        expect(screen.queryByLabelText("story-date-input")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("story-duration-quantity")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("end-date-override-toggle")).not.toBeInTheDocument();
    });

    it("calls onChangeField for notes and status", () => {
        const res = createTextResource({
            name: "Notes",
            plainText: "",
            userMetadata: { notes: "", status: "draft" },
        });
        const onChangeField = vi.fn();

        const testStore = makeStore();
        const projectId = "test-project-id";
        testStore.dispatch(setProject({ id: projectId, rootPath: "/test", statuses: ["draft", "review", "published"] }));
        testStore.dispatch(setSelectedProjectId(projectId));
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeField={onChangeField} />
            </Provider>,
        );

        const notes = screen.getByLabelText("notes") as HTMLTextAreaElement;
        expect(notes).toBeInTheDocument();

        const status = screen.getByLabelText("status") as HTMLSelectElement;
        expect(status).toBeInTheDocument();

        fireEvent.change(notes, { target: { value: "Updated notes" } });
        expect(onChangeField).toHaveBeenCalledWith("notes", "Updated notes");

        fireEvent.change(status, { target: { value: "review" } });
        expect(onChangeField).toHaveBeenCalledWith("status", "review");
    });

    it("renders a custom text field when present in schema", () => {
        const customSchema: MetadataSchema = {
            groups: [
                {
                    id: "custom-group",
                    label: "Custom Group",
                    fields: [
                        { key: "my-field", label: "My Custom Field", type: "text" },
                    ],
                },
            ],
        };
        const res = createTextResource({ name: "Scene", plainText: "" });
        const testStore = makeStore();
        const projectId = "test-project-id";
        testStore.dispatch(setProject({ id: projectId, rootPath: "/test", metadataSchema: customSchema }));
        testStore.dispatch(setSelectedProjectId(projectId));
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.getByRole("button", { name: /custom group/i })).toBeInTheDocument();
        expect(screen.getByLabelText("my-field")).toBeInTheDocument();
    });

    it("calls onChangeField with custom field key for a custom text field", () => {
        const customSchema: MetadataSchema = {
            groups: [
                {
                    id: "custom-group",
                    label: "Custom Group",
                    fields: [
                        { key: "my-field", label: "My Custom Field", type: "text" },
                    ],
                },
            ],
        };
        const res = createTextResource({
            name: "Scene",
            plainText: "",
            userMetadata: { "my-field": "" },
        });
        const onChangeField = vi.fn();

        const testStore = makeStore();
        const projectId = "test-project-id";
        testStore.dispatch(setProject({ id: projectId, rootPath: "/test", metadataSchema: customSchema }));
        testStore.dispatch(setSelectedProjectId(projectId));
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar onChangeField={onChangeField} />
            </Provider>,
        );

        const input = screen.getByLabelText("my-field");
        fireEvent.change(input, { target: { value: "custom value" } });
        expect(onChangeField).toHaveBeenCalledWith("my-field", "custom value");
    });

    it("does not render a folder-scoped group when resource folderId does not match", () => {
        const customSchema: MetadataSchema = {
            groups: [
                {
                    id: "folder-group",
                    label: "Folder Group",
                    folderId: "folder-abc",
                    fields: [
                        { key: "folder-field", label: "Folder Field", type: "text" },
                    ],
                },
            ],
        };
        const res = createTextResource({ name: "Scene", plainText: "" });
        // Resource has no folderId (root-level), so group should be skipped
        const testStore = makeStore();
        const projectId = "test-project-id";
        testStore.dispatch(setProject({ id: projectId, rootPath: "/test", metadataSchema: customSchema }));
        testStore.dispatch(setSelectedProjectId(projectId));
        testStore.dispatch(setResources([res]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.queryByRole("button", { name: /folder group/i })).not.toBeInTheDocument();
    });

    it("renders a folder-scoped group when resource folderId matches", () => {
        const customSchema: MetadataSchema = {
            groups: [
                {
                    id: "folder-group",
                    label: "Folder Group",
                    folderId: "folder-abc",
                    fields: [
                        { key: "folder-field", label: "Folder Field", type: "text" },
                    ],
                },
            ],
        };
        const res = createTextResource({
            name: "Scene",
            plainText: "",
        });
        const resWithFolder = { ...res, folderId: "folder-abc" };

        const testStore = makeStore();
        const projectId = "test-project-id";
        testStore.dispatch(setProject({ id: projectId, rootPath: "/test", metadataSchema: customSchema }));
        testStore.dispatch(setSelectedProjectId(projectId));
        testStore.dispatch(setResources([resWithFolder as any]));
        testStore.dispatch(setSelectedResourceId(res.id));
        render(
            <Provider store={testStore}>
                <MetadataSidebar />
            </Provider>,
        );

        expect(screen.getByRole("button", { name: /folder group/i })).toBeInTheDocument();
        expect(screen.getByLabelText("folder-field")).toBeInTheDocument();
    });
});
