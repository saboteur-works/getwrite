// @vitest-environment jsdom
/**
 * Feature 105 Task 17: a node inserted after the editor mounted, and a node
 * created while a read of a different resource is in flight, must reach a
 * final state (image, refusal or message) once near the viewport. jsdom is not
 * evidence for the Android WebView (the device run is the evidence there).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import GetWriteImage from "../../components/Editor/Extensions/GetWriteImage";
import {
  createResourceBlobCache,
  type ResourceBlobCacheDeps,
} from "../../src/lib/resource-blob-cache";
import type { ResourceBytes } from "../../src/lib/api/resource-bytes";

const PROJECT = "aaaaaaaa-1111-4111-8111-111111111111";
const ids = ["a", "b", "c", "d"].map(
  (c) => `${c.repeat(8)}-2222-4222-8222-222222222222`,
);
const attrsFor = (resourceId: string) => ({
  resourceId,
  src: `/api/resource/${resourceId}/file?projectId=${PROJECT}`,
});
const BYTES = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: "image/png",
  kind: "image",
} as ResourceBytes;
const PLACEHOLDER = ".editor-image-picker-thumb-placeholder";
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface PendingRead {
  resourceId: string;
  resolve(value: ResourceBytes): void;
  reject(error: unknown): void;
}

/** Observers that report on screen when told, like the browser does. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  elements: Element[] = [];
  constructor(public callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
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

/** Fires every live observer, as the browser does for on-screen elements. */
function scrollEverythingIntoView(): void {
  for (const o of [...FakeObserver.instances]) {
    if (o.elements.length > 0) o.fire();
  }
}

function setup(initialIds: string[], readTimeoutMs?: number) {
  const reads: PendingRead[] = [];
  const deps: ResourceBlobCacheDeps = {
    read: (_p, resourceId) =>
      new Promise<ResourceBytes>((resolve, reject) => {
        reads.push({ resourceId, resolve, reject });
      }),
    createObjectUrl: () => "blob:fake",
    revokeObjectUrl: () => {},
    readTimeoutMs,
  };
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
    ],
    content: {
      type: "doc",
      content: initialIds.map((id) => ({ type: "image", attrs: attrsFor(id) })),
    },
  });
  return { editor, reads };
}

function insertImage(editor: Editor, resourceId: string, pos: number): void {
  const node = editor.state.schema.nodes["image"].create(attrsFor(resourceId));
  editor.view.dispatch(editor.state.tr.insert(pos, node));
}

/** Count of image nodes still showing the loading placeholder. */
function stillLoading(editor: Editor): number {
  const dom = editor.view.dom as HTMLElement;
  return [...dom.querySelectorAll(PLACEHOLDER)].filter(
    (p) => p.getAttribute("role") !== "alert",
  ).length;
}

let editor: Editor | null = null;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  if (editor && !editor.isDestroyed) editor.destroy();
  editor = null;
  document.body.innerHTML = "";
  FakeObserver.instances = [];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Settles every outstanding read, scrolls everything into view, repeats. */
async function settleAll(
  reads: PendingRead[],
  outcome: (r: PendingRead) => void,
): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    scrollEverythingIntoView();
    await flush();
    for (const r of reads.splice(0)) outcome(r);
    await flush();
  }
}

describe("a node created after the editor mounted", () => {
  it("(a) inserted at the top while earlier images are ready, reaches a final state", async () => {
    const s = setup([ids[0], ids[1]]);
    editor = s.editor;
    await settleAll(s.reads, (r) => r.resolve(BYTES));
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(2);

    insertImage(editor, ids[2], 0);
    await flush();
    await settleAll(s.reads, (r) => r.resolve(BYTES));

    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(3);
    expect(stillLoading(editor)).toBe(0);
  });

  it("(a) inserted at the end after mount, reaches a final state", async () => {
    const s = setup([ids[0]]);
    editor = s.editor;
    await settleAll(s.reads, (r) => r.resolve(BYTES));
    insertImage(editor, ids[1], editor.state.doc.content.size);
    await settleAll(s.reads, (r) => r.resolve(BYTES));
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(2);
    expect(stillLoading(editor)).toBe(0);
  });

  it("(b) created while a read of a different resource is in flight, reaches a final state", async () => {
    const s = setup([ids[0]]);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    expect(s.reads.map((r) => r.resourceId)).toEqual([ids[0]]);

    // The first read is still pending when the new node is inserted.
    insertImage(editor, ids[1], 0);
    await flush();
    await settleAll(s.reads, (r) => r.resolve(BYTES));

    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(2);
    expect(stillLoading(editor)).toBe(0);
  });

  it("(b) three inserts while the first read is in flight, with a failure, all reach a final state", async () => {
    const s = setup([ids[0]]);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    insertImage(editor, ids[1], 0);
    insertImage(editor, ids[2], 0);
    insertImage(editor, ids[3], 0);
    await flush();
    await settleAll(s.reads, (r) =>
      r.resourceId === ids[2]
        ? r.reject(new Error("Failed to allocate"))
        : r.resolve(BYTES),
    );

    expect(stillLoading(editor)).toBe(0);
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(3);
    expect(editor.view.dom.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });
});

describe("a node inserted above one whose read is in flight", () => {
  it("starts no second read of the in-flight resource and both end as images", async () => {
    const s = setup([ids[0]]);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    insertImage(editor, ids[1], 0);
    await flush();
    scrollEverythingIntoView();
    await flush();
    expect(s.reads.map((r) => r.resourceId[0])).toEqual(["a", "b"]);
    for (const r of s.reads.splice(0)) r.resolve(BYTES);
    await flush();
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(2);
    expect(stillLoading(editor)).toBe(0);
  });
});

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe("a read that never settles", () => {
  it("a node inserted after mount and on screen ends in a message, not loading", async () => {
    const s = setup([ids[0]], 40);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    insertImage(editor, ids[1], 0);
    await flush();
    scrollEverythingIntoView();
    await flush();
    // Both reads are in flight and neither ever settles.
    // One read per distinct resource: the read of the first resource is not
    // abandoned and started again when the new node shifts it down.
    expect(s.reads.map((r) => r.resourceId[0])).toEqual(["a", "b"]);
    expect(stillLoading(editor)).toBe(2);

    await sleep(120);

    expect(stillLoading(editor)).toBe(0);
    const alerts = [...editor.view.dom.querySelectorAll('[role="alert"]')];
    expect(alerts).toHaveLength(2);
    expect(alerts[0].textContent).toContain("This file cannot be shown.");
  });

  it("a result that arrives after the timeout creates no blob URL", async () => {
    const s = setup([ids[0]], 40);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    await sleep(120);
    s.reads[0].resolve(BYTES);
    await flush();
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(0);
    expect(stillLoading(editor)).toBe(0);
  });

  it("a read that settles in time is unaffected by the timeout", async () => {
    const s = setup([ids[0]], 40);
    editor = s.editor;
    scrollEverythingIntoView();
    await flush();
    s.reads[0].resolve(BYTES);
    await sleep(120);
    expect(editor.view.dom.querySelectorAll("img")).toHaveLength(1);
  });
});
