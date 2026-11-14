/** @vitest-environment jsdom */
/**
 * Feature 110, Task 14 (FR-7): the Narratives tab's list hook, with a fake
 * folder-metadata read. A failed read is returned, never an empty list.
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import {
  useNarrativeList,
  type NarrativeListDeps,
} from "../../components/Folklore/useNarrativeList";
import { UNLOCK_AT_DESKTOP_MESSAGE } from "../../components/Sharing/sharing-copy";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import type { AnyResource, Folder } from "../../src/lib/models/types";
import { fetchEncryptionStatus } from "../../src/lib/api/encryption";

vi.mock("../../src/lib/api/encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/encryption")>()),
  unlockWorkspaceRequest: vi.fn(),
  fetchEncryptionStatus: vi.fn(),
}));

const PROJECT_ID = "proj-narr";

function folder(
  id: string,
  name: string,
  orderIndex = 0,
  parentId: string | null = null,
): Folder {
  return { id, name, type: "folder", orderIndex, parentId } as Folder;
}

function source(id: string, folderId: string, orderIndex = 0): AnyResource {
  return {
    id,
    name: id,
    type: "source",
    folderId,
    orderIndex,
    resourceSubtype: "Variant",
  } as unknown as AnyResource;
}

type Subtypes = Record<string, string | undefined | Error>;

function makeDeps(subtypes: Subtypes): NarrativeListDeps {
  return {
    getFolderMetadata: vi.fn(async (_projectId: string, id: string) => {
      const v = subtypes[id];
      if (v instanceof Error) throw v;
      return { notes: "", fieldValues: {}, resourceSubtype: v };
    }),
  };
}

function setup(
  deps: NarrativeListDeps,
  folders: Folder[],
  resources: AnyResource[] = [],
  limits: React.ComponentProps<
    typeof StaticSharingLimitsProvider
  >["value"] = {},
) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      rootPath: `/projects/${PROJECT_ID}`,
      name: "P",
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders(folders));
  store.dispatch(setResources(resources));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <StaticSharingLimitsProvider value={limits}>
        {children}
      </StaticSharingLimitsProvider>
    </Provider>
  );
  const hook = renderHook(() => useNarrativeList({ deps }), { wrapper });
  return { ...hook, store };
}

function ready(result: ReturnType<typeof setup>["result"]) {
  const state = result.current.state;
  if (state.status !== "ready") throw new Error(`state is ${state.status}`);
  return state;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchEncryptionStatus).mockResolvedValue({
    isAvailable: true,
    hasKeyring: true,
    isUnlocked: false,
    encryptedProjectIds: [PROJECT_ID],
  } as never);
});

describe("useNarrativeList", () => {
  it("returns each Narrative folder by name with its variant count", async () => {
    const deps = makeDeps({ a: "Narrative", b: " narrative ", c: undefined });
    const { result } = setup(
      deps,
      [
        folder("a", "Cinderella", 0),
        folder("b", "Snow", 1),
        folder("c", "Misc", 2),
      ],
      [source("s1", "a"), source("s2", "a", 1), source("s3", "b")],
    );
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.narratives).toEqual([
      { folderId: "a", name: "Cinderella", variantCount: 2 },
      { folderId: "b", name: "Snow", variantCount: 1 },
    ]);
    expect(state.notRead).toEqual([]);
    expect(deps.getFolderMetadata).toHaveBeenCalledWith(PROJECT_ID, "a");
    expect(state.nearMiss).toEqual({ status: "none" });
  });

  it("returns a folder whose subtype was not read in notRead, keeps the rest, and retry reads again", async () => {
    const deps = makeDeps({ a: "Narrative", b: new Error("bad sidecar") });
    const { result } = setup(deps, [folder("a", "A"), folder("b", "B", 1)]);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.narratives.map((n) => n.folderId)).toEqual(["a"]);
    expect(state.notRead).toEqual([
      { folderId: "b", name: "B", reason: "bad sidecar" },
    ]);
    act(() => result.current.retry());
    await waitFor(() =>
      expect(deps.getFolderMetadata).toHaveBeenCalledTimes(4),
    );
  });

  it("gives a narrative no count when a folder inside it was not read", async () => {
    const deps = makeDeps({ a: "Narrative", c: new Error("nope") });
    const { result } = setup(
      deps,
      [folder("a", "A"), folder("c", "Child", 0, "a")],
      [source("s", "a")],
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.narratives).toEqual([
      { folderId: "a", name: "A", variantCount: null },
    ]);
    expect(state.notRead.map((n) => n.folderId)).toEqual(["c"]);
  });

  it("names the other subtypes when no folder carries Narrative", async () => {
    const deps = makeDeps({ a: "Tale", b: "tale ", c: "Place", d: undefined });
    const { result } = setup(deps, [
      folder("a", "A"),
      folder("b", "B", 1),
      folder("c", "C", 2),
      folder("d", "D", 3),
    ]);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.narratives).toEqual([]);
    expect(state.nearMiss).toEqual({
      status: "names",
      names: ["Tale", "Place"],
    });
  });

  it("returns the near-miss line as a failure when a read failed and no narrative is listed", async () => {
    const deps = makeDeps({ a: "Tale", b: new Error("bad") });
    const { result } = setup(deps, [folder("a", "A"), folder("b", "B", 1)]);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.nearMiss.status).toBe("failed");
    expect(state.notRead).toHaveLength(1);
  });

  it("is ready and empty when there are no folders, reading nothing", async () => {
    const deps = makeDeps({});
    const { result } = setup(deps, []);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(ready(result).narratives).toEqual([]);
    expect(ready(result).nearMiss).toEqual({ status: "none" });
    expect(deps.getFolderMetadata).not.toHaveBeenCalled();
  });

  it("raises the locked state and opens the unlock prompt", async () => {
    const deps = makeDeps({ a: new ProjectLockedError(PROJECT_ID) });
    const { result } = setup(deps, [folder("a", "A")]);
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({
      status: "failed",
      isLocked: true,
    });
    await waitFor(() => expect(result.current.unlock.isPromptShown).toBe(true));
  });

  it("refuses the prompt with the desktop message when unlocking is limited", async () => {
    const deps = makeDeps({ a: new ProjectLockedError(PROJECT_ID) });
    const { result } = setup(deps, [folder("a", "A")], [], {
      state: {
        state: "paired",
        limits: {
          locking: false,
          unlocking: true,
          encryptionChanges: false,
          projectDeletion: false,
          permanentDeletion: false,
        },
      },
    });
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.unlock.isPromptShown).toBe(false);
    expect(result.current.unlock.refusal).toBe(UNLOCK_AT_DESKTOP_MESSAGE);
  });

  it("writes nothing to the store", async () => {
    const deps = makeDeps({ a: "Narrative" });
    const { result, store } = setup(deps, [folder("a", "A")]);
    const before = JSON.stringify(store.getState().resources);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(JSON.stringify(store.getState().resources)).toBe(before);
  });
});
