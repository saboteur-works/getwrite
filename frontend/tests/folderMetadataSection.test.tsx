import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import MetadataSidebar from "../components/Sidebar/MetadataSidebar";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
} from "../src/lib/models/types";
import type { FolderSidecarValue } from "../src/lib/api/folder-metadata";
import { flushPendingEffects } from "./helpers/flushEffects";

const getFolderMetadata = vi.fn();
const updateFolderMetadata = vi.fn();
vi.mock("../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: (...args: unknown[]) => getFolderMetadata(...args),
  updateFolderMetadata: (...args: unknown[]) => updateFolderMetadata(...args),
}));

const isFieldVisibleForSubtypeSpy = vi.fn();
vi.mock("../src/lib/models/field-subtype-scope", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/models/field-subtype-scope")
  >("../src/lib/models/field-subtype-scope");
  return {
    ...actual,
    isFieldVisibleForSubtype: (
      ...args: Parameters<typeof actual.isFieldVisibleForSubtype>
    ) => {
      isFieldVisibleForSubtypeSpy(...args);
      return actual.isFieldVisibleForSubtype(...args);
    },
  };
});

const FOLDER: Folder = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "folder",
  name: "Characters",
  slug: "characters",
} as Folder;

const SCHEMA: MetadataSchema = {
  groups: [
    {
      id: "g",
      label: "G",
      fields: [
        { key: "notes", label: "Notes", type: "text" },
        { key: "mood", label: "Mood", type: "text" },
        {
          key: "era",
          label: "Era",
          type: "text",
          appliesTo: ["Cast"],
          appliesToFolders: true,
        },
        {
          key: "scene-only",
          label: "Scene only",
          type: "text",
          appliesTo: ["Scene"],
        },
      ],
    },
  ],
};

function empty(): FolderSidecarValue {
  return { notes: "", fieldValues: {}, resourceSubtype: undefined };
}

function mount(): ReturnType<typeof makeStore> {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "p",
      rootPath: "/test",
      subtypes: ["Cast", "Scene"],
      metadataSchema: SCHEMA,
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([] as AnyResource[]));
  store.dispatch(setFolders([FOLDER]));
  store.dispatch(setSelectedResourceId(FOLDER.id));
  render(
    <Provider store={store}>
      <MetadataSidebar />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  getFolderMetadata.mockReset();
  updateFolderMetadata.mockReset();
  isFieldVisibleForSubtypeSpy.mockClear();
});

describe("Folder metadata section in MetadataSidebar (Feature 102, Task 15)", () => {
  it("shows notes, offered fields and a subtype choice, loaded from the folder", async () => {
    getFolderMetadata.mockResolvedValue({
      notes: "Cast notes",
      fieldValues: { mood: "grim" },
      resourceSubtype: "Cast",
    });
    mount();
    expect(await screen.findByLabelText("Folder notes")).toHaveValue(
      "Cast notes",
    );
    expect(screen.getByRole("textbox", { name: "Mood" })).toHaveValue("grim");
    expect(screen.getByRole("textbox", { name: "Era" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Subtype" })).toHaveValue(
      "Cast",
    );
    expect(screen.getByRole("option", { name: "Scene" })).toBeInTheDocument();
    expect(getFolderMetadata).toHaveBeenCalledWith("test", FOLDER.id);
  });

  it("offers a restricted field only when appliesToFolders is true and the subtype matches", async () => {
    getFolderMetadata.mockResolvedValue(empty());
    mount();
    await screen.findByLabelText("Folder notes");
    expect(screen.getByRole("textbox", { name: "Mood" })).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Era" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Scene only" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Subtype" }), {
      target: { value: "Cast" },
    });
    expect(screen.getByRole("textbox", { name: "Era" })).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Scene only" }),
    ).not.toBeInTheDocument();
  });

  it("calls isFieldVisibleForSubtype explicitly for the section's fields (FR-10)", async () => {
    getFolderMetadata.mockResolvedValue(empty());
    mount();
    await screen.findByLabelText("Folder notes");
    expect(isFieldVisibleForSubtypeSpy).toHaveBeenCalledWith(
      "mood",
      undefined,
      undefined,
    );
  });

  it("saves only the edits, then shows Saved", async () => {
    getFolderMetadata.mockResolvedValue(empty());
    updateFolderMetadata.mockResolvedValue({
      notes: "New",
      fieldValues: { mood: "calm" },
      resourceSubtype: "Cast",
    });
    mount();
    fireEvent.change(await screen.findByLabelText("Folder notes"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Mood" }), {
      target: { value: "calm" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Subtype" }), {
      target: { value: "Cast" },
    });
    expect(screen.getByText("Unsaved changes.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save folder metadata" }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(updateFolderMetadata).toHaveBeenCalledWith("test", FOLDER.id, {
      notes: "New",
      fieldValues: { mood: "calm" },
      resourceSubtype: "Cast",
    });
  });

  it("clears the subtype with null", async () => {
    getFolderMetadata.mockResolvedValue({
      ...empty(),
      resourceSubtype: "Cast",
    });
    updateFolderMetadata.mockResolvedValue(empty());
    mount();
    fireEvent.change(await screen.findByRole("combobox", { name: "Subtype" }), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save folder metadata" }),
    );
    await screen.findByText("Saved.");
    expect(updateFolderMetadata).toHaveBeenCalledWith("test", FOLDER.id, {
      resourceSubtype: null,
    });
  });

  it("a failed save is not shown as saved and keeps the edit", async () => {
    getFolderMetadata.mockResolvedValue(empty());
    updateFolderMetadata.mockRejectedValue(new Error("disk full"));
    mount();
    fireEvent.change(await screen.findByLabelText("Folder notes"), {
      target: { value: "Keep me" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save folder metadata" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not saved: disk full");
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Folder notes")).toHaveValue("Keep me");
    expect(
      screen.getByRole("button", { name: "Save folder metadata" }),
    ).toBeEnabled();
  });

  it("a failed read shows an error with Retry, not an empty folder", async () => {
    getFolderMetadata.mockRejectedValueOnce(new Error("unreadable"));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("couldn't load");
    expect(alert).toHaveTextContent("unreadable");
    expect(screen.queryByLabelText("Folder notes")).not.toBeInTheDocument();
    getFolderMetadata.mockResolvedValueOnce({ ...empty(), notes: "Back" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Folder notes")).toHaveValue("Back"),
    );
  });

  it("does not show the resource-only sections for a folder", async () => {
    getFolderMetadata.mockResolvedValue(empty());
    mount();
    await screen.findByLabelText("Folder notes");
    await flushPendingEffects();
    expect(
      screen.queryByRole("button", { name: /word count goal/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add field" }),
    ).not.toBeInTheDocument();
  });

  it("leaves a text resource's sidebar without the folder section", async () => {
    const store = makeStore();
    const res = createTextResource({ name: "Chapter" });
    store.dispatch(setProject({ id: "p", rootPath: "/test" }));
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([res]));
    store.dispatch(setSelectedResourceId(res.id));
    render(
      <Provider store={store}>
        <MetadataSidebar />
      </Provider>,
    );
    await flushPendingEffects();
    expect(screen.queryByLabelText("Folder notes")).not.toBeInTheDocument();
    expect(getFolderMetadata).not.toHaveBeenCalled();
  });
});
