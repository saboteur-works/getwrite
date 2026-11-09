/**
 * Regression coverage for Task 9g: `ImagePickerSubmenu` must build the
 * resource file-serving URL (used both for the picker's thumbnails and for
 * the URL passed to `insertGetWriteImage`) with the tenant-scoped
 * `projectId` query param — the active project's on-disk directory
 * basename — never the legacy `projectPath` query param the hard-cutover
 * `/api/resource/[resource-id]/file` route now rejects.
 *
 * The fixture below is the same FR12 basename-vs-id shape used elsewhere
 * (e.g. `resources-api.test.ts`, `revision-transport-service.test.ts`): the
 * directory basename (`rootPath`'s trailing segment) and `project.json`'s
 * internal `id` are two independently generated UUIDs that must never be
 * conflated.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { Editor } from "@tiptap/core";
import ImagePickerSubmenu from "../components/Editor/MenuBar/ImagePickerSubmenu";
import projectsReducer, {
  type StoredProject,
} from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import type { ImageResource } from "../src/lib/models/types";
import { readResourceBytes } from "../src/lib/api/resource-bytes";
import type { ResourceBytes } from "../src/lib/models/resource-bytes-core";

vi.mock("../src/lib/api/resource-bytes", () => ({
  readResourceBytes: vi.fn(),
}));

// FR12 fixture: the project's internal `id` (project.json) and its on-disk
// directory basename (the trailing segment of `rootPath`) are independently
// generated UUIDs and must never be conflated.
const PROJECT_INTERNAL_ID = "internal-id-not-a-directory-name";
const DIRECTORY_BASENAME = "aaaaaaaa-1111-4111-8111-111111111111";
const PROJECT_ROOT = `/tmp/projects/${DIRECTORY_BASENAME}`;

const IMAGE_RESOURCE: ImageResource = {
  id: "resource-1",
  slug: "resource-1",
  name: "Cover art",
  type: "image",
  file: "original.png",
  orderIndex: 0,
  createdAt: new Date().toISOString(),
};

function makeStore(resources: ImageResource[] = [IMAGE_RESOURCE]) {
  return configureStore({
    reducer: { projects: projectsReducer, resources: resourcesReducer },
    preloadedState: {
      projects: {
        selectedProjectId: PROJECT_INTERNAL_ID,
        projects: {
          [PROJECT_INTERNAL_ID]: {
            id: PROJECT_INTERNAL_ID,
            name: "Project",
            rootPath: PROJECT_ROOT,
            folders: [],
            resources: [],
          } as StoredProject,
        },
      },
      resources: {
        selectedResourceId: null,
        resources,
        folders: [],
        suppressNextViewAutoSwitch: false,
      },
    },
  });
}

// Minimal double: ImagePickerSubmenu only calls `.chain().focus()
// .insertGetWriteImage(...).run()` on click, which this test doesn't
// exercise (it only asserts the rendered thumbnail's src).
const editorDouble = {} as unknown as Editor;

describe("ImagePickerSubmenu (T9g regression)", () => {
  it("builds the picker thumbnail src with projectId equal to the directory basename, not project.id", async () => {
    render(
      <Provider store={makeStore()}>
        <ImagePickerSubmenu editor={editorDouble} />
      </Provider>,
    );

    await userEvent.click(screen.getByLabelText("Insert image"));

    const thumb = screen.getByAltText("Cover art") as HTMLImageElement;
    expect(thumb.getAttribute("src")).toBe(
      `/api/resource/resource-1/file?projectId=${encodeURIComponent(DIRECTORY_BASENAME)}`,
    );
    expect(thumb.getAttribute("src")).not.toContain(PROJECT_INTERNAL_ID);
    expect(thumb.getAttribute("src")).not.toContain("projectPath=");
  });
});

// ---------------------------------------------------------------------------
// Feature 105, Task 7: lazy native reads, placeholders, phone-width placement
// ---------------------------------------------------------------------------

const readMock = vi.mocked(readResourceBytes);
const WEB_SRC = `/api/resource/resource-1/file?projectId=${encodeURIComponent(DIRECTORY_BASENAME)}`;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  fire(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function makeNear(): void {
  for (const o of FakeIntersectionObserver.instances) {
    for (const t of [...o.targets]) o.fire(t);
  }
}

function tooLargeError(): Error {
  const e = new Error(
    "This file is 40.0 MB. It is too large to show on this device (limit 30 MB).",
  );
  e.name = "ResourceBytesTooLargeError";
  return e;
}

function image(id: string, name: string): ImageResource {
  return { ...IMAGE_RESOURCE, id, slug: id, name };
}

function bytesResult(): ResourceBytes {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/png",
    size: 3,
    kind: "image",
  };
}

describe("ImagePickerSubmenu native lazy reads (Feature 105 Task 7)", () => {
  let created: string[];
  let revoked: string[];
  const insertSpy = vi.fn();
  const chain = {
    focus: () => chain,
    insertGetWriteImage: (attrs: unknown) => {
      insertSpy(attrs);
      return chain;
    },
    run: () => true,
  };
  const editor = { chain: () => chain } as unknown as Editor;

  beforeEach(() => {
    created = [];
    revoked = [];
    FakeIntersectionObserver.instances = [];
    insertSpy.mockReset();
    readMock.mockReset();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:test/${created.length}`;
      created.push(u);
      return u;
    });
    URL.revokeObjectURL = vi.fn((u: string) => {
      revoked.push(u);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function openPicker(resources: ImageResource[] = [IMAGE_RESOURCE]) {
    render(
      <Provider store={makeStore(resources)}>
        <ImagePickerSubmenu editor={editor} />
      </Provider>,
    );
    await userEvent.click(screen.getByLabelText("Insert image"));
  }

  it("reads nothing until the entry is near the viewport, then shows the blob URL once", async () => {
    readMock.mockResolvedValue(bytesResult());
    await openPicker();
    expect(readMock).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Cover art")).toBeNull();

    act(() => makeNear());
    const img = (await screen.findByAltText("Cover art")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:test/0");
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock).toHaveBeenCalledWith(DIRECTORY_BASENAME, "resource-1");
  });

  it("shows the refusal message for an over-threshold entry and still inserts the web src", async () => {
    readMock.mockRejectedValue(tooLargeError());
    await openPicker();
    act(() => makeNear());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("too large to show on this device");
    expect(alert.className).toContain("editor-image-picker-thumb-placeholder");
    expect(screen.queryByAltText("Cover art")).toBeNull();

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Insert Cover art" }),
    );
    expect(insertSpy).toHaveBeenCalledWith({
      src: WEB_SRC,
      resourceId: "resource-1",
    });
  });

  it("shows the failure placeholder on a read failure and stays insertable", async () => {
    readMock.mockRejectedValue(new Error("boom"));
    await openPicker();
    act(() => makeNear());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This file cannot be shown.");
    expect(alert.textContent).not.toContain("boom");
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Insert Cover art" }),
    );
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps listing every entry, in order, whatever each read does", async () => {
    readMock.mockImplementation((_p, id) =>
      id === "a"
        ? Promise.reject(tooLargeError())
        : Promise.resolve(bytesResult()),
    );
    await openPicker([image("a", "Alpha"), image("b", "Beta")]);
    act(() => makeNear());
    await screen.findByRole("alert");
    await screen.findByAltText("Beta");
    const items = screen
      .getAllByRole("menuitem")
      .map((i: HTMLElement) => i.getAttribute("aria-label"));
    expect(items).toEqual(["Insert Alpha", "Insert Beta"]);
  });

  it("revokes every created URL when the picker closes, and a late read creates none", async () => {
    let resolveLate: (v: ResourceBytes) => void = () => {};
    readMock.mockImplementation((_p, id) =>
      id === "late"
        ? new Promise((r) => {
            resolveLate = r;
          })
        : Promise.resolve(bytesResult()),
    );
    await openPicker([image("early", "Early"), image("late", "Late")]);
    act(() => makeNear());
    await screen.findByAltText("Early");
    expect(created).toHaveLength(1);

    await userEvent.click(screen.getByLabelText("Insert image"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(revoked).toEqual(created);

    await act(async () => {
      resolveLate(bytesResult());
    });
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });

  it("does not call the in-process read on web and keeps the web src", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    await openPicker();
    const img = screen.getByAltText("Cover art") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(WEB_SRC);
    expect(readMock).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});

describe("ImagePickerSubmenu placement (Feature 105 Task 7)", () => {
  const editor = {} as unknown as Editor;
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function rect(left: number, top: number, w: number, h: number): DOMRect {
    return {
      x: left,
      y: top,
      left,
      top,
      width: w,
      height: h,
      right: left + w,
      bottom: top + h,
      toJSON() {},
    } as DOMRect;
  }

  function stubRects(
    viewportWidth: number,
    buttonLeft: number,
    menuWidth: number,
  ) {
    vi.stubGlobal("innerWidth", viewportWidth);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("editor-image-picker")) {
          return rect(
            parseFloat(this.style.left || "0"),
            parseFloat(this.style.top || "0"),
            menuWidth,
            107,
          );
        }
        if (this.getAttribute("aria-label") === "Insert image") {
          return rect(buttonLeft, 10, 28, 28);
        }
        return rect(0, 0, 0, 0);
      },
    );
  }

  async function openInMaskedBar() {
    render(
      <Provider store={makeStore()}>
        <div id="editor-menu-bar" className="editor-menubar">
          <ImagePickerSubmenu editor={editor} />
        </div>
      </Provider>,
    );
    await userEvent.click(screen.getByLabelText("Insert image"));
    return screen.getByRole("menu");
  }

  it("renders the picker outside the .editor-menubar element", async () => {
    const menu = await openInMaskedBar();
    expect(menu.closest(".editor-menubar")).toBeNull();
    expect(menu.parentElement).toBe(document.body);
  });

  it("keeps the picker's right edge inside a 390 px viewport", async () => {
    stubRects(390, 219, 255);
    const menu = await openInMaskedBar();
    const left = parseFloat(menu.style.left);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + 255).toBeLessThanOrEqual(390);
  });

  it("leaves the desktop placement at the button's left and bottom plus 4", async () => {
    stubRects(1440, 219, 255);
    const menu = await openInMaskedBar();
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("219px");
    expect(menu.style.top).toBe("42px");
  });

  it("has CSS that bounds the picker to the viewport", () => {
    const css = readFileSync(
      join(__dirname, "../styles/getwrite-utilities.css"),
      "utf8",
    );
    const rule = /\.editor-image-picker \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/max-width:\s*min\(284px,\s*calc\(100vw - 16px\)\)/);
    expect(rule).toMatch(/max-height:\s*min\(320px,\s*calc\(100vh - 16px\)\)/);
  });
});
