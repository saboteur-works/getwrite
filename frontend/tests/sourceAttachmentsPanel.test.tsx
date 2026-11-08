/**
 * Feature 103 Task 20 (FR-3 attachments slot, FR-17): one attachments panel
 * with one list-reading hook, mounted both through the sidebar section and
 * through the Sources view's slot. A stateful fake of the attachments client
 * stands in for the storage, with a trash list, so add, replace, remove,
 * reorder and a Trash restore are exercised end to end in the UI. The core
 * rules (image and audio only, no revision, Trash and restore) are covered by
 * tests/unit/source-attachments-core.test.ts and tests/unit/trash-attachments.test.ts.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Provider } from "react-redux";
import SourceAttachmentsPanel from "../components/Sources/SourceAttachmentsPanel";
import SourceAttachmentsSection from "../components/Sidebar/SourceAttachmentsSection";
import SourcesView from "../components/Sources/SourcesView";
import { uiModuleRegistry } from "../components/Modules/uiRegistry";
import TrashRefreshProvider, {
  useTrashRefresh,
} from "../components/Layout/TrashRefreshContext";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import { createSourceResource } from "../src/lib/models/resource-factory";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";

function entry(id: string, originalName: string): AttachmentEntryView {
  return {
    id,
    fileName: `${id}.png`,
    originalName,
    mime: "image/png",
    size: 2048,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

/** Per-Source stored lists and the Trash, shared by every fake call. */
const stored = new Map<string, AttachmentEntryView[]>();
let trash: Array<{ sourceId: string; entry: AttachmentEntryView }> = [];
let nextId = 1;

const listAttachments = vi.fn(
  async (_p: string, sourceId: string): Promise<AttachmentEntryView[]> => [
    ...(stored.get(sourceId) ?? []),
  ],
);
const addAttachment = vi.fn(
  async (_p: string, sourceId: string, file: File) => {
    if (!/^(image|audio)\//.test(file.type)) {
      throw new Error("Only image and audio files can be attached.");
    }
    const added = entry(`n${nextId++}`, file.name);
    stored.set(sourceId, [...(stored.get(sourceId) ?? []), added]);
    return added;
  },
);
const replaceAttachment = vi.fn(
  async (_p: string, sourceId: string, id: string, file: File) => {
    const list = stored.get(sourceId) ?? [];
    const old = list.find((e) => e.id === id);
    if (!old) throw new Error("Attachment not found.");
    const next = entry(`n${nextId++}`, file.name);
    stored.set(
      sourceId,
      list.map((e) => (e.id === id ? next : e)),
    );
    trash.push({ sourceId, entry: old });
    return { trashId: `t${trash.length}`, entry: next };
  },
);
const removeAttachment = vi.fn(
  async (_p: string, sourceId: string, id: string) => {
    const list = stored.get(sourceId) ?? [];
    const old = list.find((e) => e.id === id);
    if (!old) throw new Error("Attachment not found.");
    stored.set(
      sourceId,
      list.filter((e) => e.id !== id),
    );
    trash.push({ sourceId, entry: old });
    return { trashId: `t${trash.length}` };
  },
);
const reorderAttachments = vi.fn(
  async (_p: string, sourceId: string, orderedIds: string[]) => {
    const list = stored.get(sourceId) ?? [];
    const ordered = orderedIds.map((id) => list.find((e) => e.id === id)!);
    stored.set(sourceId, ordered);
    return ordered;
  },
);
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: [string, string]) => listAttachments(...a),
  addAttachment: (...a: [string, string, File]) => addAttachment(...a),
  replaceAttachment: (...a: [string, string, string, File]) =>
    replaceAttachment(...a),
  removeAttachment: (...a: [string, string, string]) => removeAttachment(...a),
  reorderAttachments: (...a: [string, string, string[]]) =>
    reorderAttachments(...a),
}));

const SOURCE = createSourceResource({ name: "Interview" });
const OTHER = createSourceResource({ name: "Letters" });

/** Stands in for the Trash tab: restore puts the file back, then signals. */
function RestoreControl(): JSX.Element {
  const { notifyTrashRestored } = useTrashRefresh();
  return (
    <button
      type="button"
      onClick={() => {
        const item = trash.pop();
        if (item) {
          stored.set(item.sourceId, [
            ...(stored.get(item.sourceId) ?? []),
            item.entry,
          ]);
        }
        notifyTrashRestored();
      }}
    >
      Restore last from Trash
    </button>
  );
}

function makeLoadedStore() {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([SOURCE, OTHER]));
  return store;
}

function namesIn(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("listitem")
    .map(
      (li: HTMLElement) =>
        li.querySelector("[data-attachment-name]")?.textContent ?? "",
    );
}

function png(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** The view (through the registry slot) and the sidebar, over one store. */
function mountBoth() {
  const store = makeLoadedStore();
  const slot = uiModuleRegistry.getAttachmentsSection("sources");
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <RestoreControl />
        <div data-testid="view">{slot?.render({ resource: SOURCE })}</div>
        <div data-testid="sidebar">
          <SourceAttachmentsSection resource={SOURCE} />
        </div>
      </TrashRefreshProvider>
    </Provider>,
  );
}

beforeEach(() => {
  stored.clear();
  trash = [];
  nextId = 1;
  stored.set(SOURCE.id, [entry("a1", "alpha.png"), entry("b2", "beta.png")]);
  stored.set(OTHER.id, [entry("z9", "zeta.png")]);
  for (const fn of [
    listAttachments,
    addAttachment,
    replaceAttachment,
    removeAttachment,
    reorderAttachments,
  ]) {
    fn.mockClear();
  }
});

describe("one attachments panel, shared by the view slot and the sidebar", () => {
  it("the sidebar section is the same component as the panel", () => {
    expect(SourceAttachmentsSection).toBe(SourceAttachmentsPanel);
  });

  it("the Sources module registers an attachments slot that renders the panel", async () => {
    const slot = uiModuleRegistry.getAttachmentsSection("sources");
    expect(slot).toBeDefined();
    render(
      <Provider store={makeLoadedStore()}>
        <TrashRefreshProvider>
          {slot?.render({ resource: SOURCE })}
        </TrashRefreshProvider>
      </Provider>,
    );
    expect(await screen.findByText("alpha.png")).toBeInTheDocument();
    expect(uiModuleRegistry.getAttachmentsSection("missing")).toBeUndefined();
  });

  it("an add in the view shows in the sidebar without reselecting", async () => {
    mountBoth();
    const view = screen.getByTestId("view");
    const sidebar = screen.getByTestId("sidebar");
    await within(view).findByText("alpha.png");
    await within(sidebar).findByText("alpha.png");
    fireEvent.change(within(view).getByLabelText("Add attachment file"), {
      target: { files: [png("gamma.png")] },
    });
    await within(view).findByText("gamma.png");
    expect(namesIn(sidebar)).toEqual(["alpha.png", "beta.png", "gamma.png"]);
  });

  it("a remove in the sidebar shows in the view, and a Trash restore brings it back in both", async () => {
    mountBoth();
    const view = screen.getByTestId("view");
    const sidebar = screen.getByTestId("sidebar");
    await within(view).findByText("alpha.png");
    await within(sidebar).findByText("alpha.png");
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Remove alpha.png" }),
    );
    await within(sidebar).findByText(/Restore it from the Trash/);
    expect(namesIn(view)).toEqual(["beta.png"]);
    expect(trash.map((t) => t.entry.originalName)).toEqual(["alpha.png"]);
    fireEvent.click(
      screen.getByRole("button", { name: "Restore last from Trash" }),
    );
    await within(view).findByText("alpha.png");
    expect(namesIn(view)).toEqual(["beta.png", "alpha.png"]);
    expect(namesIn(sidebar)).toEqual(["beta.png", "alpha.png"]);
  });

  it("a replace in the view shows in the sidebar and the old file is in Trash", async () => {
    mountBoth();
    const view = screen.getByTestId("view");
    const sidebar = screen.getByTestId("sidebar");
    await within(view).findByText("alpha.png");
    await within(sidebar).findByText("alpha.png");
    fireEvent.change(
      within(view).getByLabelText("Replace file for alpha.png"),
      { target: { files: [png("alpha-v2.png")] } },
    );
    await within(sidebar).findByText("alpha-v2.png");
    expect(namesIn(sidebar)).toEqual(["alpha-v2.png", "beta.png"]);
    expect(trash.map((t) => t.entry.originalName)).toEqual(["alpha.png"]);
  });

  it("a reorder in the sidebar shows in the view", async () => {
    mountBoth();
    const view = screen.getByTestId("view");
    const sidebar = screen.getByTestId("sidebar");
    await within(view).findByText("alpha.png");
    await within(sidebar).findByText("alpha.png");
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Move alpha.png down" }),
    );
    await within(sidebar).findByText(/Moved alpha\.png to position 2/);
    expect(namesIn(view)).toEqual(["beta.png", "alpha.png"]);
    expect(reorderAttachments).toHaveBeenCalledWith("test", SOURCE.id, [
      "b2",
      "a1",
    ]);
  });

  it("a refused add (not image or audio) shows its message in the panel it was made in and leaves both lists", async () => {
    mountBoth();
    const view = screen.getByTestId("view");
    const sidebar = screen.getByTestId("sidebar");
    await within(view).findByText("alpha.png");
    await within(sidebar).findByText("alpha.png");
    fireEvent.change(within(view).getByLabelText("Add attachment file"), {
      target: {
        files: [new File(["x"], "doc.pdf", { type: "application/pdf" })],
      },
    });
    expect(await within(view).findByRole("alert")).toHaveTextContent(
      "Only image and audio",
    );
    expect(namesIn(view)).toEqual(["alpha.png", "beta.png"]);
    expect(namesIn(sidebar)).toEqual(["alpha.png", "beta.png"]);
  });

  it("holds no shared list once every panel is unmounted: a remount reads again", async () => {
    const first = mountBoth();
    await within(screen.getByTestId("view")).findByText("alpha.png");
    first.unmount();
    stored.set(SOURCE.id, [entry("c3", "changed-elsewhere.png")]);
    mountBoth();
    expect(
      await within(screen.getByTestId("view")).findByText(
        "changed-elsewhere.png",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("alpha.png")).toBeNull();
  });
});

describe("the Sources view offers the panel for a Source", () => {
  it("shows a Source's attachments section on request, for that Source only", async () => {
    const slot = uiModuleRegistry.getAttachmentsSection("sources");
    render(
      <Provider store={makeLoadedStore()}>
        <TrashRefreshProvider>
          <SourcesView
            renderAttachments={(resource) => slot?.render({ resource })}
          />
        </TrashRefreshProvider>
      </Provider>,
    );
    await screen.findByRole("button", { name: "Interview" });
    const toggle = screen.getByRole("button", {
      name: "Show attachments of Interview",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByRole("list", { name: "Attachments" }),
    ).toBeInTheDocument();
    expect(screen.getByText("beta.png")).toBeInTheDocument();
    expect(screen.queryByText("zeta.png")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Attachments" })).toBeNull();
  });
});
