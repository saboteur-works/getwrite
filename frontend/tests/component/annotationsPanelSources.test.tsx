/** @vitest-environment jsdom */
/**
 * Feature 103, Task 33 (FR-22 panel half, FR-25, FR-27): the annotations panel
 * shows citations with the name of their Source, treats a locator-only
 * excerpt (no mark by design) as normal, and shows a citation whose target is
 * missing as pointing at something missing, never hidden. A check that could
 * not be made is shown as that, not as "removed" and not as "present".
 */
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import {
  annotation,
  Harness,
  makeEditor,
  makeHandle,
} from "../helpers/annotations-panel-harness";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import type {
  Annotation,
  AnnotationTarget,
  AnyResource,
} from "../../src/lib/models/types";

const trashMock = vi.hoisted(() => ({ listTrash: vi.fn() }));
const attachmentsMock = vi.hoisted(() => ({ listAttachments: vi.fn() }));
const annotationsMock = vi.hoisted(() => ({ listAnnotations: vi.fn() }));
vi.mock("../../src/lib/api/trash", () => trashMock);
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: attachmentsMock.listAttachments,
}));
vi.mock("../../src/lib/api/annotations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/annotations")>()),
  listAnnotations: annotationsMock.listAnnotations,
}));

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const EXCERPT_ID = "33333333-3333-4333-8333-333333333333";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  vi.clearAllMocks();
});

function sourceResource(name: string): AnyResource {
  return {
    id: SOURCE_ID,
    slug: "s",
    name,
    type: "source",
    orderIndex: 0,
  } as AnyResource;
}

function cite(
  id: string,
  target: AnnotationTarget,
  extra: Partial<Annotation> = {},
): Annotation {
  return { ...annotation(id, "Cited", "hello"), target, ...extra };
}

function renderPanel(
  annotations: Annotation[],
  resources: AnyResource[],
  handle = makeHandle({ status: "ok", annotations }),
): ReturnType<typeof makeHandle> {
  const store = makeStore();
  store.dispatch(
    setProject({ id: "p1", name: "P", rootPath: "/tmp/projects/dir-1" }),
  );
  store.dispatch(setSelectedProjectId("p1"));
  store.dispatch(setResources(resources));
  const editor = makeEditor();
  editors.push(editor);
  render(
    <Provider store={store}>
      <Harness editor={editor} handle={handle} />
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return handle;
}

function row(id: string): HTMLElement {
  const items = screen.getAllByTestId("annotation-item");
  const found = items.find((i: HTMLElement) => i.dataset.annotationId === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

beforeEach(() => {
  trashMock.listTrash.mockResolvedValue({
    resources: [],
    folders: [],
    attachments: [],
  });
  attachmentsMock.listAttachments.mockResolvedValue([]);
  annotationsMock.listAnnotations.mockResolvedValue([]);
});

describe("citation rows (FR-25)", () => {
  it("shows the Source name saved at citing time, not the renamed current name", async () => {
    renderPanel(
      [cite("a", { sourceId: SOURCE_ID, sourceName: "Name at citing" })],
      [sourceResource("Renamed since")],
    );
    await waitFor(() => expect(row("a")).toHaveTextContent("Name at citing"));
    expect(row("a")).not.toHaveTextContent("Renamed since");
    expect(row("a")).not.toHaveTextContent(/removed/i);
  });

  it("shows the current Source name when the target saved none and the Source exists", async () => {
    renderPanel(
      [cite("a", { sourceId: SOURCE_ID })],
      [sourceResource("Current")],
    );
    await waitFor(() => expect(row("a")).toHaveTextContent("Current"));
  });
});

describe("locator-only excerpt (FR-22)", () => {
  const EXCERPT = annotation("x", "", "");
  const mark = {
    ...EXCERPT,
    target: {
      sourceId: SOURCE_ID,
      attachmentId: ATTACHMENT_ID,
      locator: { value: "0:42" },
    },
  };

  it("is listed as normal, not detached, with no Re-attach and no Show in text", async () => {
    attachmentsMock.listAttachments.mockResolvedValue([{ id: ATTACHMENT_ID }]);
    renderPanel([mark], [sourceResource("Tape")]);
    const item = row("x");
    expect(item).toHaveAttribute("data-detached", "false");
    expect(
      screen.queryByRole("list", { name: "Detached annotations" }),
    ).toBeNull();
    expect(
      within(item).queryByRole("button", { name: /re-attach/i }),
    ).toBeNull();
    expect(
      within(item).queryByRole("button", { name: "Show in text" }),
    ).toBeNull();
    expect(
      within(item).getByRole("button", { name: "Delete note" }),
    ).toBeEnabled();
    await waitFor(() => expect(item).toHaveTextContent("0:42"));
  });

  it("a citation with a quote and no mark is still detached with Re-attach", () => {
    renderPanel(
      [cite("d", { sourceId: SOURCE_ID }, { quote: "gone passage" })],
      [sourceResource("S")],
    );
    expect(row("d")).toHaveAttribute("data-detached", "true");
    expect(
      within(row("d")).getByRole("button", { name: /re-attach/i }),
    ).toBeInTheDocument();
  });
});

describe("missing target (FR-27)", () => {
  const target: AnnotationTarget = {
    sourceId: SOURCE_ID,
    attachmentId: ATTACHMENT_ID,
    excerptId: EXCERPT_ID,
    sourceName: "Saved name",
  };

  it("Source in Trash: shows the saved name, the Source as removed, row not hidden", async () => {
    trashMock.listTrash.mockResolvedValue({
      resources: [{ id: SOURCE_ID, originalName: "x", resourceType: "source" }],
      folders: [],
    });
    renderPanel([cite("a", target)], []);
    await waitFor(() => expect(row("a")).toHaveTextContent(/removed/i));
    expect(row("a")).toHaveTextContent("Saved name");
    expect(row("a")).toHaveTextContent(/in Trash/i);
  });

  it("Source purged: shows the saved name and the Source as removed", async () => {
    renderPanel([cite("a", target)], []);
    await waitFor(() => expect(row("a")).toHaveTextContent(/removed/i));
    expect(row("a")).toHaveTextContent("Saved name");
    expect(row("a")).toHaveTextContent(/permanently deleted/i);
  });

  it("attachment removed: shows the Source name and that the attachment was removed", async () => {
    attachmentsMock.listAttachments.mockResolvedValue([{ id: "other" }]);
    annotationsMock.listAnnotations.mockResolvedValue([
      annotation(EXCERPT_ID, "", "q"),
    ]);
    renderPanel([cite("a", target)], [sourceResource("Cur")]);
    await waitFor(() =>
      expect(row("a")).toHaveTextContent(/attachment .*removed/i),
    );
    expect(row("a")).toHaveTextContent("Saved name");
  });

  it("excerpt deleted: shows the Source name and that the excerpt was removed", async () => {
    attachmentsMock.listAttachments.mockResolvedValue([{ id: ATTACHMENT_ID }]);
    renderPanel([cite("a", target)], [sourceResource("Cur")]);
    await waitFor(() =>
      expect(row("a")).toHaveTextContent(/excerpt .*removed/i),
    );
    expect(row("a")).toHaveTextContent("Saved name");
  });

  it("a failed check is shown as not checked, never as removed or as present", async () => {
    trashMock.listTrash.mockRejectedValue(new Error("boom"));
    renderPanel([cite("a", target)], []);
    await waitFor(() =>
      expect(row("a")).toHaveTextContent(/could not be checked/i),
    );
    expect(row("a")).toHaveTextContent("Saved name");
    expect(row("a")).not.toHaveTextContent(/removed/i);
  });
});

describe("editing and deleting", () => {
  it("allows saving an empty body for an annotation with a target, not for a plain note", () => {
    renderPanel(
      [
        cite("a", { sourceId: SOURCE_ID }, { body: "x" }),
        annotation("ghost", "plain", "world"),
      ],
      [sourceResource("S")],
    );
    fireEvent.click(
      within(row("a")).getByRole("button", { name: "Edit note" }),
    );
    fireEvent.change(within(row("a")).getByLabelText("Note text"), {
      target: { value: "" },
    });
    expect(
      within(row("a")).getByRole("button", { name: "Save note" }),
    ).toBeEnabled();
    fireEvent.click(within(row("a")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      within(row("ghost")).getByRole("button", { name: "Edit note" }),
    );
    fireEvent.change(within(row("ghost")).getByLabelText("Note text"), {
      target: { value: "" },
    });
    expect(
      within(row("ghost")).getByRole("button", { name: "Save note" }),
    ).toBeDisabled();
  });

  it("deleting a citation goes through handle.remove", async () => {
    const handle = renderPanel(
      [cite("a", { sourceId: SOURCE_ID })],
      [sourceResource("S")],
    );
    fireEvent.click(
      within(row("a")).getByRole("button", { name: "Delete note" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete note", hidden: false }),
    );
    await waitFor(() => expect(handle.remove).toHaveBeenCalledWith("a"));
  });
});
