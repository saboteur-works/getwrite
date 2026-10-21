import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import TagsManagerModal from "../components/common/TagsManagerModal";
import { Dialog } from "../components/common/UI/Dialog/Dialog";
import { flushPendingEffects } from "./helpers/flushEffects";

function renderInDialog(ui: React.ReactElement) {
  return render(
    <Dialog open onOpenChange={() => undefined}>
      {ui}
    </Dialog>,
  );
}

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

  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : {};

        if (url.includes("/api/project/tags/delete")) {
          currentTags = currentTags.filter((t) => t.id !== body.tagId);
          return {
            ok: true,
            json: async () => ({ deleted: true }),
          } as Response;
        }

        if (url.includes("/api/project/tags")) {
          if (body.action === "list") {
            return {
              ok: true,
              json: async () => ({ tags: currentTags }),
            } as Response;
          }
          if (body.action === "update") {
            const updated = {
              id: body.tagId,
              name: body.name,
              ...(body.color ? { color: body.color } : {}),
            };
            currentTags = currentTags.map((t) =>
              t.id === body.tagId ? updated : t,
            );
            return {
              ok: true,
              json: async () => ({ tag: updated }),
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
    renderInDialog(
      <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
    );

    expect(await screen.findByText("POV Scene")).toBeInTheDocument();
    expect(await screen.findByText("Key Event")).toBeInTheDocument();
  });

  it("shows empty-state message when there are no tags", async () => {
    setupFetchStub([]);
    renderInDialog(
      <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
    );

    expect(await screen.findByText(/No tags yet/i)).toBeInTheDocument();
  });

  it("submitting the new-tag form calls the create endpoint and shows the new tag", async () => {
    const fetchStub = setupFetchStub([]);
    renderInDialog(
      <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
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
      if (
        url.toString().includes("/delete") ||
        url.toString().includes("/assign")
      )
        return false;
      const b = JSON.parse(((init as RequestInit)?.body as string) ?? "{}");
      return b.action === "create";
    });
    expect(createCall).toBeDefined();
    const body = JSON.parse(createCall![1]?.body as string);
    expect(body.name).toBe("My New Tag");
  });

  it("clicking delete on a tag removes it from the list", async () => {
    setupFetchStub();
    renderInDialog(
      <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
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

  it("calls onClose when Escape is pressed", async () => {
    setupFetchStub([]);
    const onClose = vi.fn();
    renderInDialog(
      <TagsManagerModal projectPath={PROJECT_PATH} onClose={onClose} />,
    );
    // TagsManagerModal fires its own tag-list fetch-then-setState effect
    // on mount; this test doesn't assert on it, so flush it inside act()
    // rather than leaving its eventual update to land outside any act()
    // scope.
    await flushPendingEffects();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe("editing a tag", () => {
    function updateBodies(fetchStub: ReturnType<typeof setupFetchStub>) {
      return fetchStub.mock.calls
        .map(([, init]) =>
          JSON.parse(((init as RequestInit)?.body as string) ?? "{}"),
        )
        .filter((b) => b.action === "update");
    }

    async function openEditor(name: string) {
      await screen.findByText(name);
      fireEvent.click(screen.getByRole("button", { name: `Edit tag ${name}` }));
      return screen.getByRole("textbox", { name: `Name for tag ${name}` });
    }

    it("renames and recolours a tag, keeping its id", async () => {
      const fetchStub = setupFetchStub();
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
      );

      const input = await openEditor("POV Scene");
      fireEvent.change(input, { target: { value: "  Viewpoint  " } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Use a color" }));
      fireEvent.change(screen.getByLabelText("Color for tag POV Scene"), {
        target: { value: "#336699" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(await screen.findByText("Viewpoint")).toBeInTheDocument();
      expect(screen.queryByText("POV Scene")).not.toBeInTheDocument();
      expect(updateBodies(fetchStub)).toEqual([
        expect.objectContaining({
          tagId: "tag-1",
          name: "Viewpoint",
          color: "#336699",
        }),
      ]);
    });

    it("clears a tag's color when Use a color is unticked", async () => {
      const fetchStub = setupFetchStub();
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
      );

      await openEditor("Key Event");
      const useColour = screen.getByRole("checkbox", { name: "Use a color" });
      expect(useColour).toBeChecked();
      fireEvent.click(useColour);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      await waitFor(() => expect(updateBodies(fetchStub)).toHaveLength(1));
      expect(updateBodies(fetchStub)[0]).not.toHaveProperty("color");
    });

    it("refuses a blank name beside the field without saving", async () => {
      const fetchStub = setupFetchStub();
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
      );

      const input = await openEditor("POV Scene");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Tag name must not be blank.",
      );
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(updateBodies(fetchStub)).toHaveLength(0);
    });

    it("refuses another tag's name, ignoring capitals and spaces", async () => {
      const fetchStub = setupFetchStub();
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
      );

      const input = await openEditor("POV Scene");
      fireEvent.change(input, { target: { value: " key event " } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "A tag named \u201cKey Event\u201d already exists.",
      );
      expect(updateBodies(fetchStub)).toHaveLength(0);
    });

    it("shows the project's refusal beside the field", async () => {
      const fetchStub = setupFetchStub();
      const stubbed = fetchStub.getMockImplementation()!;
      fetchStub.mockImplementation(async (input, init) => {
        const body = JSON.parse(
          ((init as RequestInit)?.body as string) ?? "{}",
        );
        if (body.action === "update") {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: "Tag update refused",
              details: "Tag color must be a hex color such as #3366cc.",
            }),
          } as Response;
        }
        return stubbed(input, init);
      });
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={() => {}} />,
      );

      await openEditor("POV Scene");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Tag color must be a hex color such as #3366cc.",
      );
    });

    it("Escape cancels the edit without closing the manager", async () => {
      const fetchStub = setupFetchStub();
      const onClose = vi.fn();
      renderInDialog(
        <TagsManagerModal projectPath={PROJECT_PATH} onClose={onClose} />,
      );

      const input = await openEditor("POV Scene");
      fireEvent.change(input, { target: { value: "Viewpoint" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(
        screen.queryByRole("textbox", { name: "Name for tag POV Scene" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("POV Scene")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(updateBodies(fetchStub)).toHaveLength(0);
    });
  });
});
