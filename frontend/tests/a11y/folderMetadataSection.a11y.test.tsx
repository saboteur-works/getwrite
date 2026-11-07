import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import FolderMetadataSection from "../../components/Sidebar/FolderMetadataSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import type { Folder } from "../../src/lib/models/types";

const getFolderMetadata = vi.fn();
const updateFolderMetadata = vi.fn();
vi.mock("../../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: (...args: unknown[]) => getFolderMetadata(...args),
  updateFolderMetadata: (...args: unknown[]) => updateFolderMetadata(...args),
}));

const FOLDER = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "folder",
  name: "Characters",
  slug: "characters",
} as Folder;

function mount(): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "p",
      rootPath: "/test",
      subtypes: ["Cast"],
      metadataSchema: {
        groups: [
          {
            id: "g",
            label: "G",
            fields: [
              { key: "mood", label: "Mood", type: "text" },
              { key: "alive", label: "Alive", type: "boolean" },
              {
                key: "tone",
                label: "Tone",
                type: "select",
                options: ["a", "b"],
              },
            ],
          },
        ],
      },
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <FolderMetadataSection folder={FOLDER} />
    </Provider>,
  );
}

beforeEach(() => {
  getFolderMetadata.mockReset();
  updateFolderMetadata.mockReset();
});

describe("a11y: FolderMetadataSection", () => {
  it("axe passes for the loaded form", async () => {
    getFolderMetadata.mockResolvedValue({ notes: "", fieldValues: {} });
    const { container } = mount();
    await screen.findByLabelText("Folder notes");
    await runAxe(container);
  });

  it("axe passes for a failed read", async () => {
    getFolderMetadata.mockRejectedValue(new Error("nope"));
    const { container } = mount();
    await screen.findByRole("alert");
    await runAxe(container);
  });

  it("axe passes for a failed save, and the message is text in an alert", async () => {
    getFolderMetadata.mockResolvedValue({ notes: "", fieldValues: {} });
    updateFolderMetadata.mockRejectedValue(new Error("disk full"));
    const { container } = mount();
    fireEvent.change(await screen.findByLabelText("Folder notes"), {
      target: { value: "x" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save folder metadata" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
    await runAxe(container);
  });

  it("every control is reachable by Tab in order and has an accessible name", async () => {
    getFolderMetadata.mockResolvedValue({ notes: "n", fieldValues: {} });
    mount();
    const notes = await screen.findByLabelText("Folder notes");
    const user = userEvent.setup();
    await user.click(notes);
    // Make the form dirty so the Save button is enabled and focusable.
    await user.type(notes, "!");
    const steps: Array<[string, string]> = [
      ["combobox", "Subtype"],
      ["textbox", "Mood"],
      ["checkbox", "Alive"],
      ["combobox", "Tone"],
      ["button", "Save folder metadata"],
    ];
    for (const [role, name] of steps) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole(role, { name }));
    }
  });

  it("uses no red class or red brand colour", async () => {
    getFolderMetadata.mockResolvedValue({ notes: "", fieldValues: {} });
    const { container } = mount();
    await screen.findByLabelText("Folder notes");
    expect(container.innerHTML).not.toMatch(/red|#D44040/i);
  });
});
