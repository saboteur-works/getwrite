// @vitest-environment jsdom
/**
 * Regression coverage for the media-serving self-heal: a GetWrite image node's
 * displayed `src` is reconstructed from its stable `resourceId` + the active
 * project's directory id, so a document that persisted an older serving URL —
 * notably the pre-ADR-018 `?projectPath=` form the hard-cutover
 * `/api/resource/[resource-id]/file` route now rejects with a 400 — renders
 * correctly on load without any content migration.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import GetWriteImage, {
  resolveGetWriteImageSrc,
} from "../../components/Editor/Extensions/GetWriteImage";

const readResourceBytes = vi.fn();
vi.mock("../../src/lib/api/resource-bytes", () => ({
  readResourceBytes: (...a: unknown[]) => readResourceBytes(...a),
}));

const nativeBackendLoads = vi.fn();
vi.mock("../../src/store/transport/native-resource-bytes-backend", () => {
  nativeBackendLoads();
  return {
    createNativeResourceBytesTransport: () => ({
      readResourceBytes: (...a: unknown[]) => readResourceBytes(...a),
    }),
  };
});

const DIR_ID = "aaaaaaaa-1111-4111-8111-111111111111";

describe("resolveGetWriteImageSrc", () => {
  it("rebuilds the serving URL from resourceId + projectId when both are present", () => {
    expect(resolveGetWriteImageSrc("res-1", null, DIR_ID)).toBe(
      `/api/resource/res-1/file?projectId=${encodeURIComponent(DIR_ID)}`,
    );
  });

  it("self-heals a stale ?projectPath= src persisted before the hard cutover", () => {
    const staleSrc = "/api/resource/res-1/file?projectPath=%2Fold%2Fabsolute";

    const resolved = resolveGetWriteImageSrc("res-1", staleSrc, DIR_ID);

    expect(resolved).toBe(
      `/api/resource/res-1/file?projectId=${encodeURIComponent(DIR_ID)}`,
    );
    expect(resolved).not.toContain("projectPath=");
  });

  it("encodes the projectId in the query string", () => {
    const resolved = resolveGetWriteImageSrc("res-1", null, "a b/c");
    expect(resolved).toBe("/api/resource/res-1/file?projectId=a%20b%2Fc");
  });

  it("falls back to the stored src when no project is active (e.g. markdown export)", () => {
    const storedSrc = "/api/resource/res-1/file?projectId=old-dir";
    expect(resolveGetWriteImageSrc("res-1", storedSrc, null)).toBe(storedSrc);
  });

  it("falls back to the stored src for a plain image with no resourceId", () => {
    expect(
      resolveGetWriteImageSrc(null, "https://example.com/x.png", DIR_ID),
    ).toBe("https://example.com/x.png");
  });

  it("returns an empty string when neither a rebuildable id nor a stored src exists", () => {
    expect(resolveGetWriteImageSrc(null, null, DIR_ID)).toBe("");
    expect(resolveGetWriteImageSrc(null, undefined, null)).toBe("");
  });
});

/**
 * Feature 105 Task 9 (FR-12): with the runtime not native, the web serving
 * URL is unchanged, the node view is not installed and the in-process read
 * and the native backend are never touched. Literal expected strings.
 */
const NON_NATIVE_RUNTIMES: ReadonlyArray<string> = ["", "web", "electron"];
const RES = "bbbbbbbb-2222-4222-8222-222222222222";

describe.each(NON_NATIVE_RUNTIMES)(
  "resolveGetWriteImageSrc, runtime %j (not native)",
  (runtime) => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns the same literal strings for a fixed set of inputs", () => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", runtime);
      expect(resolveGetWriteImageSrc("res-1", null, DIR_ID)).toBe(
        "/api/resource/res-1/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(
        resolveGetWriteImageSrc(
          "res-1",
          "/api/resource/res-1/file?projectPath=%2Fold",
          DIR_ID,
        ),
      ).toBe(
        "/api/resource/res-1/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(resolveGetWriteImageSrc("res-1", null, "a b/c")).toBe(
        "/api/resource/res-1/file?projectId=a%20b%2Fc",
      );
      expect(
        resolveGetWriteImageSrc(
          "res-1",
          "/api/resource/res-1/file?projectId=old-dir",
          null,
        ),
      ).toBe("/api/resource/res-1/file?projectId=old-dir");
      expect(
        resolveGetWriteImageSrc(null, "https://example.com/x.png", DIR_ID),
      ).toBe("https://example.com/x.png");
      expect(resolveGetWriteImageSrc(null, null, DIR_ID)).toBe("");
    });
  },
);

describe.each(NON_NATIVE_RUNTIMES)(
  "GetWriteImage node-view path, runtime %j (not native)",
  (runtime) => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    });

    it("installs no node view, renders the web URL, makes zero in-process reads and loads no native backend", async () => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", runtime);
      readResourceBytes.mockReset();
      nativeBackendLoads.mockClear();
      // A near-viewport observer that reports at once, so a wrongly installed
      // node view would read straight away.
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(private readonly cb: IntersectionObserverCallback) {}
          observe(): void {
            this.cb(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
          }
          disconnect(): void {}
          unobserve(): void {}
        },
      );
      readResourceBytes.mockResolvedValue({
        bytes: new Uint8Array([1]),
        mime: "image/png",
        size: 1,
        kind: "image",
      });
      const element = document.createElement("div");
      document.body.appendChild(element);
      const editor = new Editor({
        element,
        extensions: [
          StarterKit,
          GetWriteImage.configure({ getProjectId: () => DIR_ID }),
        ],
        content: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: { resourceId: RES, src: "/stale?projectPath=x", alt: "p" },
            },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(editor.view.dom.querySelector("img")?.getAttribute("src")).toBe(
        "/api/resource/bbbbbbbb-2222-4222-8222-222222222222/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(
        editor.view.dom.querySelector(".editor-image-picker-thumb-placeholder"),
      ).toBeNull();
      expect(readResourceBytes).not.toHaveBeenCalled();
      expect(nativeBackendLoads).not.toHaveBeenCalled();
      editor.destroy();
    });
  },
);
