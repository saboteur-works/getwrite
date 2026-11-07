import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import SourceAttachmentsSection from "../components/Sidebar/SourceAttachmentsSection";
import TrashRefreshProvider, {
  useTrashRefresh,
} from "../components/Layout/TrashRefreshContext";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createSourceResource } from "../src/lib/models/resource-factory";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";

const listAttachments = vi.fn();
const addAttachment = vi.fn();
const replaceAttachment = vi.fn();
const removeAttachment = vi.fn();
const reorderAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: (...a: unknown[]) => addAttachment(...a),
  replaceAttachment: (...a: unknown[]) => replaceAttachment(...a),
  removeAttachment: (...a: unknown[]) => removeAttachment(...a),
  reorderAttachments: (...a: unknown[]) => reorderAttachments(...a),
}));

const SOURCE = createSourceResource({ name: "Interview" });

function entry(id: string, originalName: string): AttachmentEntryView {
  return {
    id,
    fileName: `${id}.pdf`,
    originalName,
    mime: "application/pdf",
    size: 2048,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

const A = entry("a1", "alpha.pdf");
const B = entry("b2", "beta.pdf");
const C = entry("c3", "gamma.pdf");

/** Stands in for TrashView's post-restore `notifyTrashRestored()` call. */
function RestoreSignal(): JSX.Element {
  const { notifyTrashRestored } = useTrashRefresh();
  return (
    <button type="button" onClick={notifyTrashRestored}>
      Simulate Trash restore
    </button>
  );
}

function mount(): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test" }));
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <RestoreSignal />
        <SourceAttachmentsSection resource={SOURCE} />
      </TrashRefreshProvider>
    </Provider>,
  );
}

function names(): string[] {
  return screen
    .getAllByRole("listitem")
    .map(
      (li: HTMLElement) =>
        li.querySelector("[data-attachment-name]")?.textContent ?? "",
    );
}

function file(name = "new.pdf"): File {
  return new File(["x"], name, { type: "application/pdf" });
}

const STORED = ["alpha.pdf", "beta.pdf", "gamma.pdf"];

beforeEach(() => {
  for (const fn of [
    listAttachments,
    addAttachment,
    replaceAttachment,
    removeAttachment,
    reorderAttachments,
  ]) {
    fn.mockReset();
  }
  listAttachments.mockResolvedValue([A, B, C]);
});

describe("SourceAttachmentsSection", () => {
  it("lists the attachments in stored order with no preview or playback", async () => {
    const { container } = mount();
    await screen.findByText("alpha.pdf");
    expect(names()).toEqual(STORED);
    expect(listAttachments).toHaveBeenCalledWith("test", SOURCE.id);
    expect(
      container.querySelector("img, audio, video, iframe, embed, object"),
    ).toBeNull();
    expect(container.querySelector("a[href]")).toBeNull();
  });

  it("re-reads the list after a Trash restore without reselecting the Source", async () => {
    listAttachments.mockResolvedValueOnce([A]);
    mount();
    await screen.findByText("alpha.pdf");
    removeAttachment.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha.pdf" }));
    expect(await screen.findByText("No attachments.")).toBeInTheDocument();

    // The restore puts the attachment back on disk; the list is re-read.
    listAttachments.mockResolvedValueOnce([A]);
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate Trash restore" }),
    );
    expect(await screen.findByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.queryByText("No attachments.")).toBeNull();
  });

  it("shows a failed read with Retry, never an empty list", async () => {
    listAttachments.mockRejectedValueOnce(new Error("read failed"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("read failed");
    expect(screen.queryByText("No attachments.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("alpha.pdf")).toBeInTheDocument();
  });

  it("says so when the Source has no attachments", async () => {
    listAttachments.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("No attachments.")).toBeInTheDocument();
  });

  it("add calls the client and appends the entry", async () => {
    addAttachment.mockResolvedValue(entry("d4", "delta.pdf"));
    mount();
    await screen.findByText("alpha.pdf");
    const f = file("delta.pdf");
    fireEvent.change(screen.getByLabelText("Add attachment file"), {
      target: { files: [f] },
    });
    await waitFor(() => expect(names()).toEqual([...STORED, "delta.pdf"]));
    expect(addAttachment).toHaveBeenCalledWith("test", SOURCE.id, f);
  });

  it("replace calls the client and swaps the entry in place", async () => {
    replaceAttachment.mockResolvedValue({
      trashId: "t1",
      entry: entry("b2", "beta-v2.pdf"),
    });
    mount();
    await screen.findByText("alpha.pdf");
    const f = file("beta-v2.pdf");
    fireEvent.change(screen.getByLabelText("Replace file for beta.pdf"), {
      target: { files: [f] },
    });
    await waitFor(() =>
      expect(names()).toEqual(["alpha.pdf", "beta-v2.pdf", "gamma.pdf"]),
    );
    expect(replaceAttachment).toHaveBeenCalledWith("test", SOURCE.id, "b2", f);
  });

  it("remove calls the client, drops the entry and points to Trash", async () => {
    removeAttachment.mockResolvedValue({ trashId: "t2" });
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Remove beta.pdf" }));
    await waitFor(() => expect(names()).toEqual(["alpha.pdf", "gamma.pdf"]));
    expect(removeAttachment).toHaveBeenCalledWith("test", SOURCE.id, "b2");
    expect(screen.getByRole("status")).toHaveTextContent("Trash");
  });

  it("reorder by Move down calls the client with the full new order", async () => {
    reorderAttachments.mockResolvedValue([B, A, C]);
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.click(
      screen.getByRole("button", { name: "Move alpha.pdf down" }),
    );
    await waitFor(() =>
      expect(names()).toEqual(["beta.pdf", "alpha.pdf", "gamma.pdf"]),
    );
    expect(reorderAttachments).toHaveBeenCalledWith("test", SOURCE.id, [
      "b2",
      "a1",
      "c3",
    ]);
  });

  it("reorder is operable by keyboard alone", async () => {
    reorderAttachments.mockResolvedValue([A, C, B]);
    mount();
    await screen.findByText("alpha.pdf");
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Move beta.pdf down" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(names()).toEqual(["alpha.pdf", "gamma.pdf", "beta.pdf"]),
    );
    expect(reorderAttachments).toHaveBeenCalledWith("test", SOURCE.id, [
      "a1",
      "c3",
      "b2",
    ]);
    // Focus is not lost to <body> after the move.
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("status")).toHaveTextContent("beta.pdf");
  });

  it("the first Move up and last Move down do nothing", async () => {
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Move alpha.pdf up" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Move gamma.pdf down" }),
    );
    expect(reorderAttachments).not.toHaveBeenCalled();
  });

  it.each([
    "Video files are not supported as attachments.",
    "A Source holds at most 500 attachments.",
    "The Source was not found.",
  ])("a refused add shows %s and leaves the list unchanged", async (msg) => {
    addAttachment.mockRejectedValue(new Error(msg));
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.change(screen.getByLabelText("Add attachment file"), {
      target: { files: [file()] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(names()).toEqual(STORED);
  });

  it("a refused replace shows its message and leaves the list unchanged", async () => {
    replaceAttachment.mockRejectedValue(new Error("Unsupported file type."));
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.change(screen.getByLabelText("Replace file for alpha.pdf"), {
      target: { files: [file()] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unsupported file type.",
    );
    expect(names()).toEqual(STORED);
  });

  it("a refused remove shows its message and leaves the list unchanged", async () => {
    removeAttachment.mockRejectedValue(new Error("Attachment not found."));
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Attachment not found.",
    );
    expect(names()).toEqual(STORED);
  });

  it("a refused reorder shows its message and keeps the stored order", async () => {
    reorderAttachments.mockRejectedValue(new Error("Reorder refused."));
    mount();
    await screen.findByText("alpha.pdf");
    fireEvent.click(
      screen.getByRole("button", { name: "Move alpha.pdf down" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reorder refused.",
    );
    expect(names()).toEqual(STORED);
  });

  it("every button has an accessible name and no red is used", async () => {
    const { container } = mount();
    await screen.findByText("alpha.pdf");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
    expect(container.innerHTML).not.toMatch(/red|#D44040/i);
  });
});
