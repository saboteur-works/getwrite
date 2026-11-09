// @vitest-environment jsdom
/**
 * Feature 105 Task 10 (FR-14, OQ-4): on the native runtime the node view puts
 * a `blob:` URL on the rendered `img`, and that URL must never reach stored
 * content (`editor.getJSON()`) or Markdown. Real TipTap editors in jsdom with
 * an injected fake cache. Insert paths covered: initial content, the drop
 * (`MediaDropExtension`) and the real `ImagePickerSubmenu` mounted over the
 * same editor. Markdown goes through the repo's real serializer
 * (`documentToMarkdown`, `@tiptap/markdown`) and through `renderMarkdown`
 * directly. jsdom is not evidence for the Android WebView (Task 13).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Slice } from "@tiptap/pm/model";
import GetWriteImage, {
  resolveGetWriteImageSrc,
} from "../../components/Editor/Extensions/GetWriteImage";
import MediaDropExtension from "../../components/Editor/Extensions/MediaDropExtension";
import ImagePickerSubmenu from "../../components/Editor/MenuBar/ImagePickerSubmenu";
import projectsReducer, {
  type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import type { ImageResource } from "../../src/lib/models/types";
import {
  createResourceBlobCache,
  type ResourceBlobCacheDeps,
} from "../../src/lib/resource-blob-cache";
import type { ResourceBytes } from "../../src/lib/api/resource-bytes";
import { readResourceBytes } from "../../src/lib/api/resource-bytes";
import { documentToMarkdown } from "../../src/lib/export/markdown-serializer";

const mockUpload = vi.fn();
vi.mock("../../src/lib/api/resources", () => ({
  uploadMediaResource: (...args: unknown[]) => mockUpload(...args),
}));
vi.mock("../../src/lib/api/resource-bytes", () => ({
  readResourceBytes: vi.fn(),
}));

const PROJECT = "aaaaaaaa-1111-4111-8111-111111111111";
const RES = "bbbbbbbb-2222-4222-8222-222222222222";
const WEB_URL = `/api/resource/${RES}/file?projectId=${encodeURIComponent(PROJECT)}`;
const BYTES = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: "image/png",
  size: 3,
  kind: "image",
} as ResourceBytes;

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface PendingRead {
  resolve(value: ResourceBytes): void;
}

function fakeCache() {
  const reads: PendingRead[] = [];
  const created: string[] = [];
  const deps: ResourceBlobCacheDeps = {
    read: () =>
      new Promise<ResourceBytes>((resolve) => {
        reads.push({ resolve });
      }),
    createObjectUrl: () => {
      const url = `blob:fake-${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: () => {},
  };
  return { cache: createResourceBlobCache(deps), reads, created };
}

const editors: Editor[] = [];

function makeEditor(
  fake: ReturnType<typeof fakeCache>,
  content: JSONContent | string,
  withDrop = false,
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      GetWriteImage.configure({
        getProjectId: () => PROJECT,
        blobCache: fake.cache,
      }),
      ...(withDrop
        ? [
            MediaDropExtension.configure({
              getProjectId: () => PROJECT,
              onError: () => {},
            }),
          ]
        : []),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function imageDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "intro" }] },
      {
        type: "image",
        attrs: { src: WEB_URL, resourceId: RES, alt: "pic", title: null },
      },
    ],
  };
}

/** Resolves every pending read so the node view shows a blob URL. */
async function resolveReads(fake: ReturnType<typeof fakeCache>): Promise<void> {
  await flush();
  fake.reads.forEach((r) => r.resolve(BYTES));
  await flush();
}

function expectStoredWebUrl(editor: Editor): void {
  const json = editor.getJSON();
  const node = json.content?.find((n) => n.type === "image");
  expect(node?.attrs?.src).toBe(WEB_URL);
  expect(node?.attrs?.resourceId).toBe(RES);
  expect(JSON.stringify(json)).not.toContain("blob:");
}

function expectNoBlobInMarkdown(editor: Editor): void {
  const json = editor.getJSON();
  const markdown = documentToMarkdown(json);
  expect(markdown).toContain(`src="${WEB_URL}"`);
  expect(markdown).toContain(`data-resource-id="${RES}"`);
  expect(markdown).not.toContain("blob:");
  const node = json.content?.find((n) => n.type === "image");
  const direct = (
    GetWriteImage.config as unknown as {
      renderMarkdown: (n: { attrs?: unknown }) => string;
    }
  ).renderMarkdown({ attrs: node?.attrs });
  expect(direct).toContain(WEB_URL);
  expect(direct).not.toContain("blob:");
  expect(editor.getHTML()).not.toContain("blob:");
}

function expectBlobRendered(editor: Editor): void {
  expect(
    (editor.view.dom as HTMLElement).querySelector("img")?.getAttribute("src"),
  ).toMatch(/^blob:fake-/);
}

beforeEach(() => {
  mockUpload.mockReset();
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("embedded image on native: no blob URL in stored content or Markdown", () => {
  it("initial content: stored src is the web URL after the blob URL renders", async () => {
    const fake = fakeCache();
    const editor = makeEditor(fake, imageDoc());
    await resolveReads(fake);

    expectBlobRendered(editor);
    expectStoredWebUrl(editor);
    expectNoBlobInMarkdown(editor);
  });

  it("insert by drop: stored src is the web URL, no blob URL in JSON or Markdown", async () => {
    mockUpload.mockResolvedValue({ resource: { id: RES } });
    const fake = fakeCache();
    const editor = makeEditor(fake, "<p>x</p>", true);
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);
    const event = {
      dataTransfer: {
        files: [new File(["x"], "photo.png", { type: "image/png" })],
      },
      clientX: 0,
      clientY: 0,
      preventDefault: () => {},
    } as unknown as DragEvent;
    const isHandled = editor.view.someProp("handleDrop", (f) =>
      f(editor.view, event, Slice.empty, false),
    );
    expect(isHandled).toBe(true);
    await resolveReads(fake);

    expectBlobRendered(editor);
    expectStoredWebUrl(editor);
    expectNoBlobInMarkdown(editor);
  });
});

describe("insert from the real ImagePickerSubmenu on native", () => {
  const resource: ImageResource = {
    id: RES,
    slug: RES,
    name: "Cover art",
    type: "image",
    file: "original.png",
    orderIndex: 0,
    createdAt: new Date().toISOString(),
  };

  function makeStore() {
    return configureStore({
      reducer: { projects: projectsReducer, resources: resourcesReducer },
      preloadedState: {
        projects: {
          selectedProjectId: "internal-id",
          projects: {
            "internal-id": {
              id: "internal-id",
              name: "Project",
              rootPath: `/tmp/projects/${PROJECT}`,
              folders: [],
              resources: [],
            } as StoredProject,
          },
        },
        resources: {
          selectedResourceId: null,
          resources: [resource],
          folders: [],
          suppressNextViewAutoSwitch: false,
        },
      },
    });
  }

  it("stores the web URL the picker resolves, with no blob URL in JSON or Markdown", async () => {
    vi.mocked(readResourceBytes).mockResolvedValue(BYTES);
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:picker-${n++}`);
    URL.revokeObjectURL = vi.fn();
    const fake = fakeCache();
    const editor = makeEditor(fake, "<p>x</p>");

    render(
      <Provider store={makeStore()}>
        <ImagePickerSubmenu editor={editor} />
      </Provider>,
    );
    await userEvent.click(screen.getByLabelText("Insert image"));
    // The picker thumbnail itself shows a blob URL; that must not be inserted.
    const thumb = (await screen.findByAltText("Cover art")) as HTMLImageElement;
    expect(thumb.getAttribute("src")).toMatch(/^blob:picker-/);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Insert Cover art" }),
    );
    await act(async () => {
      await resolveReads(fake);
    });

    expect(resolveGetWriteImageSrc(RES, null, PROJECT)).toBe(WEB_URL);
    expectBlobRendered(editor);
    expectStoredWebUrl(editor);
    expectNoBlobInMarkdown(editor);
  });
});

describe("round trip on native", () => {
  it("serialize, reload into a fresh editor, render: same stored content", async () => {
    const fake = fakeCache();
    const first = makeEditor(fake, imageDoc());
    await resolveReads(fake);
    const stored = first.getJSON();

    const fake2 = fakeCache();
    const second = makeEditor(fake2, JSON.parse(JSON.stringify(stored)));
    await resolveReads(fake2);

    expectBlobRendered(second);
    expect(second.getJSON()).toEqual(stored);
    expectStoredWebUrl(second);
    expectNoBlobInMarkdown(second);
  });
});
