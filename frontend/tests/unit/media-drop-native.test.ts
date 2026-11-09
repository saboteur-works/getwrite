// @vitest-environment jsdom
/**
 * Feature 105 Task 8: the drop path on native. A real TipTap editor in jsdom
 * with `MediaDropExtension` and `GetWriteImage` (node view on native). The
 * upload is mocked and the cache reads are fakes. The existing node-environment
 * `tests/media-drop-extension.test.ts` keeps covering `handleMediaDropFiles`
 * unchanged; it cannot host a jsdom editor, hence this file. jsdom is not
 * evidence for the Android WebView (Task 13 is the device run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Slice } from "@tiptap/pm/model";
import GetWriteImage, {
  resolveGetWriteImageSrc,
} from "../../components/Editor/Extensions/GetWriteImage";
import MediaDropExtension, {
  handleMediaDropFiles,
} from "../../components/Editor/Extensions/MediaDropExtension";
import {
  createResourceBlobCache,
  type ResourceBlobCacheDeps,
} from "../../src/lib/resource-blob-cache";
import type { ResourceBytes } from "../../src/lib/api/resource-bytes";

const mockUpload = vi.fn();
vi.mock("../../src/lib/api/resources", () => ({
  uploadMediaResource: (...args: unknown[]) => mockUpload(...args),
}));

const PROJECT = "aaaaaaaa-1111-4111-8111-111111111111";
const RES = "bbbbbbbb-2222-4222-8222-222222222222";
const WEB_URL = `/api/resource/${RES}/file?projectId=${encodeURIComponent(PROJECT)}`;
const BYTES = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: "image/png",
  kind: "image",
} as ResourceBytes;

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const PLACEHOLDER = ".editor-image-picker-thumb-placeholder";

interface PendingRead {
  resolve(value: ResourceBytes): void;
  reject(error: unknown): void;
}

function setup() {
  const reads: PendingRead[] = [];
  const created: string[] = [];
  const deps: ResourceBlobCacheDeps = {
    read: () =>
      new Promise<ResourceBytes>((resolve, reject) => {
        reads.push({ resolve, reject });
      }),
    createObjectUrl: () => {
      const url = `blob:fake-${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: () => {},
  };
  const errors: string[] = [];
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      GetWriteImage.configure({
        getProjectId: () => PROJECT,
        blobCache: createResourceBlobCache(deps),
      }),
      MediaDropExtension.configure({
        getProjectId: () => PROJECT,
        onError: (m) => errors.push(m),
      }),
    ],
    content: "<p>x</p>",
  });
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);
  return { editor, reads, created, errors };
}

function drop(editor: Editor, file: File): void {
  const event = {
    dataTransfer: { files: [file] },
    clientX: 0,
    clientY: 0,
    preventDefault: () => {},
  } as unknown as DragEvent;
  const isHandled = editor.view.someProp("handleDrop", (f) =>
    f(editor.view, event, Slice.empty, false),
  );
  expect(isHandled).toBe(true);
}

const png = (): File => new File(["x"], "photo.png", { type: "image/png" });
let editor: Editor | null = null;

beforeEach(() => {
  mockUpload.mockReset();
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
});
afterEach(() => {
  if (editor && !editor.isDestroyed) editor.destroy();
  editor = null;
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
});

describe("handleMediaDropFiles on native", () => {
  it("calls onInsert with the web serving URL, never a blob URL", async () => {
    mockUpload.mockResolvedValue({ resource: { id: RES } });
    const onInsert = vi.fn();
    await handleMediaDropFiles([png()], PROJECT, vi.fn(), onInsert);
    expect(onInsert).toHaveBeenCalledWith(
      RES,
      resolveGetWriteImageSrc(RES, null, PROJECT),
    );
    expect(onInsert.mock.calls[0][1]).toBe(WEB_URL);
    expect(onInsert.mock.calls[0][1]).not.toContain("blob:");
  });
});

describe("MediaDropExtension insert on native", () => {
  it("stores the web URL and resourceId and renders through the node view", async () => {
    mockUpload.mockResolvedValue({ resource: { id: RES } });
    const s = setup();
    editor = s.editor;
    drop(editor, png());
    await flush();

    const node = editor.getJSON().content?.find((n) => n.type === "image");
    expect(node?.attrs?.src).toBe(WEB_URL);
    expect(node?.attrs?.resourceId).toBe(RES);
    expect(JSON.stringify(editor.getJSON())).not.toContain("blob:");

    expect(editor.view.dom.querySelector("img")).toBeNull();
    expect(editor.view.dom.querySelector(PLACEHOLDER)).not.toBeNull();
    s.reads[0].resolve(BYTES);
    await flush();
    expect(editor.view.dom.querySelector("img")?.getAttribute("src")).toBe(
      "blob:fake-1",
    );
    expect(JSON.stringify(editor.getJSON())).not.toContain("blob:");
  });

  it("shows the placeholder when the read of the inserted node is refused", async () => {
    mockUpload.mockResolvedValue({ resource: { id: RES } });
    const s = setup();
    editor = s.editor;
    drop(editor, png());
    await flush();
    const refusal = new Error("This file is 31.0 MB. Too large.");
    refusal.name = "ResourceBytesTooLargeError";
    s.reads[0].reject(refusal);
    await flush();

    const box = editor.view.dom.querySelector(PLACEHOLDER);
    expect(box?.textContent).toContain("This file is 31.0 MB. Too large.");
    expect(box?.getAttribute("role")).toBe("alert");
    expect(editor.view.dom.querySelector("img")).toBeNull();
  });

  it("a refusal at the upload inserts no node and reports through onError", async () => {
    mockUpload.mockRejectedValue(new Error("Too large for upload"));
    const s = setup();
    editor = s.editor;
    drop(editor, png());
    await flush();

    expect(editor.getJSON().content?.some((n) => n.type === "image")).toBe(
      false,
    );
    expect(s.reads).toHaveLength(0);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toContain("Too large for upload");
  });
});

describe("MediaDropExtension insert on web", () => {
  it("inserts the same node and renders it through renderHTML", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    mockUpload.mockResolvedValue({ resource: { id: RES } });
    const s = setup();
    editor = s.editor;
    drop(editor, png());
    await flush();

    const node = editor.getJSON().content?.find((n) => n.type === "image");
    expect(node?.attrs?.src).toBe(WEB_URL);
    expect(node?.attrs?.resourceId).toBe(RES);
    expect(editor.view.dom.querySelector("img")?.getAttribute("src")).toBe(
      WEB_URL,
    );
    expect(editor.view.dom.querySelector(PLACEHOLDER)).toBeNull();
    expect(s.reads).toHaveLength(0);
  });
});
