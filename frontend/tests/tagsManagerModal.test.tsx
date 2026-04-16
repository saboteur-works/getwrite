import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import TagsManagerModal from "../components/common/TagsManagerModal";

const PROJECT_PATH = "/tmp/test-tags-manager";

function makeTags(
    overrides: { id: string; name: string; color?: string }[] = [],
) {
    return [
        { id: "tag-1", name: "POV Scene" },
        { id: "tag-2", name: "Key Event", color: "#d44040" },
        ...overrides,
    ];
}

function setupFetchStub(
    initial = makeTags(),
    onCreate?: (body: { name: string; color?: string }) => {
        id: string;
        name: string;
    },
) {
    let currentTags = [...initial];

    return vi.spyOn(globalThis, "fetch").mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input.toString();
            const body = init?.body ? JSON.parse(init.body as string) : {};

            if (url.includes("/api/project/tags/delete")) {
                currentTags = currentTags.filter((t) => t.id !== body.tagId);
                return { ok: true, json: async () => ({ deleted: true }) } as Response;
            }

            if (url.includes("/api/project/tags")) {
                if (body.action === "list") {
                    return {
                        ok: true,
                        json: async () => ({ tags: currentTags }),
                    } as Response;
                }
                if (body.action === "create") {
                    const newTag = onCreate
                        ? onCreate(body)
                        : { id: "new-tag-id", name: body.name };
                    currentTags = [...currentTags, newTag];
                    return {
                        ok: true,
                        json: async () => ({ tag: newTag }),
                    } as Response;
                }
            }

            return { ok: true, json: async () => ({}) } as Response;
        },
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("TagsManagerModal", () => {
    it("renders the list of project tags on mount", async () => {
        setupFetchStub();
        render(
            <TagsManagerModal
                projectPath={PROJECT_PATH}
                onClose={() => {}}
            />,
        );

        expect(await screen.findByText("POV Scene")).toBeInTheDocument();
        expect(await screen.findByText("Key Event")).toBeInTheDocument();
    });

    it("shows empty-state message when there are no tags", async () => {
        setupFetchStub([]);
        render(
            <TagsManagerModal
                projectPath={PROJECT_PATH}
                onClose={() => {}}
            />,
        );

        expect(await screen.findByText(/No tags yet/i)).toBeInTheDocument();
    });

    it("submitting the new-tag form calls the create endpoint and shows the new tag", async () => {
        const fetchStub = setupFetchStub([]);
        render(
            <TagsManagerModal
                projectPath={PROJECT_PATH}
                onClose={() => {}}
            />,
        );

        const input = await screen.findByLabelText("New tag name");
        fireEvent.change(input, { target: { value: "My New Tag" } });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /add tag/i }));
        });

        await waitFor(() => {
            expect(screen.getByText("My New Tag")).toBeInTheDocument();
        });

        const createCall = fetchStub.mock.calls.find(([url, init]) => {
            if (!url.toString().includes("/api/project/tags")) return false;
            if (url.toString().includes("/delete") || url.toString().includes("/assign")) return false;
            const b = JSON.parse((init as RequestInit)?.body as string ?? "{}");
            return b.action === "create";
        });
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall![1]?.body as string);
        expect(body.name).toBe("My New Tag");
    });

    it("clicking delete on a tag removes it from the list", async () => {
        setupFetchStub();
        render(
            <TagsManagerModal
                projectPath={PROJECT_PATH}
                onClose={() => {}}
            />,
        );

        await screen.findByText("POV Scene");

        const deleteBtn = screen.getByRole("button", {
            name: /delete tag POV Scene/i,
        });
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(screen.queryByText("POV Scene")).not.toBeInTheDocument();
        });
    });

    it("calls onClose when the Close button is clicked", () => {
        setupFetchStub([]);
        const onClose = vi.fn();
        render(
            <TagsManagerModal projectPath={PROJECT_PATH} onClose={onClose} />,
        );

        fireEvent.click(screen.getByRole("button", { name: /close/i }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
