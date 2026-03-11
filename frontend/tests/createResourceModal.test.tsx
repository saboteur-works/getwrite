import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CreateResourceModal from "../components/Tree/CreateResourceModal";
import type { Folder } from "../src/lib/models/types";

describe("CreateResourceModal", () => {
    it("calls onCreate with entered title and type", () => {
        const onCreate = vi.fn();
        const onClose = vi.fn();

        const parents: Folder[] = [
            {
                id: "parent_1",
                name: "Folder A",
                type: "folder",
                createdAt: "",
                updatedAt: "",
                metadata: {},
            },
            {
                id: "parent_2",
                name: "Folder B",
                type: "folder",
                createdAt: "",
                updatedAt: "",
                metadata: {},
            },
        ];

        render(
            <CreateResourceModal
                isOpen={true}
                initialTitle={""}
                initialType={"text"}
                parentId={"parent_1"}
                parents={parents}
                onCreate={onCreate}
                onClose={onClose}
            />,
        );

        const titleInput = screen.getByLabelText(
            "resource-title",
        ) as HTMLInputElement;
        fireEvent.change(titleInput, { target: { value: "New Test" } });

        const typeSelect = screen.getByLabelText(
            "resource-type",
        ) as HTMLSelectElement;
        fireEvent.change(typeSelect, { target: { value: "text" } });

        const createBtn = screen.getByText("Create");
        fireEvent.click(createBtn);

        expect(onCreate).toHaveBeenCalledTimes(1);
        expect(onCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "New Test",
                type: "text",
                folderId: "parent_1",
            }),
            "parent_1",
            expect.any(Object),
        );
    });
});
