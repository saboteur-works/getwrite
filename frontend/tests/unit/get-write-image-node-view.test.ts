// @vitest-environment jsdom
/**
 * Feature 105 Task 6: the native-only node view on `GetWriteImage`. A real
 * TipTap editor runs in jsdom with a real ref-counted cache over fake reads
 * and counters of created and revoked object URLs. jsdom is not evidence that
 * the node view works in the Android WebView (that is the Task 13 device run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import GetWriteImage from "../../components/Editor/Extensions/GetWriteImage";
import {
  createResourceBlobCache,
  type ResourceBlobCache,
  type ResourceBlobCacheDeps,
} from "../../src/lib/resource-blob-cache";
import type { ResourceBytes } from "../../src/lib/api/resource-bytes";

const PROJECT = "aaaaaaaa-1111-4111-8111-111111111111";
const RES_A = "bbbbbbbb-2222-4222-8222-222222222222";
const RES_B = "cccccccc-3333-4333-8333-333333333333";
const STORED_A = `/api/resource/${RES_A}/file?projectId=${PROJECT}`;
const STORED_B = `/api/resource/${RES_B}/file?projectId=${PROJECT}`;

interface PendingRead {
  resourceId: string;
  resolve(value: ResourceBytes): void;
  reject(error: unknown): void;
}

const BYTES = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: "image/png",
  kind: "image",
} as ResourceBytes;

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function fakes() {
  const reads: PendingRead[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const deps: ResourceBlobCacheDeps = {
    read: (_p, resourceId) =>
      new Promise<ResourceBytes>((resolve, reject) => {
        reads.push({ resourceId, resolve, reject });
      }),
    createObjectUrl: () => {
      const url = `blob:fake-${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
  };
  const inner = createResourceBlobCache(deps);
  const acquire = vi.fn(inner.acquire);
  const cache: ResourceBlobCache = { acquire };
  return { cache, acquire, reads, created, revoked };
}

const editors: Editor[] = [];

function mount(
  cache: ResourceBlobCache,
  nodes: Array<{ resourceId: string | null; src: string }>,
  projectId: string | null = PROJECT,
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      GetWriteImage.configure({
        getProjectId: () => projectId,
        blobCache: cache,
      }),
    ],
    content: {
      type: "doc",
      content: nodes.map((attrs) => ({
        type: "image",
        attrs: { ...attrs, alt: "pic" },
      })),
    },
  });
  editors.push(editor);
  return editor;
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeObserver.instances.push(this);
  }
  elements: Element[] = [];
  observe(el: Element): void {
    this.elements.push(el);
  }
  disconnect(): void {
    this.elements = [];
  }
  fire(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
});

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
  document.body.innerHTML = "";
  FakeObserver.instances = [];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function dom(editor: Editor): HTMLElement {
  return editor.view.dom as HTMLElement;
}

describe("GetWriteImage node view on native", () => {
  it("shows a loading placeholder, then an img with the blob URL", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();

    expect(dom(editor).querySelector("img")).toBeNull();
    expect(
      dom(editor).querySelector(".editor-image-picker-thumb-placeholder"),
    ).not.toBeNull();
    expect(f.reads).toHaveLength(1);

    f.reads[0].resolve(BYTES);
    await flush();

    const img = dom(editor).querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:fake-1");
    expect(img?.getAttribute("alt")).toBe("pic");
    expect(
      dom(editor).querySelector(".editor-image-picker-thumb-placeholder"),
    ).toBeNull();
  });

  it("shows the refusal message inline, with an icon and no red", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    const refusal = new Error("This file is 31.0 MB. Too large.");
    refusal.name = "ResourceBytesTooLargeError";
    f.reads[0].reject(refusal);
    await flush();

    const box = dom(editor).querySelector(
      ".editor-image-picker-thumb-placeholder",
    );
    expect(box?.textContent).toContain("This file is 31.0 MB. Too large.");
    expect(box?.getAttribute("role")).toBe("alert");
    expect(box?.querySelector("svg")).not.toBeNull();
    expect(box?.outerHTML.toLowerCase()).not.toMatch(/red|#d44040|#f00/);
    expect(dom(editor).querySelector("img")).toBeNull();
  });

  it("shows its own message for a read failure", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    f.reads[0].reject(new Error("ENOENT"));
    await flush();

    const box = dom(editor).querySelector(
      ".editor-image-picker-thumb-placeholder",
    );
    expect(box?.textContent).toContain("This file cannot be shown.");
    expect(box?.getAttribute("role")).toBe("alert");
  });

  it("shows the failure placeholder when the blob does not decode", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();
    dom(editor).querySelector("img")?.dispatchEvent(new Event("error"));

    expect(dom(editor).querySelector("img")).toBeNull();
    expect(
      dom(editor).querySelector(".editor-image-picker-thumb-placeholder")
        ?.textContent,
    ).toContain("This file cannot be shown.");
  });

  it("reads only once a node is near the viewport", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();

    expect(f.acquire).not.toHaveBeenCalled();
    expect(f.reads).toHaveLength(0);
    expect(dom(editor).querySelector("img")).toBeNull();

    FakeObserver.instances[0].fire();
    await flush();
    expect(f.acquire).toHaveBeenCalledTimes(1);
    expect(f.reads).toHaveLength(1);
  });

  it("two nodes embedding the same resource cause one read", async () => {
    const f = fakes();
    const editor = mount(f.cache, [
      { resourceId: RES_A, src: STORED_A },
      { resourceId: RES_A, src: STORED_A },
    ]);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();

    expect(f.reads).toHaveLength(1);
    expect(f.created).toHaveLength(1);
    expect(dom(editor).querySelectorAll("img")).toHaveLength(2);
  });

  it("keeps the DOM and does not re-read on update for the same resourceId", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();
    const before = dom(editor).querySelector("img");

    editor.commands.updateAttributes("image", { alt: "renamed" });
    await flush();

    const after = dom(editor).querySelector("img");
    expect(after).toBe(before);
    expect(after?.getAttribute("alt")).toBe("renamed");
    expect(f.acquire).toHaveBeenCalledTimes(1);
    expect(f.reads).toHaveLength(1);
  });

  it("releases the old and acquires the new when the resourceId changes", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();
    expect(f.created).toEqual(["blob:fake-1"]);

    editor.commands.updateAttributes("image", {
      resourceId: RES_B,
      src: STORED_B,
    });
    await flush();

    expect(f.revoked).toEqual(["blob:fake-1"]);
    expect(f.reads.map((r) => r.resourceId)).toEqual([RES_A, RES_B]);
    expect(dom(editor).querySelector("img")).toBeNull();
    f.reads[1].resolve(BYTES);
    await flush();
    expect(dom(editor).querySelector("img")?.getAttribute("src")).toBe(
      "blob:fake-2",
    );
  });

  it("revokes the URL when the node is removed", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();

    editor.commands.clearContent();
    await flush();
    expect(f.revoked).toEqual(["blob:fake-1"]);
  });

  it("destroying the editor revokes every created URL", async () => {
    const f = fakes();
    const editor = mount(f.cache, [
      { resourceId: RES_A, src: STORED_A },
      { resourceId: RES_B, src: STORED_B },
      { resourceId: RES_A, src: STORED_A },
    ]);
    await flush();
    f.reads.forEach((r) => r.resolve(BYTES));
    await flush();
    expect(f.created).toHaveLength(2);
    expect(f.revoked).toHaveLength(0);

    editor.destroy();
    expect(f.revoked.sort()).toEqual([...f.created].sort());
  });

  it("a read that resolves after the editor is destroyed creates no URL", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    await flush();
    editor.destroy();
    f.reads[0].resolve(BYTES);
    await flush();
    expect(f.created).toHaveLength(0);
  });

  it("never rewrites the stored attributes", async () => {
    const f = fakes();
    const editor = mount(f.cache, [{ resourceId: RES_A, src: STORED_A }]);
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);
    await flush();
    f.reads[0].resolve(BYTES);
    await flush();

    expect(onUpdate).not.toHaveBeenCalled();
    const node = editor.getJSON().content?.[0];
    expect(node?.attrs?.src).toBe(STORED_A);
    expect(node?.attrs?.resourceId).toBe(RES_A);
    expect(JSON.stringify(editor.getJSON())).not.toContain("blob:");
  });

  it("renders a node without a resourceId as a plain img with its stored src", async () => {
    const f = fakes();
    const editor = mount(f.cache, [
      { resourceId: null, src: "https://example.com/a.png" },
    ]);
    await flush();
    expect(dom(editor).querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/a.png",
    );
    expect(f.acquire).not.toHaveBeenCalled();
  });
});

describe("GetWriteImage on web", () => {
  it("installs no node view and renders through renderHTML", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    const f = fakes();
    const editor = mount(f.cache, [
      { resourceId: RES_A, src: "/stale?projectPath=x" },
    ]);
    await flush();

    expect(dom(editor).querySelector("img")?.getAttribute("src")).toBe(
      `/api/resource/${RES_A}/file?projectId=${encodeURIComponent(PROJECT)}`,
    );
    expect(
      dom(editor).querySelector(".editor-image-picker-thumb-placeholder"),
    ).toBeNull();
    expect(f.acquire).not.toHaveBeenCalled();
    expect(f.reads).toHaveLength(0);
  });
});
