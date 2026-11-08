import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import AttachmentMedia from "../components/Sources/AttachmentMedia";
import SourceAttachmentsPanel from "../components/Sources/SourceAttachmentsPanel";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createSourceResource } from "../src/lib/models/resource-factory";
import { ProjectLockedError } from "../src/lib/models/locked-access";
import type { AttachmentBytesView } from "../src/lib/api/source-attachment-bytes";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";

const readAttachmentBytes = vi.fn();
vi.mock("../src/lib/api/source-attachment-bytes", () => ({
  readAttachmentBytes: (...a: unknown[]) => readAttachmentBytes(...a),
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

function entry(id: string, name: string, mime: string): AttachmentEntryView {
  return {
    id,
    fileName: `${id}.bin`,
    originalName: name,
    mime,
    size: 2048,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

function view(kind: "image" | "audio"): AttachmentBytesView {
  const mime = kind === "image" ? "image/png" : "audio/mpeg";
  return { kind, mime, size: 3, bytes: new Uint8Array([1, 2, 3]) };
}

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

beforeEach(() => {
  readAttachmentBytes.mockReset();
  listAttachments.mockReset();
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  let n = 0;
  createObjectURL.mockImplementation(() => `blob:mock-${++n}`);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
});
afterEach(() => {
  // Drop the stubs so the environment's own URL statics are back.
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

function media(id = "a1", name = "photo.png"): JSX.Element {
  return (
    <AttachmentMedia
      projectId="p"
      resourceId={SOURCE.id}
      attachmentId={id}
      name={name}
    />
  );
}

describe("AttachmentMedia", () => {
  it("renders an image through <img> with an accessible name", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    render(media());
    const img = await screen.findByRole("img", { name: "photo.png" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "blob:mock-1");
    expect(readAttachmentBytes).toHaveBeenCalledWith("p", SOURCE.id, "a1");
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
  });

  it("plays audio through native <audio controls> with an accessible name", async () => {
    readAttachmentBytes.mockResolvedValue(view("audio"));
    const { container } = render(media("b2", "talk.mp3"));
    await waitFor(() =>
      expect(container.querySelector("audio")).not.toBeNull(),
    );
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio).toHaveAttribute("controls");
    expect(audio).toHaveAttribute("aria-label", "Audio: talk.mp3");
    expect(audio).toHaveAttribute("src", "blob:mock-1");
  });

  it("shows the kind the client reports, never the name's", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    const { container } = render(media("c3", "misnamed.mp3"));
    await screen.findByRole("img", { name: "misnamed.mp3" });
    expect(container.querySelector("audio")).toBeNull();
  });

  it("revokes the object URL on unmount", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    const { unmount } = render(media());
    await screen.findByRole("img");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("revokes the previous URL when the attachment changes", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    const { rerender } = render(media("a1"));
    await screen.findByRole("img");
    rerender(media("a2", "other.png"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute("src", "blob:mock-2"),
    );
  });

  it("creates no URL for a read that resolves after unmount", async () => {
    let resolve: (v: AttachmentBytesView) => void = () => {};
    readAttachmentBytes.mockReturnValue(
      new Promise<AttachmentBytesView>((r) => {
        resolve = r;
      }),
    );
    const { unmount } = render(media());
    unmount();
    resolve(view("image"));
    await Promise.resolve();
    await Promise.resolve();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("shows a read failure as an alert, not an empty attachment", async () => {
    readAttachmentBytes.mockRejectedValue(new Error("The file is gone."));
    render(media());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The file is gone.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a locked project as locked", async () => {
    readAttachmentBytes.mockRejectedValue(new ProjectLockedError("p"));
    render(media());
    expect(await screen.findByRole("alert")).toHaveTextContent(/locked/i);
  });

  it("says so when the platform cannot create object URLs", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    readAttachmentBytes.mockResolvedValue(view("image"));
    render(media());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /can't show or play/i,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("says so when the media element errors", async () => {
    readAttachmentBytes.mockResolvedValue(view("audio"));
    const { container } = render(media("b2", "talk.mp3"));
    await waitFor(() =>
      expect(container.querySelector("audio")).not.toBeNull(),
    );
    fireEvent.error(container.querySelector("audio") as HTMLAudioElement);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't be played/i,
    );
  });
});

function mountPanel(): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test" }));
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <SourceAttachmentsPanel resource={SOURCE} />
      </TrashRefreshProvider>
    </Provider>,
  );
}

describe("SourceAttachmentsPanel preview", () => {
  beforeEach(() => {
    listAttachments.mockResolvedValue([
      entry("a1", "photo.png", "image/png"),
      entry("b2", "talk.mp3", "audio/mpeg"),
      entry("c3", "doc.pdf", "application/pdf"),
    ]);
  });

  it("reads no bytes on opening; a preview is read on request only", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    mountPanel();
    await screen.findByText("photo.png");
    expect(readAttachmentBytes).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Preview photo.png" }));
    await screen.findByRole("img", { name: "photo.png" });
    expect(readAttachmentBytes).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Hide photo.png" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("offers preview for image and audio rows only, and adds no limited control", async () => {
    mountPanel();
    await screen.findByText("photo.png");
    const items = screen.getAllByRole("listitem");
    const labels = (li: HTMLElement): string[] =>
      Array.from(li.querySelectorAll("button")).map(
        (b) => b.getAttribute("aria-label") ?? "",
      );
    expect(labels(items[0])).toEqual([
      "Move photo.png up",
      "Move photo.png down",
      "Replace photo.png",
      "Remove photo.png",
      "Preview photo.png",
    ]);
    expect(labels(items[1])).toContain("Preview talk.mp3");
    expect(labels(items[2])).not.toContain("Preview doc.pdf");
  });

  it("preview button is keyboard operable", async () => {
    readAttachmentBytes.mockResolvedValue(view("audio"));
    const { container } = mountPanel();
    await screen.findByText("talk.mp3");
    const button = screen.getByRole("button", { name: "Preview talk.mp3" });
    button.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(container.querySelector("audio")).not.toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Hide talk.mp3" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
