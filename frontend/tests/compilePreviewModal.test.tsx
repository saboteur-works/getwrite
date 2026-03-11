import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompilePreviewModal from "../components/common/CompilePreviewModal";
import type { AnyResource } from "../src/lib/models/types";

describe("CompilePreviewModal", () => {
    it("renders preview and calls onConfirm", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();

        const resource: AnyResource = {
            id: "r1",
            name: "Test Doc",
            type: "text",
            plainText: "",
            createdAt: "",
            updatedAt: "",
            metadata: {},
        };

        render(
            <CompilePreviewModal
                isOpen={true}
                resource={resource}
                resources={[]}
                onClose={onClose}
                onConfirm={onConfirm}
            />,
        );

        expect(screen.getByText("Compile Preview")).toBeInTheDocument();
        const textarea = screen.getByLabelText(
            "compile-preview",
        ) as HTMLTextAreaElement;
        expect(textarea.value).toContain("Test Doc");

        const confirmBtn = screen.getByText("Confirm");
        fireEvent.click(confirmBtn);

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
