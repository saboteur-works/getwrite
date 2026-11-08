/**
 * Feature 103 Task 29 (FR-19, FR-21, FR-22, FR-31): the excerpts interface in
 * the Sources view. A text excerpt is marked from the live Source editor
 * (`activeEditorRegistry`); an image or audio attachment gets a locator-only
 * excerpt. Failure and success are visible text, a delete goes through the
 * annotation delete path and is disabled with a reason on a limited paired
 * device. A new, narrowly named file so it does not collide with the Sources
 * view tests.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { Editor } from "@tiptap/core";
import SourcesView from "../components/Sources/SourcesView";
import ExcerptsSection from "../components/Sources/ExcerptsSection";
import LocatorField, {
  EMPTY_LOCATOR_DRAFT,
  locatorFromDraft,
  type LocatorDraft,
} from "../components/Sources/LocatorField";
import { StaticSharingLimitsProvider } from "../components/Sharing/SharingLimitsContext";
import { PERMANENT_DELETION_LIMITED_REASON } from "../components/Sharing/sharing-copy";
import {
  setActiveEditor,
  setActiveEditorResourceId,
} from "../components/Editor/activeEditorRegistry";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import { createSourceResource } from "../src/lib/models/resource-factory";
import type { Annotation } from "../src/lib/models/types";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";
import { makeEditor } from "./helpers/annotations-panel-harness";

const listAnnotations = vi.fn();
const addAnnotation = vi.fn();
const deleteAnnotation = vi.fn();
vi.mock("../src/lib/api/annotations", () => ({
  listAnnotations: (...a: unknown[]) => listAnnotations(...a),
  addAnnotation: (...a: unknown[]) => addAnnotation(...a),
  deleteAnnotation: (...a: unknown[]) => deleteAnnotation(...a),
}));

const listAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: vi.fn(),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

const SOURCE = createSourceResource({ name: "Interview" });

function attachment(
  id: string,
  originalName: string,
  mime: string,
): AttachmentEntryView {
  return {
    id,
    fileName: `${id}`,
    originalName,
    mime,
    size: 10,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

const IMAGE = attachment(
  "11111111-1111-4111-8111-111111111111",
  "scan.png",
  "image/png",
);
const PDF = attachment(
  "22222222-2222-4222-8222-222222222222",
  "notes.pdf",
  "application/pdf",
);

function stored(partial: Partial<Annotation> & { id: string }): Annotation {
  return { body: "", quote: "", createdAt: "t", updatedAt: "t", ...partial };
}

const TEXT_EXCERPT = stored({
  id: "e1",
  quote: "hello",
  body: "the greeting",
  target: { sourceId: SOURCE.id, locator: { type: "page", value: "12" } },
});
const ATTACHMENT_EXCERPT = stored({
  id: "e2",
  target: {
    sourceId: SOURCE.id,
    attachmentId: IMAGE.id,
    locator: { type: "timestamp", value: "01:02" },
  },
});
const PLAIN_NOTE = stored({ id: "n1", quote: "world", body: "plain note" });
const OTHER_CITATION = stored({
  id: "c1",
  quote: "x",
  body: "cites another",
  target: { sourceId: "33333333-3333-4333-8333-333333333333" },
});

let editor: Editor | null = null;

function useEditorFor(resourceId: string): Editor {
  editor = makeEditor();
  setActiveEditor(editor);
  setActiveEditorResourceId(resourceId);
  return editor;
}

function mountSection(
  limits?: React.ComponentProps<typeof StaticSharingLimitsProvider>["value"],
) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([SOURCE]));
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <StaticSharingLimitsProvider value={limits}>
          <ExcerptsSection resource={SOURCE} />
        </StaticSharingLimitsProvider>
      </TrashRefreshProvider>
    </Provider>,
  );
}

beforeEach(() => {
  listAnnotations.mockReset();
  addAnnotation.mockReset();
  deleteAnnotation.mockReset();
  listAttachments.mockReset();
  listAnnotations.mockResolvedValue([
    TEXT_EXCERPT,
    ATTACHMENT_EXCERPT,
    PLAIN_NOTE,
    OTHER_CITATION,
  ]);
  listAttachments.mockResolvedValue([IMAGE, PDF]);
});

afterEach(() => {
  editor?.destroy();
  editor = null;
  setActiveEditor(null);
  setActiveEditorResourceId(null);
});

describe("LocatorField", () => {
  it("offers an optional type of page, timestamp, paragraph or line and a free-text value", async () => {
    const onChange = vi.fn();
    render(
      <LocatorField
        idPrefix="t"
        legend="Locator"
        draft={EMPTY_LOCATOR_DRAFT}
        onChange={onChange}
      />,
    );
    const type = screen.getByRole("combobox", { name: "Locator type" });
    expect(
      within(type)
        .getAllByRole("option")
        .map((o: HTMLElement) => o.textContent),
    ).toEqual(["No type", "Page", "Timestamp", "Paragraph", "Line"]);
    await userEvent.selectOptions(type, "timestamp");
    expect(onChange).toHaveBeenLastCalledWith({ type: "timestamp", value: "" });
    await userEvent.type(
      screen.getByRole("textbox", { name: "Locator value" }),
      "p",
    );
    expect(onChange).toHaveBeenLastCalledWith({ type: "", value: "p" });
  });

  it("locatorFromDraft: empty value is no locator; a value keeps its optional type", () => {
    const draft = (d: Partial<LocatorDraft>): LocatorDraft => ({
      ...EMPTY_LOCATOR_DRAFT,
      ...d,
    });
    expect(locatorFromDraft(draft({}))).toEqual({ ok: true, locator: null });
    expect(locatorFromDraft(draft({ value: "  " }))).toEqual({
      ok: true,
      locator: null,
    });
    expect(locatorFromDraft(draft({ value: " 12 " }))).toEqual({
      ok: true,
      locator: { value: "12" },
    });
    expect(locatorFromDraft(draft({ type: "page", value: "12" }))).toEqual({
      ok: true,
      locator: { type: "page", value: "12" },
    });
    const typeOnly = locatorFromDraft(draft({ type: "line" }));
    expect(typeOnly.ok).toBe(false);
  });
});

describe("ExcerptsSection list", () => {
  it("lists only this Source's excerpts, with locator and attachment", async () => {
    mountSection();
    const list = await screen.findByRole("list", { name: "Excerpts" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("hello");
    expect(items[0]).toHaveTextContent("Page 12");
    expect(items[0]).toHaveTextContent("the greeting");
    expect(items[1]).toHaveTextContent("scan.png");
    expect(items[1]).toHaveTextContent("Timestamp 01:02");
    expect(screen.queryByText("plain note")).toBeNull();
    expect(screen.queryByText("cites another")).toBeNull();
    expect(listAnnotations).toHaveBeenCalledWith("p", SOURCE.id);
  });

  it("says there are none when the read succeeded with no excerpts", async () => {
    listAnnotations.mockResolvedValue([PLAIN_NOTE]);
    mountSection();
    expect(await screen.findByText("No excerpts yet.")).toBeInTheDocument();
  });

  it("a failed read is an alert with Retry, never 'No excerpts yet.'", async () => {
    listAnnotations.mockRejectedValueOnce(new Error("disk unreadable"));
    mountSection();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error:");
    expect(alert).toHaveTextContent("disk unreadable");
    expect(screen.queryByText("No excerpts yet.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Excerpts" })).toBeVisible();
  });
});

describe("ExcerptsSection text excerpt", () => {
  it("marks the selected text with a typed locator and shows the result", async () => {
    const ed = useEditorFor(SOURCE.id);
    ed.commands.setTextSelection({ from: 7, to: 12 }); // "world"
    const selected = ed.state.doc.textBetween(7, 12, "\n");
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: Record<string, unknown>) =>
        stored({
          id: a.id as string,
          quote: a.quote as string,
          body: a.body as string,
          target: a.target as Annotation["target"],
        }),
    );
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Text excerpt locator type" }),
      "page",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Text excerpt locator value" }),
      "47",
    );
    await user.click(
      screen.getByRole("button", { name: "Mark selected text as excerpt" }),
    );
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    const [projectId, resourceId, sent] = addAnnotation.mock.calls[0] as [
      string,
      string,
      { quote: string; target: unknown },
    ];
    expect(projectId).toBe("p");
    expect(resourceId).toBe(SOURCE.id);
    expect(sent.quote).toBe(selected);
    expect(sent.target).toEqual({
      sourceId: SOURCE.id,
      sourceName: SOURCE.name,
      locator: { type: "page", value: "47" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Marked the excerpt.",
    );
    const items = within(
      screen.getByRole("list", { name: "Excerpts" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent("Page 47");
  });

  it("a write failure is shown as an error, adds no mark and lists nothing new", async () => {
    const ed = useEditorFor(SOURCE.id);
    ed.commands.setTextSelection({ from: 1, to: 3 });
    addAnnotation.mockRejectedValue(new Error("could not save"));
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    await userEvent.click(
      screen.getByRole("button", { name: "Mark selected text as excerpt" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error: could not save");
    expect(
      within(screen.getByRole("list", { name: "Excerpts" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
  });

  it("with no selection, says to select text and writes nothing", async () => {
    useEditorFor(SOURCE.id);
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    await userEvent.click(
      screen.getByRole("button", { name: "Mark selected text as excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: Select some text",
    );
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("with another resource open in the editor, says to open this Source and writes nothing", async () => {
    const ed = useEditorFor("some-other-resource");
    ed.commands.setTextSelection({ from: 1, to: 3 });
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    await userEvent.click(
      screen.getByRole("button", { name: "Mark selected text as excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Open this Source in the editor",
    );
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("a locator type with no value is refused with a message and writes nothing", async () => {
    const ed = useEditorFor(SOURCE.id);
    ed.commands.setTextSelection({ from: 1, to: 3 });
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Text excerpt locator type" }),
      "line",
    );
    await user.click(
      screen.getByRole("button", { name: "Mark selected text as excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter where it sits",
    );
    expect(addAnnotation).not.toHaveBeenCalled();
  });
});

describe("ExcerptsSection attachment excerpt", () => {
  it("records a locator-only excerpt of an image attachment", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: Record<string, unknown>) =>
        stored({
          id: a.id as string,
          target: a.target as Annotation["target"],
        }),
    );
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    const user = userEvent.setup();
    const pick = await screen.findByRole("combobox", {
      name: "Attachment to excerpt",
    });
    // The PDF is neither image nor audio, so it is not offered.
    expect(
      within(pick)
        .getAllByRole("option")
        .map((o: HTMLElement) => o.textContent),
    ).toEqual(["scan.png"]);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Attachment excerpt locator type" }),
      "timestamp",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Attachment excerpt locator value" }),
      "00:42",
    );
    await user.click(
      screen.getByRole("button", { name: "Record attachment excerpt" }),
    );
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    const [, resourceId, sent] = addAnnotation.mock.calls[0] as [
      string,
      string,
      { body: string; quote: string; target: unknown },
    ];
    expect(resourceId).toBe(SOURCE.id);
    expect(sent.body).toBe("");
    expect(sent.quote).toBe("");
    expect(sent.target).toEqual({
      sourceId: SOURCE.id,
      attachmentId: IMAGE.id,
      sourceName: SOURCE.name,
      locator: { type: "timestamp", value: "00:42" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Recorded the excerpt of scan.png.",
    );
  });

  it("needs a locator value: refuses with a message and writes nothing", async () => {
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Record attachment excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: Enter where it sits",
    );
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("a write failure is shown as an error", async () => {
    addAnnotation.mockRejectedValue(new Error("refused"));
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", {
        name: "Attachment excerpt locator value",
      }),
      "3",
    );
    await user.click(
      screen.getByRole("button", { name: "Record attachment excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: refused",
    );
  });

  it("with no image or audio attachment, says so and offers no record control", async () => {
    listAttachments.mockResolvedValue([PDF]);
    mountSection();
    await screen.findByRole("list", { name: "Excerpts" });
    expect(
      await screen.findByText(
        "Add an image or audio attachment to record an excerpt of it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record attachment excerpt" }),
    ).toBeNull();
  });
});

describe("ExcerptsSection delete", () => {
  it("confirms, deletes through the annotation delete path and drops the item", async () => {
    deleteAnnotation.mockResolvedValue(undefined);
    mountSection();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete excerpt hello" }),
    );
    expect(deleteAnnotation).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", { name: "Delete excerpt" }),
    );
    await waitFor(() =>
      expect(deleteAnnotation).toHaveBeenCalledWith("p", SOURCE.id, "e1"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Delete excerpt hello" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Deleted the excerpt.",
    );
  });

  it("a refused delete is an error and keeps the excerpt listed", async () => {
    deleteAnnotation.mockRejectedValue(new Error("not allowed here"));
    mountSection();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Delete excerpt hello" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Delete excerpt" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: not allowed here",
    );
    expect(
      screen.getByRole("button", { name: "Delete excerpt hello" }),
    ).toBeInTheDocument();
  });

  it("is disabled with a visible reason on a limited paired device", async () => {
    mountSection({
      state: {
        state: "paired",
        limits: {
          projectDeletion: false,
          unlocking: false,
          locking: false,
          encryptionChanges: false,
          permanentDeletion: true,
        },
      },
    });
    const button = await screen.findByRole("button", {
      name: "Delete excerpt hello",
    });
    expect(button).toBeDisabled();
    const reasonId = button.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(reasonId)).toHaveTextContent(
      PERMANENT_DELETION_LIMITED_REASON,
    );
  });

  it("is enabled on a paired device whose permanent-deletion limit is off", async () => {
    mountSection({
      state: {
        state: "paired",
        limits: {
          projectDeletion: true,
          unlocking: true,
          locking: true,
          encryptionChanges: true,
          permanentDeletion: false,
        },
      },
    });
    expect(
      await screen.findByRole("button", { name: "Delete excerpt hello" }),
    ).toBeEnabled();
  });
});

describe("SourcesView excerpts toggle", () => {
  it("opens the excerpts section of one Source and keeps the controls keyboard reachable", async () => {
    const store = makeStore();
    store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([SOURCE]));
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <StaticSharingLimitsProvider>
            <SourcesView />
          </StaticSharingLimitsProvider>
        </TrashRefreshProvider>
      </Provider>,
    );
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", {
      name: "Show excerpts of Interview",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAccessibleName("Hide excerpts of Interview");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    ) as HTMLElement;
    expect(
      await within(region).findByRole("list", { name: "Excerpts" }),
    ).toBeVisible();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("list", { name: "Excerpts" })).toBeNull();
  });
});
