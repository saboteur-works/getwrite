/** @vitest-environment jsdom */
/**
 * Feature 108, Task 23 (FR-16, FR-17): the Claims tab's data hook, with a
 * fake client. A failed list is a failure state, never an empty list.
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
import {
  useClaimList,
  type ClaimListDeps,
  type OpenClaimRequest,
} from "../../components/Claims/useClaimList";
import { UNLOCK_AT_DESKTOP_MESSAGE } from "../../components/Sharing/sharing-copy";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import type { Annotation } from "../../src/lib/models";
import type { ClaimListResult } from "../../src/lib/models/claim-types";
import type { TrashListing } from "../../src/lib/api/trash";
import {
  fetchEncryptionStatus,
  unlockWorkspaceRequest,
} from "../../src/lib/api/encryption";

vi.mock("../../src/lib/api/encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/encryption")>()),
  unlockWorkspaceRequest: vi.fn(),
  fetchEncryptionStatus: vi.fn(),
}));

const PROJECT_ID = "proj-claims";

function claim(id: string, over: Partial<Annotation> = {}): Annotation {
  return {
    id,
    body: `statement ${id}`,
    quote: `quote ${id}`,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-01T12:00:00.000Z",
    },
    ...over,
  };
}

function entry(
  resourceId: string,
  annotation: Annotation,
  resourceName = "One",
): ClaimListResult["claims"][number] {
  return { resourceId, resourceName, annotation };
}

const EMPTY_TRASH: TrashListing = { resources: [], folders: [] };

function tipTapWithMark(id: string): unknown {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "hello",
            marks: [{ type: "annotation", attrs: { id } }],
          },
        ],
      },
    ],
  };
}

function makeDeps(over: Partial<ClaimListDeps> = {}): ClaimListDeps {
  return {
    listClaims: vi
      .fn<ClaimListDeps["listClaims"]>()
      .mockResolvedValue({ claims: [], failures: [], sidecarsRead: 0 }),
    listTrash: vi
      .fn<ClaimListDeps["listTrash"]>()
      .mockResolvedValue(EMPTY_TRASH),
    fetchContent: vi
      .fn<ClaimListDeps["fetchContent"]>()
      .mockResolvedValue({ resourceContent: { tipTapContent: null } }),
    ...over,
  };
}

function withClaims(
  claims: ClaimListResult["claims"],
  over: Partial<ClaimListDeps> = {},
): ClaimListDeps {
  return makeDeps({
    listClaims: vi
      .fn<ClaimListDeps["listClaims"]>()
      .mockResolvedValue({ claims, failures: [], sidecarsRead: 0 }),
    ...over,
  });
}

function setup(
  deps: ClaimListDeps,
  openClaim: (r: OpenClaimRequest) => void = vi.fn(),
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
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <StaticSharingLimitsProvider value={limits}>
        {children}
      </StaticSharingLimitsProvider>
    </Provider>
  );
  const hook = renderHook(() => useClaimList({ deps, openClaim }), { wrapper });
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

describe("useClaimList loading and ready", () => {
  it("is loading, then ready with the claims and the not-read resources", async () => {
    const list: ClaimListResult = {
      claims: [entry("r1", claim("a"))],
      failures: [{ resourceId: "r2", resourceName: "Two", message: "bad" }],
      sidecarsRead: 2,
    };
    const deps = makeDeps({ listClaims: vi.fn().mockResolvedValue(list) });
    const { result } = setup(deps);
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(deps.listClaims).toHaveBeenCalledWith(PROJECT_ID);
    expect(state.claims).toHaveLength(1);
    expect(state.claims[0]).toMatchObject({
      resourceId: "r1",
      resourceName: "One",
      display: {
        kind: "claim",
        statement: "statement a",
        statusLabel: "Unverified",
      },
    });
    expect(state.notRead).toEqual(list.failures);
  });

  it("with no claims and no failures is ready and empty, saying so", async () => {
    const { result } = setup(makeDeps());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(ready(result).claims).toEqual([]);
    expect(result.current.emptyMessage).toBe("There are no claims.");
  });
});

describe("useClaimList failure", () => {
  it("is a failure state, never an empty list, and retry reads again", async () => {
    const listClaims = vi
      .fn<ClaimListDeps["listClaims"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        claims: [entry("r1", claim("a"))],
        failures: [],
        sidecarsRead: 1,
      });
    const { result } = setup(makeDeps({ listClaims }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({
      status: "failed",
      isLocked: false,
      message: "boom",
    });
    expect(result.current.emptyMessage).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(ready(result).claims).toHaveLength(1);
    expect(listClaims).toHaveBeenCalledTimes(2);
  });

  it("falls back to fixed text for an error with no message", async () => {
    const { result } = setup(
      makeDeps({ listClaims: vi.fn().mockRejectedValue(new Error("")) }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({
      message: "The claims could not be read.",
    });
  });
});

describe("useClaimList locked project", () => {
  const lockedDeps = (): ClaimListDeps =>
    makeDeps({
      listClaims: vi
        .fn<ClaimListDeps["listClaims"]>()
        .mockRejectedValueOnce(new ProjectLockedError(PROJECT_ID))
        .mockResolvedValue({ claims: [], failures: [], sidecarsRead: 0 }),
    });

  it("opens the unlock prompt and is a locked failure, not an empty list", async () => {
    const { result } = setup(lockedDeps());
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({ isLocked: true });
    expect(result.current.unlock.isPromptShown).toBe(true);
    act(() => result.current.unlock.decline());
    expect(result.current.unlock.isPromptShown).toBe(false);
  });

  it("does not open the prompt for a paired device with unlocking limited, and says why", async () => {
    const { result } = setup(lockedDeps(), vi.fn(), {
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

  it("sends the passphrase, closes the prompt and reads the list again", async () => {
    vi.mocked(unlockWorkspaceRequest).mockResolvedValue({
      isAvailable: true,
      hasKeyring: true,
      isUnlocked: true,
      encryptedProjectIds: [PROJECT_ID],
    } as never);
    const deps = lockedDeps();
    const { result } = setup(deps);
    await waitFor(() => expect(result.current.unlock.isPromptShown).toBe(true));
    await act(async () => {
      await result.current.unlock.submit("pass");
    });
    expect(unlockWorkspaceRequest).toHaveBeenCalledWith("pass");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.unlock.isPromptShown).toBe(false);
    expect(deps.listClaims).toHaveBeenCalledTimes(2);
  });
});

describe("useClaimList Trash", () => {
  it("does not list a claim of a Trash resource as live, and counts it", async () => {
    const listing = {
      resources: [{ id: "r-trash" }],
      folders: [{ id: "f", descendants: [{ id: "r-nested" }] }],
    } as unknown as TrashListing;
    const { result } = setup(
      withClaims(
        [
          entry("r-live", claim("a"), "L"),
          entry("r-trash", claim("b"), "T"),
          entry("r-nested", claim("c"), "N"),
        ],
        { listTrash: vi.fn().mockResolvedValue(listing) },
      ),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = ready(result);
    expect(state.claims.map((c) => c.resourceId)).toEqual(["r-live"]);
    expect(state.inTrashCount).toBe(2);
    expect(state.isTrashChecked).toBe(true);
  });

  it("keeps the claims but says Trash could not be checked when that read fails", async () => {
    const { result } = setup(
      withClaims([entry("r1", claim("a"))], {
        listTrash: vi.fn().mockRejectedValue(new Error("no")),
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(ready(result).claims).toHaveLength(1);
    expect(ready(result).isTrashChecked).toBe(false);
  });
});

describe("useClaimList filters", () => {
  it("filters through claim-display and states them and the no-match result in text", async () => {
    const { result } = setup(
      withClaims([
        entry("r1", claim("a")),
        entry(
          "r1",
          claim("b", {
            claim: {
              status: "verified",
              statusChangedAt: "2026-11-02T00:00:00.000Z",
            },
          }),
        ),
      ]),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.visibleClaims).toHaveLength(2);
    expect(result.current.filtersText).toBe("All claims");
    act(() =>
      result.current.setFilters({ status: "verified", sourced: "all" }),
    );
    expect(result.current.visibleClaims.map((c) => c.annotation.id)).toEqual([
      "b",
    ]);
    expect(result.current.filtersText).toBe("Status: Verified");
    act(() =>
      result.current.setFilters({ status: "disputed", sourced: "all" }),
    );
    expect(result.current.visibleClaims).toEqual([]);
    expect(result.current.emptyMessage).toMatch(/^No claim matches/);
  });
});

describe("useClaimList open", () => {
  async function openWith(
    content: unknown,
  ): Promise<{ openClaim: ReturnType<typeof vi.fn>; selected: string | null }> {
    const openClaim = vi.fn();
    const { result, store } = setup(
      withClaims([entry("r1", claim("a"))], {
        fetchContent: vi.fn().mockResolvedValue(content),
      }),
      openClaim,
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => {
      await result.current.open(ready(result).claims[0]);
    });
    return {
      openClaim,
      selected: store.getState().resources.selectedResourceId,
    };
  }

  it("asks the shell to open the resource and focus the annotation when the passage exists", async () => {
    const { openClaim, selected } = await openWith({
      resourceContent: { tipTapContent: tipTapWithMark("a") },
    });
    expect(openClaim).toHaveBeenCalledWith({
      resourceId: "r1",
      annotationId: "a",
      passage: "present",
    });
    expect(selected).toBe("r1");
  });

  it("opens the resource with the detached state when the passage is gone", async () => {
    const { openClaim, selected } = await openWith({
      resourceContent: { tipTapContent: tipTapWithMark("other") },
    });
    expect(openClaim).toHaveBeenCalledWith({
      resourceId: "r1",
      annotationId: "a",
      passage: "detached",
    });
    expect(selected).toBe("r1");
  });

  it("still opens the resource, reporting the passage as unknown, when the document cannot be read", async () => {
    const { openClaim } = await openWith(null);
    expect(openClaim).toHaveBeenCalledWith({
      resourceId: "r1",
      annotationId: "a",
      passage: "unknown",
    });
  });
});

describe("useClaimList Source state", () => {
  it("reports a Source whose facts could not be read as unchecked, not sourced or unsourced", async () => {
    const withTarget = claim("a", { target: { sourceId: "s1" } });
    const { result } = setup(
      withClaims([entry("r1", withTarget)], {
        citationFactsDeps: {
          listTrash: vi.fn().mockRejectedValue(new Error("x")),
          listAttachments: vi.fn().mockResolvedValue([]),
          listAnnotations: vi.fn().mockResolvedValue([]),
        },
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await waitFor(() => {
      const d = ready(result).claims[0].display;
      expect(d.sourceState).toBe("unchecked");
    });
    const d = ready(result).claims[0].display;
    expect(d.isSourced).toBe(false);
    expect(d.isUnsourced).toBe(false);
  });
});
