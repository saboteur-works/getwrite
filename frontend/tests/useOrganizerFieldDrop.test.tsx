import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { setResources, setFolders } from "../src/store/resourcesSlice";
import type { AnyResource, Folder } from "../src/lib/models";
import type { FolderSidecarValue } from "../src/lib/api/folder-metadata";
import type { OrganizerDropPlan } from "../components/WorkArea/Views/OrganizerView/organizerDropModel";
import { useOrganizerFieldDrop } from "../components/WorkArea/Views/OrganizerView/useOrganizerFieldDrop";

vi.mock("../src/lib/api/organizer-field-write", () => ({
  setOrganizerFields: vi.fn(),
}));
vi.mock("../src/lib/api/folder-metadata", () => ({
  updateFolderMetadata: vi.fn(),
}));
vi.mock("../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../src/lib/api/resources", () => ({
  updateSidecar: vi.fn(),
  patchRevisionContent: vi.fn(),
}));

import { setOrganizerFields } from "../src/lib/api/organizer-field-write";
import { updateFolderMetadata } from "../src/lib/api/folder-metadata";
import { toastService } from "../src/lib/toast-service";
import { updateSidecar, patchRevisionContent } from "../src/lib/api/resources";

const write = vi.mocked(setOrganizerFields);
const folderWrite = vi.mocked(updateFolderMetadata);

const PROJECT = "22222222-2222-4222-8222-222222222222";
const DOC = "doc-1";
const FOLDER = "folder-1";

type Store = ReturnType<typeof makeStore>;

function makeStoreWithCards(): Store {
  const store = makeStore();
  store.dispatch(
    setResources([
      {
        id: DOC,
        name: "Scene one",
        type: "text",
        userMetadata: { status: "Draft", mood: "calm" },
        resourceSubtype: "Scene",
        entityKind: "character",
        wordCountGoal: 500,
      } as unknown as AnyResource,
    ]),
  );
  store.dispatch(
    setFolders([{ id: FOLDER, name: "Act", type: "folder" } as Folder]),
  );
  return store;
}

interface SetupExtra {
  onGone?: () => void;
  onFolderSaved?: (folderId: string, value: FolderSidecarValue) => void;
}

function setup(store: Store, extra: SetupExtra = {}) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    () => useOrganizerFieldDrop({ projectId: PROJECT, ...extra }),
    { wrapper },
  );
}

const docInput = {
  resourceId: DOC,
  changes: [
    {
      target: { kind: "status" as const },
      op: "set" as const,
      value: "Published",
    },
    { target: { kind: "field" as const, key: "mood" }, op: "clear" as const },
    { target: { kind: "subtype" as const }, op: "clear" as const },
  ],
};
const docPlan: OrganizerDropPlan = { kind: "write", input: docInput };
const docRequest = {
  plan: docPlan,
  card: { id: DOC, kind: "resource" as const, name: "Scene one" },
  destinationLabel: "Published / None",
};

const folderRequest = (
  changes: OrganizerDropPlan extends infer P
    ? P extends { kind: "write"; input: infer I }
      ? I extends { changes: infer C }
        ? C
        : never
      : never
    : never,
  destinationLabel: string,
) => ({
  card: { id: FOLDER, kind: "folder" as const, name: "Act" },
  destinationLabel,
  plan: { kind: "write" as const, input: { resourceId: FOLDER, changes } },
});

const storedDoc = (store: Store) =>
  store.getState().resources.resources.find((r) => r.id === DOC) as unknown as {
    userMetadata: Record<string, unknown>;
    resourceSubtype?: string;
    entityKind?: string;
    wordCountGoal?: number;
  };

beforeEach(() => {
  write.mockReset();
  folderWrite.mockReset();
  vi.mocked(toastService.error).mockReset();
  vi.mocked(updateSidecar).mockReset();
});

describe("useOrganizerFieldDrop", () => {
  it("a resource drop makes one transport call with all changes and leaves Redux untouched until it resolves", async () => {
    const store = makeStoreWithCards();
    let resolve!: (v: { status: "done"; resourceId: string }) => void;
    write.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = setup(store);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.drop(docRequest);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(PROJECT, docInput);
    expect(result.current.state.status).toBe("saving");
    expect(storedDoc(store).userMetadata).toEqual({
      status: "Draft",
      mood: "calm",
    });
    expect(storedDoc(store).resourceSubtype).toBe("Scene");
    await act(async () => {
      resolve({ status: "done", resourceId: DOC });
      await pending;
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("success updates Redux per change, keeps unrelated sidecar keys and names the new cell", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({ status: "done", resourceId: DOC });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(docRequest);
    });
    const doc = storedDoc(store);
    expect(doc.userMetadata).toEqual({ status: "Published" });
    expect(doc.resourceSubtype).toBeUndefined();
    expect(doc.entityKind).toBe("character");
    expect(doc.wordCountGoal).toBe(500);
    expect(result.current.state).toEqual({
      status: "saved",
      message: "Scene one moved to Published / None.",
    });
    expect(result.current.announcement).toBe(
      "Scene one moved to Published / None.",
    );
  });

  it("a set on a field and a subtype is merged into Redux", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({ status: "done", resourceId: DOC });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop({
        ...docRequest,
        plan: {
          kind: "write",
          input: {
            resourceId: DOC,
            changes: [
              {
                target: { kind: "field", key: "mood" },
                op: "set",
                value: "tense",
              },
              { target: { kind: "subtype" }, op: "set", value: "Profile" },
            ],
          },
        },
      });
    });
    expect(storedDoc(store).userMetadata).toEqual({
      status: "Draft",
      mood: "tense",
    });
    expect(storedDoc(store).resourceSubtype).toBe("Profile");
  });

  it("a folder card uses the folder transport with clearFieldKeys for a clear, and not the field-write transport", async () => {
    const store = makeStoreWithCards();
    const saved: FolderSidecarValue = {
      notes: "",
      fieldValues: { tone: "dark" },
      resourceSubtype: undefined,
    };
    folderWrite.mockResolvedValueOnce(saved);
    const onFolderSaved = vi.fn();
    const { result } = setup(store, { onFolderSaved });
    await act(async () => {
      await result.current.drop(
        folderRequest(
          [
            {
              target: { kind: "field", key: "tone" },
              op: "set",
              value: "dark",
            },
            { target: { kind: "field", key: "pace" }, op: "clear" },
            { target: { kind: "subtype" }, op: "clear" },
          ],
          "Dark",
        ),
      );
    });
    expect(write).not.toHaveBeenCalled();
    expect(folderWrite).toHaveBeenCalledTimes(1);
    expect(folderWrite).toHaveBeenCalledWith(PROJECT, FOLDER, {
      fieldValues: { tone: "dark" },
      clearFieldKeys: ["pace"],
      resourceSubtype: null,
    });
    expect(onFolderSaved).toHaveBeenCalledWith(FOLDER, saved);
    expect(result.current.state.status).toBe("saved");
    expect(result.current.announcement).toBe("Act moved to Dark.");
  });

  it("a folder write omits keys it does not need", async () => {
    const store = makeStoreWithCards();
    folderWrite.mockResolvedValueOnce({
      notes: "",
      fieldValues: {},
      resourceSubtype: "X",
    });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(
        folderRequest(
          [{ target: { kind: "subtype" }, op: "set", value: "X" }],
          "X",
        ),
      );
    });
    expect(folderWrite).toHaveBeenCalledWith(PROJECT, FOLDER, {
      resourceSubtype: "X",
    });
  });

  it("a failed write says so in the live region and a toast, offers retry and leaves Redux in the old cell", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({ status: "failed", message: "boom" });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(result.current.state.status).toBe("failed");
    expect(result.current.announcement).toMatch(/Couldn't save/);
    expect(result.current.announcement).toMatch(/Scene one/);
    expect(toastService.error).toHaveBeenCalledTimes(1);
    expect(storedDoc(store).userMetadata).toEqual({
      status: "Draft",
      mood: "calm",
    });
    expect(storedDoc(store).resourceSubtype).toBe("Scene");

    write.mockResolvedValueOnce({ status: "done", resourceId: DOC });
    await act(async () => {
      await result.current.retry();
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("saved");
  });

  it("a rejected transport (locked project, thrown error) is a failure, never saved", async () => {
    const store = makeStoreWithCards();
    write.mockRejectedValueOnce(new Error("locked"));
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(result.current.state.status).toBe("failed");
    expect(toastService.error).toHaveBeenCalled();
    expect(storedDoc(store).userMetadata.status).toBe("Draft");
  });

  it("a failed folder write is a failure and does not call onFolderSaved", async () => {
    const store = makeStoreWithCards();
    folderWrite.mockRejectedValueOnce(new Error("nope"));
    const onFolderSaved = vi.fn();
    const { result } = setup(store, { onFolderSaved });
    await act(async () => {
      await result.current.drop(
        folderRequest(
          [{ target: { kind: "subtype" }, op: "set", value: "X" }],
          "X",
        ),
      );
    });
    expect(result.current.state.status).toBe("failed");
    expect(onFolderSaved).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalled();
  });

  it("a gone result says the document is gone and triggers a re-read", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({ status: "gone" });
    const onGone = vi.fn();
    const { result } = setup(store, { onGone });
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(result.current.state.status).toBe("gone");
    expect(result.current.announcement).toMatch(/Scene one/);
    expect(result.current.announcement).toMatch(/no longer exists/);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(storedDoc(store).userMetadata.status).toBe("Draft");
  });

  it("a refusal from the transport writes its message and changes nothing", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({
      status: "refused",
      reason: "value-not-in-list",
      message: "Not allowed.",
    });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(result.current.state).toEqual({
      status: "refused",
      message: "Not allowed.",
    });
    expect(storedDoc(store).userMetadata.status).toBe("Draft");
  });

  it("a refusal from the model writes its reason and makes no call", async () => {
    const store = makeStoreWithCards();
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop({
        ...docRequest,
        plan: {
          kind: "refused",
          reason: "field-locked",
          message: "Locked here.",
        },
      });
    });
    expect(write).not.toHaveBeenCalled();
    expect(folderWrite).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({
      status: "refused",
      message: "Locked here.",
    });
    expect(result.current.announcement).toBe("Locked here.");
  });

  it("a no-op plan makes no call and announces nothing", async () => {
    const store = makeStoreWithCards();
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop({ ...docRequest, plan: { kind: "noop" } });
    });
    expect(write).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
    expect(result.current.announcement).toBe("");
  });

  it("ignores a second drop while one is saving", async () => {
    const store = makeStoreWithCards();
    let resolve!: (v: { status: "done"; resourceId: string }) => void;
    write.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = setup(store);
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.drop(docRequest);
    });
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ status: "done", resourceId: DOC });
      await first;
    });
  });

  it("adds no sidecar page write", async () => {
    const store = makeStoreWithCards();
    write.mockResolvedValueOnce({ status: "done", resourceId: DOC });
    const { result } = setup(store);
    await act(async () => {
      await result.current.drop(docRequest);
    });
    expect(updateSidecar).not.toHaveBeenCalled();
    expect(patchRevisionContent).not.toHaveBeenCalled();
  });
});
