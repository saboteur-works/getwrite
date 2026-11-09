/**
 * Feature 105 Task 4: `MediaView` on native reads the file in process
 * (`useResourceObjectUrl`) and mounts the viewer with the blob URL, or shows a
 * loading, refusal, read-failure or locked message. On web it keeps
 * `mediaFileUrl` and never calls the in-process read.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import MediaView, {
  mediaFileUrl,
} from "../components/WorkArea/Media/MediaView";
import projectsReducer, {
  type StoredProject,
} from "../src/store/projectsSlice";
import type { ImageResource, AudioResource } from "../src/lib/models/types";
import { ProjectLockedError } from "../src/lib/models/locked-access";
import { mediaTooLargeToShowMessage } from "../src/lib/models/media-validation";

const readResourceBytes = vi.fn();
vi.mock("../src/lib/api/resource-bytes", () => ({
  readResourceBytes: (...a: unknown[]) => readResourceBytes(...a),
}));

const nativeBackendLoads = vi.fn();
vi.mock("../src/store/transport/native-resource-bytes-backend", () => {
  nativeBackendLoads();
  return {
    createNativeResourceBytesTransport: () => ({
      readResourceBytes: (...a: unknown[]) => readResourceBytes(...a),
    }),
  };
});

const DIRECTORY_BASENAME = "aaaaaaaa-1111-4111-8111-111111111111";

const IMAGE_RESOURCE: ImageResource = {
  id: "resource-1",
  slug: "resource-1",
  name: "Cover art",
  type: "image",
  file: "original.png",
  orderIndex: 0,
  createdAt: new Date().toISOString(),
};

const AUDIO_RESOURCE: AudioResource = {
  id: "audio-1",
  slug: "audio-1",
  name: "Intro",
  type: "audio",
  file: "original.mp3",
  orderIndex: 0,
  createdAt: new Date().toISOString(),
};

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer },
    preloadedState: {
      projects: {
        selectedProjectId: "internal-id",
        projects: {
          "internal-id": {
            id: "internal-id",
            name: "Project",
            rootPath: `/tmp/projects/${DIRECTORY_BASENAME}`,
            folders: [],
            resources: [],
          } as StoredProject,
        },
      },
    },
  });
}

function view(resource: ImageResource | AudioResource): JSX.Element {
  return (
    <Provider store={makeStore()}>
      <MediaView resource={resource} />
    </Provider>
  );
}

/** Carries the core's refusal name and message; the hook reads it by name. */
class FakeTooLarge extends Error {
  constructor(bytes: number) {
    super(mediaTooLargeToShowMessage(bytes));
    this.name = "ResourceBytesTooLargeError";
  }
}

interface FakeBytes {
  kind: "image" | "audio";
  mime: string;
  size: number;
  bytes: Uint8Array;
}

function pngBytes(): FakeBytes {
  return {
    kind: "image",
    mime: "image/png",
    size: 3,
    bytes: new Uint8Array([1, 2, 3]),
  };
}

function deferred(): {
  promise: Promise<FakeBytes>;
  resolve: (v: FakeBytes) => void;
} {
  let resolve: (v: FakeBytes) => void = () => {};
  const promise = new Promise<FakeBytes>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  readResourceBytes.mockReset();
  created.length = 0;
  revoked.length = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: () => {
      const url = `blob:mock-${created.length + 1}`;
      created.push(url);
      return url;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: (url: string) => {
      revoked.push(url);
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("MediaView on native", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
  });

  it("shows loading, then the image with the blob URL, never the file route", async () => {
    const d = deferred();
    readResourceBytes.mockReturnValue(d.promise);
    render(view(IMAGE_RESOURCE));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByAltText("Cover art")).toBeNull();
    d.resolve(pngBytes());
    const img = (await screen.findByAltText("Cover art")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:mock-1");
    expect(img.getAttribute("src")).not.toContain("/api/resource/");
    expect(readResourceBytes).toHaveBeenCalledWith(
      DIRECTORY_BASENAME,
      "resource-1",
    );
  });

  it("passes the blob URL to the audio player", async () => {
    readResourceBytes.mockResolvedValue({
      kind: "audio",
      mime: "audio/mpeg",
      size: 3,
      bytes: new Uint8Array([1, 2, 3]),
    });
    const { container } = render(view(AUDIO_RESOURCE));
    await waitFor(() =>
      expect(container.querySelector("audio")?.getAttribute("src")).toBe(
        "blob:mock-1",
      ),
    );
  });

  it("renders the refusal in role=alert and mounts no viewer", async () => {
    const bytes = 40 * 1024 * 1024;
    readResourceBytes.mockRejectedValue(new FakeTooLarge(bytes));
    render(view(IMAGE_RESOURCE));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(mediaTooLargeToShowMessage(bytes));
    expect(screen.queryByAltText("Cover art")).toBeNull();
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(created).toEqual([]);
  });

  it("renders a read failure as its own message, not blank or loading", async () => {
    readResourceBytes.mockRejectedValue(new Error("EIO secret detail"));
    render(view(IMAGE_RESOURCE));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This file cannot be shown.");
    expect(alert).not.toHaveTextContent("secret detail");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says so when a read fails for lack of memory", async () => {
    readResourceBytes.mockRejectedValue(
      new Error(
        "Couldn't load the attachment. 'readFile' failed with: Failed to allocate a 83886092 byte allocation with 4194304 free bytes and 68MB until OOM, target footprint 268435456, growth limit 268435456",
      ),
    );
    render(view(IMAGE_RESOURCE));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Not enough memory on this device to show this file.",
    );
    expect(alert).not.toHaveTextContent("This file cannot be shown.");
  });

  it("treats empty bytes as a failure, not a success", async () => {
    readResourceBytes.mockResolvedValue({
      ...pngBytes(),
      bytes: new Uint8Array(),
    });
    render(view(IMAGE_RESOURCE));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file cannot be shown.",
    );
    expect(created).toEqual([]);
  });

  it("renders the locked message through isLockedAccessError (fake)", async () => {
    readResourceBytes.mockRejectedValue(new ProjectLockedError("p"));
    render(view(IMAGE_RESOURCE));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This project is locked. Unlock it, then try again.",
    );
  });

  it("revokes every created URL on unmount", async () => {
    readResourceBytes.mockResolvedValue(pngBytes());
    const { unmount } = render(view(IMAGE_RESOURCE));
    await screen.findByAltText("Cover art");
    unmount();
    expect(created).toEqual(["blob:mock-1"]);
    expect(revoked).toEqual(created);
  });

  it("revokes on id change, and a late read after the change creates no URL", async () => {
    const first = deferred();
    readResourceBytes
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(pngBytes());
    const { rerender, unmount } = render(view(IMAGE_RESOURCE));
    rerender(view({ ...IMAGE_RESOURCE, id: "resource-2" }));
    await screen.findByAltText("Cover art");
    expect(created).toEqual(["blob:mock-1"]);
    first.resolve(pngBytes());
    await Promise.resolve();
    await Promise.resolve();
    expect(created).toEqual(["blob:mock-1"]);
    unmount();
    expect(revoked).toEqual(created);
  });

  it("revokes the old URL when the id changes after a ready state", async () => {
    readResourceBytes.mockResolvedValue(pngBytes());
    const { rerender, unmount } = render(view(IMAGE_RESOURCE));
    await screen.findByAltText("Cover art");
    rerender(view({ ...IMAGE_RESOURCE, id: "resource-2", name: "Other" }));
    await screen.findByAltText("Other");
    expect(created).toEqual(["blob:mock-1", "blob:mock-2"]);
    expect(revoked).toEqual(["blob:mock-1"]);
    unmount();
    expect(revoked).toEqual(created);
  });

  it("creates no URL for a read that resolves after unmount", async () => {
    const d = deferred();
    readResourceBytes.mockReturnValue(d.promise);
    const { unmount } = render(view(IMAGE_RESOURCE));
    unmount();
    d.resolve(pngBytes());
    await Promise.resolve();
    await Promise.resolve();
    expect(created).toEqual([]);
  });
});

describe.each(["", "web", "electron"])(
  "MediaView, runtime %j (not native), Feature 105 Task 9 (FR-12)",
  (runtime) => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", runtime);
      nativeBackendLoads.mockClear();
    });

    it("mediaFileUrl returns the same literal strings", () => {
      expect(mediaFileUrl("resource-1", DIRECTORY_BASENAME)).toBe(
        "/api/resource/resource-1/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(mediaFileUrl("res-1", "a b/c")).toBe(
        "/api/resource/res-1/file?projectId=a%20b%2Fc",
      );
    });

    it("an image takes the file route src with zero in-process reads and no native backend load", () => {
      render(view(IMAGE_RESOURCE));
      expect(screen.getByAltText("Cover art").getAttribute("src")).toBe(
        "/api/resource/resource-1/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(readResourceBytes).not.toHaveBeenCalled();
      expect(nativeBackendLoads).not.toHaveBeenCalled();
    });

    it("audio takes the file route src with zero in-process reads and no native backend load", () => {
      const { container } = render(view(AUDIO_RESOURCE));
      expect(container.querySelector("audio")?.getAttribute("src")).toBe(
        "/api/resource/audio-1/file?projectId=aaaaaaaa-1111-4111-8111-111111111111",
      );
      expect(readResourceBytes).not.toHaveBeenCalled();
      expect(nativeBackendLoads).not.toHaveBeenCalled();
    });

    it("the real client rejects as unsupported and never loads the native backend", async () => {
      const actual = await vi.importActual<
        typeof import("../src/lib/api/resource-bytes")
      >("../src/lib/api/resource-bytes");
      await expect(
        actual.readResourceBytes(DIRECTORY_BASENAME, "resource-1"),
      ).rejects.toBeInstanceOf(actual.ResourceBytesUnsupportedError);
      expect(nativeBackendLoads).not.toHaveBeenCalled();
    });
  },
);
