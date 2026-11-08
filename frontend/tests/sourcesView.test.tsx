/**
 * Feature 103 Task 12: the project-scope Sources view. The list comes from the
 * resources slice plus the existing attachments list read; a failed read is a
 * failure state, never an empty project.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import SourcesView from "../components/Sources/SourcesView";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../src/lib/models/resource-factory";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../src/lib/models/locked-access";
import {
  AttachmentEntrySchema,
  SourceResourceSchema,
  TextResourceSchema,
} from "../src/lib/models/schemas";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";
import { runAxe } from "./a11y/helpers/axe";

const listAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
}));

const createResource = vi.fn();
const renameResource = vi.fn();
vi.mock("../src/lib/api/resources", () => ({
  createResource: (...a: unknown[]) => createResource(...a),
  renameResource: (...a: unknown[]) => renameResource(...a),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("../src/lib/toast-service", () => ({
  toastService: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const INTERVIEW = {
  ...createSourceResource({ name: "Interview" }),
  resourceSubtype: "Primary",
};
const LETTERS = createSourceResource({ name: "Letters" });
const CHAPTER = createTextResource({ name: "Chapter One" });

function entry(id: string): AttachmentEntryView {
  return {
    id,
    fileName: `${id}.pdf`,
    originalName: `${id}.pdf`,
    mime: "application/pdf",
    size: 10,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

function mount(
  resources: Parameters<typeof setResources>[0],
  onOpenSource?: (id: string) => void,
) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources(resources));
  const view = render(
    <Provider store={store}>
      <SourcesView onOpenSource={onOpenSource} />
    </Provider>,
  );
  return { store, ...view };
}

beforeEach(() => {
  createResource.mockReset();
  renameResource.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  listAttachments.mockReset();
  listAttachments.mockImplementation(async (_p: string, id: string) =>
    id === INTERVIEW.id ? [entry("a"), entry("b")] : [],
  );
});

describe("SourcesView list", () => {
  it("shows name, subtype and attachment count for every Source and no non-Source", async () => {
    mount([INTERVIEW, CHAPTER, LETTERS]);
    const rows = await screen.findAllByRole("row");
    // header + two Sources
    expect(rows).toHaveLength(3);
    const interview = within(
      screen.getByRole("button", { name: "Interview" }).closest("tr")!,
    );
    expect(interview.getByText("Primary")).toBeInTheDocument();
    expect(interview.getByText("2")).toBeInTheDocument();
    const letters = within(
      screen.getByRole("button", { name: "Letters" }).closest("tr")!,
    );
    expect(letters.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Chapter One")).toBeNull();
    expect(listAttachments).toHaveBeenCalledTimes(2);
    expect(listAttachments).not.toHaveBeenCalledWith("p", CHAPTER.id);
  });

  it("selecting a row selects that Source in the store and calls onOpenSource", async () => {
    const onOpenSource = vi.fn();
    const { store } = mount([INTERVIEW, LETTERS], onOpenSource);
    await userEvent.click(
      await screen.findByRole("button", { name: "Letters" }),
    );
    expect(store.getState().resources.selectedResourceId).toBe(LETTERS.id);
    expect(onOpenSource).toHaveBeenCalledWith(LETTERS.id);
  });
});

describe("SourcesView failure and empty states", () => {
  it("renders a failure, not an empty state, when a read throws", async () => {
    listAttachments.mockRejectedValue(new Error("disk unreadable"));
    mount([INTERVIEW, LETTERS]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("disk unreadable");
    expect(screen.queryByText(/no sources/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each([
    ["ProjectLockedError", () => new ProjectLockedError("p")],
    ["MissingProjectKeyError", () => new MissingProjectKeyError("p")],
  ])(
    "renders a locked failure for %s, not an empty project",
    async (_n, make) => {
      listAttachments.mockRejectedValue(make());
      mount([INTERVIEW]);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/locked/i);
      expect(screen.queryByText(/no sources/i)).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
    },
  );

  it.each([[401], [409]])(
    "shows the locked state, not the generic failure, when the list read returns HTTP %i over the HTTP client",
    async (status) => {
      const actual = await vi.importActual<
        typeof import("../src/lib/api/source-attachments")
      >("../src/lib/api/source-attachments");
      listAttachments.mockImplementation(actual.listAttachments);
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "server refusal text" }), {
            status,
          }),
        );
      try {
        mount([INTERVIEW]);
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(/locked/i);
        expect(alert).not.toHaveTextContent("server refusal text");
        expect(screen.queryByText(/no sources/i)).toBeNull();
        expect(screen.queryByRole("table")).toBeNull();
        expect(fetchSpy).toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it("shows an empty state, distinct from the failure, for a project with no Sources", async () => {
    mount([CHAPTER]);
    expect(
      await screen.findByText(/no sources in this project/i),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(listAttachments).not.toHaveBeenCalled();
  });

  it("retries the read from the failure state", async () => {
    listAttachments.mockRejectedValueOnce(new Error("boom"));
    mount([LETTERS]);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Letters" })).toBeVisible(),
    );
  });
});

describe("SourcesView create (Feature 103 Task 18, FR-16, FR-19)", () => {
  const CREATED = {
    id: "new-source",
    name: "Field notes",
    type: "source",
    folderId: null,
    orderIndex: 2,
  };

  async function createFromView(title: string) {
    await userEvent.click(
      await screen.findByRole("button", { name: "New Source" }),
    );
    await userEvent.type(screen.getByLabelText("Source name"), title);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
  }

  it("creates through createResource with the tree's payload, adds the Source and selects it", async () => {
    createResource.mockResolvedValue({ resource: CREATED });
    const { store } = mount([INTERVIEW, LETTERS]);
    await createFromView("Field notes");
    await waitFor(() => expect(createResource).toHaveBeenCalledTimes(1));
    const [projectId, payload] = createResource.mock.calls[0];
    expect(projectId).toBe("p");
    // The same payload shape page.tsx builds for the tree's create action.
    expect(payload).toEqual({
      name: "Field notes",
      folderId: null,
      type: "source",
      orderIndex:
        Math.max(INTERVIEW.orderIndex ?? 0, LETTERS.orderIndex ?? 0) + 1,
    });
    await waitFor(() =>
      expect(
        store
          .getState()
          .resources.resources.some((r: { id: string }) => r.id === CREATED.id),
      ).toBe(true),
    );
    expect(store.getState().resources.selectedResourceId).toBe(CREATED.id);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Resource created",
      "Field notes created",
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the create-time notice when the Source could not be left out of compile (5000-id cap)", async () => {
    createResource.mockResolvedValue({
      resource: CREATED,
      notice: "The Source was created, but it is not left out of compile.",
    });
    mount([LETTERS]);
    await createFromView("Field notes");
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      "Source not left out of compile",
      "The Source was created, but it is not left out of compile.",
      { id: "source-not-excluded-from-compile" },
    );
  });

  it("shows a failed create and adds nothing", async () => {
    createResource.mockRejectedValue(
      new Error("Nothing was added. Try again."),
    );
    const { store } = mount([LETTERS]);
    await createFromView("Field notes");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nothing was added. Try again.");
    expect(store.getState().resources.resources).toHaveLength(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows a locked failure as locked", async () => {
    createResource.mockRejectedValue(new ProjectLockedError("p"));
    mount([LETTERS]);
    await createFromView("Field notes");
    expect(await screen.findByRole("alert")).toHaveTextContent(/locked/i);
  });

  it("does not create with a blank name and says so", async () => {
    mount([LETTERS]);
    await userEvent.click(
      await screen.findByRole("button", { name: "New Source" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createResource).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
  });

  it("is keyboard operable: Enter submits and Escape cancels", async () => {
    createResource.mockResolvedValue({ resource: CREATED });
    mount([LETTERS]);
    const trigger = await screen.findByRole("button", { name: "New Source" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Field notes{Enter}");
    await waitFor(() => expect(createResource).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "New Source" }));
    expect(screen.getByLabelText("Source name")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Source name")).toBeNull();
    expect(createResource).toHaveBeenCalledTimes(1);
  });
});

describe("SourcesView rename (Feature 103 Task 18, FR-16, FR-19)", () => {
  async function renameFromView(rowName: string, next: string) {
    await userEvent.click(
      await screen.findByRole("button", { name: `Rename ${rowName}` }),
    );
    const input = screen.getByLabelText(`New name for ${rowName}`);
    await userEvent.clear(input);
    await userEvent.type(input, next);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  }

  it("renames through renameResource with the tree's arguments and updates the store", async () => {
    renameResource.mockResolvedValue(true);
    const { store } = mount([INTERVIEW, LETTERS]);
    await renameFromView("Letters", "Letters, 1921");
    await waitFor(() => expect(renameResource).toHaveBeenCalledTimes(1));
    // AppShell's handleRenameConfirm: (resourceId, directoryId, name, "resource").
    expect(renameResource).toHaveBeenCalledWith(
      LETTERS.id,
      "p",
      "Letters, 1921",
      "resource",
    );
    await waitFor(() =>
      expect(
        store
          .getState()
          .resources.resources.find((r: { id: string }) => r.id === LETTERS.id)
          ?.name,
      ).toBe("Letters, 1921"),
    );
    expect(
      await screen.findByRole("button", { name: "Letters, 1921" }),
    ).toBeVisible();
  });

  it("shows a refused rename and leaves the name unchanged", async () => {
    renameResource.mockResolvedValue(false);
    const { store } = mount([LETTERS]);
    await renameFromView("Letters", "Other");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be renamed/i,
    );
    expect(store.getState().resources.resources[0].name).toBe("Letters");
  });

  it("shows a thrown rename failure", async () => {
    renameResource.mockRejectedValue(new ProjectLockedError("p"));
    mount([LETTERS]);
    await renameFromView("Letters", "Other");
    expect(await screen.findByRole("alert")).toHaveTextContent(/locked/i);
  });

  it("is keyboard operable: Enter saves and Escape cancels", async () => {
    renameResource.mockResolvedValue(true);
    mount([LETTERS]);
    const trigger = await screen.findByRole("button", {
      name: "Rename Letters",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("New name for Letters")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Rename Letters" }),
      ).toHaveFocus(),
    );
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{End}{Backspace}{Backspace}x{Enter}");
    await waitFor(() =>
      expect(renameResource).toHaveBeenCalledWith(
        LETTERS.id,
        "p",
        "Lettex",
        "resource",
      ),
    );
  });
});

/** Names of interactive elements in `root` that offer a template action. */
function templateControlNames(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, a, [role='button'], [role='menuitem'], select, option, input",
    ),
  )
    .map(
      (el) =>
        el.getAttribute("aria-label") ??
        el.textContent ??
        el.getAttribute("value") ??
        "",
    )
    .filter((name) => /template/i.test(name));
}

const SOURCES_DIR = path.resolve(__dirname, "../components/Sources");
const SOURCES_VIEW_FILES = [
  "SourcesView.tsx",
  "SourcesViewControls.tsx",
  "useSourceList.ts",
];

// Feature 103 Task 24 (FR-20): characterization tests, no product change.
// They pass on the tree as it was before they were written; they pin what the
// Sources view must not offer or link.
describe("Sources view leaves Feature 102 unchanged (Task 24, FR-20)", () => {
  it("offers no control to create a template from a Source or a Source from a template", async () => {
    const { container } = mount([INTERVIEW, LETTERS]);
    await screen.findAllByRole("row");
    expect(templateControlNames(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "New Source" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Letters" }),
    );
    expect(templateControlNames(container)).toEqual([]);
  });

  it("the template-control scan flags a template control (not vacuous)", () => {
    const fixture = document.createElement("div");
    fixture.innerHTML =
      '<button>Save as template</button><button aria-label="New Source from template">New</button><button>Rename</button>';
    expect(templateControlNames(fixture)).toEqual([
      "Save as template",
      "New Source from template",
    ]);
  });

  it("creates a Source with no template reference in the payload", async () => {
    createResource.mockResolvedValue({
      resource: { id: "n", name: "N", type: "source", folderId: null },
    });
    mount([LETTERS]);
    await userEvent.click(
      await screen.findByRole("button", { name: "New Source" }),
    );
    await userEvent.type(screen.getByLabelText("Source name"), "N");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createResource).toHaveBeenCalledTimes(1));
    expect(Object.keys(createResource.mock.calls[0][1]).sort()).toEqual([
      "folderId",
      "name",
      "orderIndex",
      "type",
    ]);
  });

  it.each(SOURCES_VIEW_FILES)(
    "%s names no template API and no Source-to-entity link",
    (file) => {
      const text = readFileSync(path.join(SOURCES_DIR, file), "utf8");
      expect(text).not.toMatch(/template/i);
      expect(text).not.toMatch(
        /entityKind|entityId|updateSidecar|linkedEntity|setEntity|aliases/,
      );
    },
  );

  it("a Source has no entity-link key of its own: its schema's entity keys are a text resource's", () => {
    const entityKeys = (shape: Record<string, unknown>): string[] =>
      Object.keys(shape)
        .filter((key) => /entit|alias|link/i.test(key))
        .sort();
    expect(entityKeys(SourceResourceSchema.shape)).toEqual(
      entityKeys(TextResourceSchema.shape),
    );
    expect(entityKeys(AttachmentEntrySchema.shape)).toEqual([]);
    const refused = AttachmentEntrySchema.safeParse({
      ...entry("a"),
      id: "11111111-1111-4111-8111-111111111111",
      entityId: "22222222-2222-4222-8222-222222222222",
    });
    expect(refused.success).toBe(false);
  });
});

describe("a11y: SourcesView", () => {
  it.each(["list", "empty", "failure", "create-open", "rename-open"])(
    "has no axe violations (%s)",
    async (state) => {
      if (state === "failure") {
        listAttachments.mockRejectedValue(new Error("boom"));
      }
      const { container } = mount(
        state === "empty" ? [CHAPTER] : [INTERVIEW, LETTERS],
      );
      await waitFor(() =>
        expect(screen.queryByText(/loading sources/i)).toBeNull(),
      );
      if (state === "create-open") {
        await userEvent.click(
          screen.getByRole("button", { name: "New Source" }),
        );
      }
      if (state === "rename-open") {
        await userEvent.click(
          screen.getByRole("button", { name: "Rename Letters" }),
        );
      }
      await runAxe(container, ["region"]);
    },
  );
});
