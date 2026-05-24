import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import SchemaManager from "../components/SchemaManager/SchemaManager";
import { Dialog } from "../components/common/UI/Dialog/Dialog";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setFolders } from "../src/store/resourcesSlice";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { Folder, MetadataSchema } from "../src/lib/models/types";

function makeFolder(id: string, name: string): Folder {
  return {
    id,
    type: "folder",
    name,
    slug: id,
    orderIndex: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    parentId: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const CUSTOM_SCHEMA: MetadataSchema = {
  groups: [
    {
      id: "group-a",
      label: "Group A",
      fields: [
        { key: "field-one", label: "Field One", type: "text" },
        { key: "field-two", label: "Field Two", type: "number" },
      ],
    },
    {
      id: "group-b",
      label: "Group B",
      fields: [
        {
          key: "genre",
          label: "Genre",
          type: "select",
          options: ["Fantasy", "Sci-Fi"],
        },
      ],
    },
  ],
};

function setup(schema?: MetadataSchema) {
  const testStore = makeStore();
  testStore.dispatch(
    setProject({
      id: "proj-1",
      rootPath: "/projects/proj-1",
      metadataSchema: schema ?? CUSTOM_SCHEMA,
    }),
  );
  testStore.dispatch(setSelectedProjectId("proj-1"));

  const onClose = vi.fn();
  render(
    <Provider store={testStore}>
      <Dialog open onOpenChange={() => undefined}>
        <SchemaManager onClose={onClose} />
      </Dialog>
    </Provider>,
  );
  return { testStore, onClose };
}

function mockFetchOk(returnedSchema: MetadataSchema) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ schema: returnedSchema }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("SchemaManager — rendering", () => {
  it("renders all group labels", () => {
    setup();
    expect(screen.getByText("Group A")).toBeInTheDocument();
    expect(screen.getByText("Group B")).toBeInTheDocument();
  });

  it("renders all field labels", () => {
    setup();
    expect(screen.getByText("Field One")).toBeInTheDocument();
    expect(screen.getByText("Field Two")).toBeInTheDocument();
    expect(screen.getByText("Genre")).toBeInTheDocument();
  });

  it("renders a type badge for each field", () => {
    setup();
    expect(screen.getAllByText("Text").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Number").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Select").length).toBeGreaterThan(0);
  });

  it("renders options textarea for select fields", () => {
    setup();
    const textarea = screen.getByLabelText(
      "Options for Genre",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe("Fantasy\nSci-Fi");
  });

  it("shows empty-group message when schema has no groups", () => {
    setup({ groups: [] });
    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();
  });

  it("shows the Add Group button", () => {
    setup();
    expect(screen.getByLabelText("Add schema group")).toBeInTheDocument();
  });

  it("shows an Add field button for each group", () => {
    setup();
    expect(screen.getByLabelText("Add field to Group A")).toBeInTheDocument();
    expect(screen.getByLabelText("Add field to Group B")).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByLabelText("Close schema manager"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Locked fields
// ---------------------------------------------------------------------------

describe("SchemaManager — locked fields", () => {
  it("locked fields have no delete button", () => {
    setup(DEFAULT_METADATA_SCHEMA);
    // synopsis is a locked built-in field — no delete button should exist for it
    expect(screen.queryByLabelText("Delete Synopsis")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete Notes")).not.toBeInTheDocument();
  });

  it("locked fields show a built-in badge", () => {
    setup(DEFAULT_METADATA_SCHEMA);
    const badges = screen.getAllByText("built-in");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("locked groups have no delete button", () => {
    setup(DEFAULT_METADATA_SCHEMA);
    // builtin-document group has locked fields → no delete button
    expect(
      screen.queryByLabelText("Delete Document group"),
    ).not.toBeInTheDocument();
  });

  it("custom groups (no locked fields) show a delete button", () => {
    setup();
    expect(screen.getByLabelText("Delete Group A group")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete Group B group")).toBeInTheDocument();
  });

  it("unlocked fields show a delete button", () => {
    setup();
    expect(screen.getByLabelText("Remove Field One")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Field Two")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete field
// ---------------------------------------------------------------------------

describe("SchemaManager — delete field", () => {
  it("clicking delete on a field opens the deprecate-or-clear dialog", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Remove Field One"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Remove field: Field One/i)).toBeInTheDocument();
  });

  it("cancelling the dialog closes it without dispatching", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Remove Field One"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirming clear dispatches clearMetadataField", async () => {
    const updatedSchema: MetadataSchema = {
      groups: [
        {
          id: "group-a",
          label: "Group A",
          fields: [{ key: "field-two", label: "Field Two", type: "number" }],
        },
        CUSTOM_SCHEMA.groups[1],
      ],
    };
    const fetchSpy = mockFetchOk(updatedSchema);

    setup();
    fireEvent.click(screen.getByLabelText("Remove Field One"));
    // Select "clear" option then confirm
    fireEvent.click(screen.getByRole("radio", { name: /clear/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"clear-field"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "clear-field"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.fieldKey).toBe("field-one");
    expect(body.groupId).toBe("group-a");
  });
});

// ---------------------------------------------------------------------------
// Delete group
// ---------------------------------------------------------------------------

describe("SchemaManager — delete group", () => {
  it("clicking delete on a group opens a confirmation dialog", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Delete Group A group"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete group "group a"\?/i)).toBeInTheDocument();
  });

  it("confirming group delete dispatches removeMetadataGroup", async () => {
    const updatedSchema: MetadataSchema = { groups: [CUSTOM_SCHEMA.groups[1]] };
    const fetchSpy = mockFetchOk(updatedSchema);

    setup();
    fireEvent.click(screen.getByLabelText("Delete Group A group"));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"remove-group"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "remove-group"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.groupId).toBe("group-a");
  });
});

// ---------------------------------------------------------------------------
// Move up / down (fields)
// ---------------------------------------------------------------------------

describe("SchemaManager — reorder fields", () => {
  it("dispatches reorderMetadataFields when move-up is clicked", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    // Field Two is at index 1 — clicking move-up swaps it to index 0
    fireEvent.click(screen.getByLabelText("Move Field Two up"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"reorder-fields"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "reorder-fields"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.newKeyOrder).toEqual(["field-two", "field-one"]);
    expect(body.groupId).toBe("group-a");
  });

  it("first field move-up button is disabled", () => {
    setup();
    const btn = screen.getByLabelText("Move Field One up") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("last field move-down button is disabled", () => {
    setup();
    const btn = screen.getByLabelText(
      "Move Field Two down",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Move up / down (groups)
// ---------------------------------------------------------------------------

describe("SchemaManager — reorder groups", () => {
  it("dispatches reorderMetadataGroups when group move-down is clicked", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Move Group A group down"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"reorder-groups"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "reorder-groups"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.newGroupIdOrder).toEqual(["group-b", "group-a"]);
  });

  it("first group move-up button is disabled", () => {
    setup();
    const btn = screen.getByLabelText(
      "Move Group A group up",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("last group move-down button is disabled", () => {
    setup();
    const btn = screen.getByLabelText(
      "Move Group B group down",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inline label rename
// ---------------------------------------------------------------------------

describe("SchemaManager — inline label rename", () => {
  it("clicking a non-locked field label enters edit mode", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Rename Field One"));
    expect(
      screen.getByLabelText("Edit label for field-one"),
    ).toBeInTheDocument();
  });

  it("committing a label edit dispatches renameMetadataField", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Rename Field One"));
    const input = screen.getByLabelText("Edit label for field-one");
    fireEvent.change(input, { target: { value: "Renamed Field" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"rename-field"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-field"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.fieldKey).toBe("field-one");
    expect(body.newLabel).toBe("Renamed Field");
  });

  it("pressing Enter commits the label edit", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Rename Field One"));
    const input = screen.getByLabelText("Edit label for field-one");
    fireEvent.change(input, { target: { value: "Via Enter" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"rename-field"'),
        }),
      );
    });
  });

  it("pressing Escape cancels without dispatching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup();

    fireEvent.click(screen.getByLabelText("Rename Field One"));
    const input = screen.getByLabelText("Edit label for field-one");
    fireEvent.change(input, { target: { value: "Should Not Save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // Input should unmount
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Edit label for field-one"),
      ).not.toBeInTheDocument();
    });

    // fetch should not have been called with rename-field
    const renameCalls = fetchSpy.mock.calls.filter(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-field"
        );
      } catch {
        return false;
      }
    });
    expect(renameCalls).toHaveLength(0);
  });

  it("empty label after trim does not dispatch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup();

    fireEvent.click(screen.getByLabelText("Rename Field One"));
    const input = screen.getByLabelText("Edit label for field-one");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Edit label for field-one"),
      ).not.toBeInTheDocument();
    });

    const renameCalls = fetchSpy.mock.calls.filter(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-field"
        );
      } catch {
        return false;
      }
    });
    expect(renameCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Add Group
// ---------------------------------------------------------------------------

describe("SchemaManager — add group", () => {
  it("clicking Add Group dispatches addMetadataGroup", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Add schema group"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"add-group"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "add-group"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.group.label).toBe("New Group");
    expect(body.group.id).toMatch(/^group-\d+$/);
    expect(body.group.fields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Add field within group
// ---------------------------------------------------------------------------

describe("SchemaManager — add field in group", () => {
  it("clicking 'Add field' within a group dispatches addMetadataField", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Add field to Group A"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"add-field"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "add-field"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.groupId).toBe("group-a");
    expect(body.field.type).toBe("text");
    expect(body.field.key).toMatch(/^field-\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Options editing
// ---------------------------------------------------------------------------

describe("SchemaManager — options editing", () => {
  it("dispatches updateMetadataFieldOptions on textarea blur", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    const textarea = screen.getByLabelText("Options for Genre");
    fireEvent.change(textarea, {
      target: { value: "Fantasy\nSci-Fi\nHorror" },
    });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"update-field-options"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "update-field-options"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.fieldKey).toBe("genre");
    expect(body.options).toEqual(["Fantasy", "Sci-Fi", "Horror"]);
  });
});

// ---------------------------------------------------------------------------
// Field key rename
// ---------------------------------------------------------------------------

describe("SchemaManager — field key rename", () => {
  it("renders the field key as a slug below the label", () => {
    setup();
    expect(screen.getByText("field-one")).toBeInTheDocument();
    expect(screen.getByText("field-two")).toBeInTheDocument();
  });

  it("non-locked fields show a 'rename key' button", () => {
    setup();
    expect(
      screen.getByLabelText("Rename key of Field One"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Rename key of Field Two"),
    ).toBeInTheDocument();
  });

  it("locked fields do not show a 'rename key' button", () => {
    setup(DEFAULT_METADATA_SCHEMA);
    expect(
      screen.queryByLabelText("Rename key of Synopsis"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Rename key of Notes"),
    ).not.toBeInTheDocument();
  });

  it("clicking rename key enters key edit mode", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    expect(screen.getByLabelText("Edit key for field-one")).toBeInTheDocument();
  });

  it("entering an invalid slug shows an error", async () => {
    setup();
    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    fireEvent.change(input, { target: { value: "INVALID KEY!" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.getByText(/lowercase letters, numbers, and hyphens/i),
      ).toBeInTheDocument();
    });
  });

  it("a valid slug opens the confirm dialog", async () => {
    setup();
    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    fireEvent.change(input, { target: { value: "new-key" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByText(/rename key "field-one" to "new-key"/i),
      ).toBeInTheDocument();
    });
  });

  it("cancelling the confirm dialog does not dispatch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup();

    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    fireEvent.change(input, { target: { value: "new-key" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const renameKeyCalls = fetchSpy.mock.calls.filter(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-key"
        );
      } catch {
        return false;
      }
    });
    expect(renameKeyCalls).toHaveLength(0);
  });

  it("confirming dispatches renameMetadataFieldKey with correct payload", async () => {
    const fetchSpy = mockFetchOk(CUSTOM_SCHEMA);
    setup();

    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    fireEvent.change(input, { target: { value: "new-key" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"rename-key"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-key"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.fieldKey).toBe("field-one");
    expect(body.newKey).toBe("new-key");
    expect(body.groupId).toBe("group-a");
  });

  it("pressing Escape cancels key edit without opening confirm dialog", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup();

    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    fireEvent.change(input, { target: { value: "new-key" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Edit key for field-one"),
      ).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const renameKeyCalls = fetchSpy.mock.calls.filter(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "rename-key"
        );
      } catch {
        return false;
      }
    });
    expect(renameKeyCalls).toHaveLength(0);
  });

  it("unchanged key (same as original) closes edit mode without dialog", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup();

    fireEvent.click(screen.getByLabelText("Rename key of Field One"));
    const input = screen.getByLabelText("Edit key for field-one");
    // value starts as "field-one" — press Enter without changing
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Edit key for field-one"),
      ).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// multi-resource-ref in field-type dropdown (Task 8)
// ---------------------------------------------------------------------------

describe("SchemaManager — multi-resource-ref field type", () => {
  it("field-type dropdown includes 'Multi Ref' as an option", () => {
    setup();
    const select = screen.getByLabelText(
      "Field type for Field One",
    ) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain("Multi Ref");
  });

  it("selecting multi-resource-ref opens migration preview and applies on confirm", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = typeof url === "string" ? url : (url as Request).url;
      if (urlStr.includes("fieldKey=")) {
        // GET: fetchFieldValues — return empty value list
        return new Response(JSON.stringify({ values: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // POST: schema mutation — return schema unchanged
      return new Response(JSON.stringify({ schema: CUSTOM_SCHEMA }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    setup();

    const select = screen.getByLabelText(
      "Field type for Field One",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "multi-resource-ref" } });

    // Migration preview should open
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply migration/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply migration/i }));

    await waitFor(() => {
      const postCall = (
        vi.mocked(globalThis.fetch) as ReturnType<typeof vi.spyOn>
      ).mock.calls.find(([, init]: [unknown, unknown]) => {
        try {
          return (
            JSON.parse((init as RequestInit).body as string).action ===
            "change-field-type-with-migration"
          );
        } catch {
          return false;
        }
      });
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.fieldKey).toBe("field-one");
      expect(body.newType).toBe("multi-resource-ref");
    });
  });
});

// ---------------------------------------------------------------------------
// Folder picker + Include Subfolders checkbox (Task 9)
// ---------------------------------------------------------------------------

const MULTI_REF_SCHEMA: MetadataSchema = {
  groups: [
    {
      id: "group-a",
      label: "Group A",
      fields: [
        { key: "refs-field", label: "Refs", type: "multi-resource-ref" },
      ],
    },
  ],
};

const MULTI_REF_SCHEMA_WITH_FOLDER: MetadataSchema = {
  groups: [
    {
      id: "group-a",
      label: "Group A",
      fields: [
        {
          key: "refs-field",
          label: "Refs",
          type: "multi-resource-ref",
          refFolder: "folder-1",
          includeSubfolders: false,
        },
      ],
    },
  ],
};

function setupWithFolders(schema: MetadataSchema, folders: Folder[] = []) {
  const testStore = makeStore();
  testStore.dispatch(
    setProject({
      id: "proj-1",
      rootPath: "/projects/proj-1",
      metadataSchema: schema,
    }),
  );
  testStore.dispatch(setSelectedProjectId("proj-1"));
  testStore.dispatch(setFolders(folders));
  const onClose = vi.fn();
  render(
    <Provider store={testStore}>
      <Dialog open onOpenChange={() => undefined}>
        <SchemaManager onClose={onClose} />
      </Dialog>
    </Provider>,
  );
  return { testStore, onClose };
}

describe("SchemaManager — folder picker (Task 9)", () => {
  it("folder picker appears for multi-resource-ref fields", () => {
    setupWithFolders(MULTI_REF_SCHEMA);
    expect(screen.getByLabelText("Ref folder for Refs")).toBeInTheDocument();
  });

  it("folder picker is populated with folders from state", () => {
    const folders = [
      makeFolder("folder-1", "Chapter 1"),
      makeFolder("folder-2", "Chapter 2"),
    ];
    setupWithFolders(MULTI_REF_SCHEMA, folders);
    // The picker is a Popover trigger; open it to reveal the folder tree.
    fireEvent.click(screen.getByLabelText("Ref folder for Refs"));
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();
  });

  it("folder picker shows 'Any folder' as the no-selection option", () => {
    setupWithFolders(MULTI_REF_SCHEMA);
    // With no refFolder set, the trigger label reads "Any folder".
    expect(screen.getByText("Any folder")).toBeInTheDocument();
  });

  it("selecting a folder dispatches updateMetadataRefProperties", async () => {
    const folders = [makeFolder("folder-1", "Chapter 1")];
    const fetchSpy = mockFetchOk(MULTI_REF_SCHEMA);
    setupWithFolders(MULTI_REF_SCHEMA, folders);

    fireEvent.click(screen.getByLabelText("Ref folder for Refs"));
    fireEvent.click(screen.getByText("Chapter 1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/project/metadata-schema",
        expect.objectContaining({
          body: expect.stringContaining('"action":"update-ref-properties"'),
        }),
      );
    });

    const call = fetchSpy.mock.calls.find(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "update-ref-properties"
        );
      } catch {
        return false;
      }
    });
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.fieldKey).toBe("refs-field");
    expect(body.refFolder).toBe("folder-1");
  });

  it("clearing the folder also clears includeSubfolders", async () => {
    const folders = [makeFolder("folder-1", "Chapter 1")];
    const fetchSpy = mockFetchOk(MULTI_REF_SCHEMA_WITH_FOLDER);
    setupWithFolders(MULTI_REF_SCHEMA_WITH_FOLDER, folders);

    // refFolder is set, so the trigger shows "Chapter 1"; open it and pick
    // the "Any folder" root option to clear the selection.
    fireEvent.click(screen.getByLabelText("Ref folder for Refs"));
    fireEvent.click(screen.getByText("Any folder"));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([, init]) => {
        try {
          return (
            JSON.parse((init as RequestInit).body as string).action ===
            "update-ref-properties"
          );
        } catch {
          return false;
        }
      });
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.refFolder).toBeNull();
      expect(body.includeSubfolders).toBeNull();
    });
  });

  it("Include Subfolders checkbox is hidden when refFolder is not set", () => {
    setupWithFolders(MULTI_REF_SCHEMA);
    expect(
      screen.queryByLabelText("Include subfolders for Refs"),
    ).not.toBeInTheDocument();
  });

  it("Include Subfolders checkbox appears when refFolder is set", () => {
    const folders = [makeFolder("folder-1", "Chapter 1")];
    setupWithFolders(MULTI_REF_SCHEMA_WITH_FOLDER, folders);
    expect(
      screen.getByLabelText("Include subfolders for Refs"),
    ).toBeInTheDocument();
  });

  it("toggling Include Subfolders dispatches updateMetadataRefProperties", async () => {
    const folders = [makeFolder("folder-1", "Chapter 1")];
    const fetchSpy = mockFetchOk(MULTI_REF_SCHEMA_WITH_FOLDER);
    setupWithFolders(MULTI_REF_SCHEMA_WITH_FOLDER, folders);

    const checkbox = screen.getByLabelText(
      "Include subfolders for Refs",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([, init]) => {
        try {
          return (
            JSON.parse((init as RequestInit).body as string).action ===
            "update-ref-properties"
          );
        } catch {
          return false;
        }
      });
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.fieldKey).toBe("refs-field");
      expect(body.includeSubfolders).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// maxSelections number input (Task 10)
// ---------------------------------------------------------------------------

describe("SchemaManager — maxSelections input (Task 10)", () => {
  it("Max selections input appears for multi-resource-ref fields", () => {
    setupWithFolders(MULTI_REF_SCHEMA);
    expect(
      screen.getByLabelText("Max selections for Refs"),
    ).toBeInTheDocument();
  });

  it("Max selections input shows existing maxSelections value", () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: "group-a",
          label: "Group A",
          fields: [
            {
              key: "refs-field",
              label: "Refs",
              type: "multi-resource-ref",
              maxSelections: 3,
            },
          ],
        },
      ],
    };
    setupWithFolders(schema);
    const input = screen.getByLabelText(
      "Max selections for Refs",
    ) as HTMLInputElement;
    expect(input.value).toBe("3");
  });

  it("entering a positive integer and blurring dispatches updateMetadataRefProperties", async () => {
    const fetchSpy = mockFetchOk(MULTI_REF_SCHEMA);
    setupWithFolders(MULTI_REF_SCHEMA);

    const input = screen.getByLabelText("Max selections for Refs");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([, init]) => {
        try {
          return (
            JSON.parse((init as RequestInit).body as string).action ===
            "update-ref-properties"
          );
        } catch {
          return false;
        }
      });
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.fieldKey).toBe("refs-field");
      expect(body.maxSelections).toBe(5);
    });
  });

  it("clearing the input dispatches with maxSelections: null", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: "group-a",
          label: "Group A",
          fields: [
            {
              key: "refs-field",
              label: "Refs",
              type: "multi-resource-ref",
              maxSelections: 3,
            },
          ],
        },
      ],
    };
    const fetchSpy = mockFetchOk(schema);
    setupWithFolders(schema);

    const input = screen.getByLabelText("Max selections for Refs");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([, init]) => {
        try {
          return (
            JSON.parse((init as RequestInit).body as string).action ===
            "update-ref-properties"
          );
        } catch {
          return false;
        }
      });
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.maxSelections).toBeNull();
    });
  });

  it("entering 0 does not dispatch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setupWithFolders(MULTI_REF_SCHEMA);

    const input = screen.getByLabelText("Max selections for Refs");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    await new Promise((r) => setTimeout(r, 50));
    const refPropCalls = fetchSpy.mock.calls.filter(([, init]) => {
      try {
        return (
          JSON.parse((init as RequestInit).body as string).action ===
          "update-ref-properties"
        );
      } catch {
        return false;
      }
    });
    expect(refPropCalls).toHaveLength(0);
  });
});
