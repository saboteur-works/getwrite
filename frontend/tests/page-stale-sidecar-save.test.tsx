import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { setSelectedResourceId as setResourceId } from "../src/store/resourcesSlice";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import type { AnyResource } from "../src/lib/models/types";

/**
 * MEASUREMENT (Feature 72, Task 2, FR-32 reproduction half). No fix here.
 *
 * RESULT: REPRODUCED (by the task's payload-level definition: the second
 * `updateSidecar` payload does not carry the `entityKind` that step 1 set).
 *
 * Mounted: the real `app/(app)/page.tsx` with the real `AppShell` and real
 * `MetadataSidebar`/`EntitySection` (full page; only `StartPage`,
 * `TipTapEditor`, `openProject`/`listProjects` and `updateSidecar` are
 * mocked). Project: `features.entities` on, one text resource, one custom
 * text field `mood`.
 *
 * Steps: (1) type "character" into `EntitySection`'s entity-kind input;
 * (2) type "calm" into the custom `mood` field; (3) inspect both calls.
 *
 * Observed `updateSidecar` call 1 (EntitySection.persist), args after the
 * resource id and project directory id:
 *   resource = { id: "res-1", name: "Chapter One", type: "text",
 *     folderId: null, orderIndex: 0, userMetadata: {},
 *     entityKind: "character" }, clearKeys = undefined
 * Observed call 2 (page.tsx updateResource, via the `mood` field):
 *   resource = { id: "res-1", name: "Chapter One", type: "text",
 *     folderId: null, orderIndex: 0, userMetadata: { mood: "calm" } }
 *   (no `entityKind` key)
 * Redux resource after both calls: userMetadata { mood: "calm" } and
 * entityKind "character".
 *
 * NOT measured here: what the server stores. This test mocks
 * `updateSidecar`, so the persisted sidecar after call 2 was not observed.
 * No cause is asserted; the test only pins the observed payloads, as a
 * measurement of current behaviour.
 */

const updateSidecarMock = vi.fn();

vi.mock("../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/api/resources")
  >("../src/lib/api/resources");
  return {
    ...actual,
    updateSidecar: (...args: unknown[]) => updateSidecarMock(...args),
  };
});

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock("../src/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/projects")>()),
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "Stale Sidecar Project",
        rootPath: "/projects/proj-dir-id",
        config: {
          features: { entities: true },
          subtypes: ["Scene", "Profile"],
          metadataSchema: {
            groups: [
              {
                id: "custom-group",
                label: "Custom",
                fields: [{ key: "mood", label: "Mood", type: "text" }],
              },
            ],
          },
        },
      },
      folders: [],
      resources: [
        {
          id: "res-1",
          name: "Chapter One",
          type: "text",
          folderId: null,
          orderIndex: 0,
          userMetadata: {},
        },
      ],
    }),
}));

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

setupAppShellFetchStub();

beforeEach(() => {
  updateSidecarMock.mockReset();
  updateSidecarMock.mockResolvedValue({
    updatedAt: "2026-10-08T00:00:00.000Z",
  });
});

describe("page.tsx stale sidecar save (Feature 72 Task 2, FR-32)", () => {
  it("pins the observed updateSidecar payloads for entityKind then a custom field edit (measurement of current behaviour)", async () => {
    const { default: Page } = await import("../app/(app)/page");
    const store = makeStore();
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );

    await waitFor(() =>
      expect(store.getState().resources.resources.length).toBe(1),
    );
    store.dispatch(setResourceId("res-1"));

    const kindInput = await screen.findByLabelText("entity-kind-input");
    fireEvent.change(kindInput, { target: { value: "character" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));

    const moodInput = await screen.findByLabelText("mood");
    fireEvent.change(moodInput, { target: { value: "calm" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(2));

    const [first, second] = updateSidecarMock.mock.calls as unknown[][];
    const baseResource = {
      id: "res-1",
      name: "Chapter One",
      type: "text",
      folderId: null,
      orderIndex: 0,
    };

    // Measurement of current behaviour, not a statement of desired behaviour.
    expect(first.slice(0, 3)).toEqual([
      "res-1",
      "proj-dir-id",
      { ...baseResource, userMetadata: {}, entityKind: "character" },
    ]);
    expect(first[3]).toBeUndefined();
    expect(second).toEqual([
      "res-1",
      "proj-dir-id",
      { ...baseResource, userMetadata: { mood: "calm" } },
    ]);
    expect(second[2]).not.toHaveProperty("entityKind");

    const redux = store.getState().resources.resources as AnyResource[];
    expect(redux[0]).toMatchObject({
      entityKind: "character",
      userMetadata: { mood: "calm" },
    });
  });
});

/**
 * FR-32 regression half (Feature 72, Task 11), for the SUBTYPE key only. The
 * Task 2 measurement above is deliberately left as is for `entityKind`.
 */
import { openProject } from "../src/lib/api/projects";

function projectPayload(resourceSubtype: string): unknown {
  return {
    project: {
      id: "project-internal-id",
      name: "Stale Sidecar Project",
      rootPath: "/projects/proj-dir-id",
      config: {
        features: { entities: true },
        subtypes: ["Scene", "Profile"],
        metadataSchema: {
          groups: [
            {
              id: "custom-group",
              label: "Custom",
              fields: [{ key: "mood", label: "Mood", type: "text" }],
            },
          ],
        },
      },
    },
    folders: [],
    resources: [
      {
        id: "res-1",
        name: "Chapter One",
        type: "text",
        folderId: null,
        orderIndex: 0,
        userMetadata: {},
        resourceSubtype,
      },
    ],
  };
}

async function mountPageWithResourceSelected(initialSubtype?: string) {
  if (initialSubtype !== undefined) {
    // The resource is loaded already carrying a subtype, so the page's own
    // local copy of it holds that value from the start.
    vi.mocked(openProject).mockResolvedValueOnce(
      projectPayload(initialSubtype) as Awaited<ReturnType<typeof openProject>>,
    );
  }
  const { default: Page } = await import("../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() =>
    expect(store.getState().resources.resources.length).toBe(1),
  );
  store.dispatch(setResourceId("res-1"));
  const subtypeSelect = (await screen.findByRole("combobox", {
    name: "Subtype",
  })) as HTMLSelectElement;
  return { store, subtypeSelect };
}

describe("page.tsx subtype write is not undone by a later field edit (Feature 72 Task 11, FR-32)", () => {
  it("set A, change to B, then edit a custom field: the final updateSidecar payload carries B and the stored subtype is B", async () => {
    const { store, subtypeSelect } = await mountPageWithResourceSelected();

    fireEvent.change(subtypeSelect, { target: { value: "Scene" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(subtypeSelect.value).toBe("Scene"));

    fireEvent.change(subtypeSelect, { target: { value: "Profile" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(subtypeSelect.value).toBe("Profile"));

    fireEvent.change(await screen.findByLabelText("mood"), {
      target: { value: "calm" },
    });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(3));

    const calls = updateSidecarMock.mock.calls as unknown[][];
    expect(calls[0][2]).toEqual({ resourceSubtype: "Scene" });
    expect(calls[1][2]).toEqual({ resourceSubtype: "Profile" });
    expect(calls[2][2]).toMatchObject({
      userMetadata: { mood: "calm" },
      resourceSubtype: "Profile",
    });
    const redux = store.getState().resources.resources as AnyResource[];
    expect(redux[0].resourceSubtype).toBe("Profile");
  });

  it("set a subtype, clear it, then edit a custom field: the final payload carries no subtype and the stored subtype stays absent", async () => {
    const { store, subtypeSelect } = await mountPageWithResourceSelected();

    fireEvent.change(subtypeSelect, { target: { value: "Scene" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(subtypeSelect.value).toBe("Scene"));

    fireEvent.change(subtypeSelect, { target: { value: "" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(subtypeSelect.value).toBe(""));

    fireEvent.change(await screen.findByLabelText("mood"), {
      target: { value: "calm" },
    });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(3));

    const calls = updateSidecarMock.mock.calls as unknown[][];
    expect(calls[1][2]).toEqual({});
    expect(calls[1][3]).toEqual(["resourceSubtype"]);
    expect(calls[2][2]).toMatchObject({ userMetadata: { mood: "calm" } });
    expect(calls[2][2]).not.toHaveProperty("resourceSubtype");
    const redux = store.getState().resources.resources as AnyResource[];
    expect(redux[0].resourceSubtype).toBeUndefined();
  });
});

describe("page.tsx subtype write when the resource was loaded already carrying a subtype (Feature 72 Task 11, FR-32)", () => {
  it("stored Scene, change to Profile, then edit a custom field: the final payload carries Profile, not the loaded Scene", async () => {
    const { store, subtypeSelect } =
      await mountPageWithResourceSelected("Scene");
    await waitFor(() => expect(subtypeSelect.value).toBe("Scene"));

    fireEvent.change(subtypeSelect, { target: { value: "Profile" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(subtypeSelect.value).toBe("Profile"));

    fireEvent.change(await screen.findByLabelText("mood"), {
      target: { value: "calm" },
    });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(2));

    const calls = updateSidecarMock.mock.calls as unknown[][];
    expect(calls[0][2]).toEqual({ resourceSubtype: "Profile" });
    expect(calls[1][2]).toMatchObject({
      userMetadata: { mood: "calm" },
      resourceSubtype: "Profile",
    });
    const redux = store.getState().resources.resources as AnyResource[];
    expect(redux[0].resourceSubtype).toBe("Profile");
  });

  it("stored Scene, clear it, then edit a custom field: the final payload carries no subtype", async () => {
    const { store, subtypeSelect } =
      await mountPageWithResourceSelected("Scene");
    await waitFor(() => expect(subtypeSelect.value).toBe("Scene"));

    fireEvent.change(subtypeSelect, { target: { value: "" } });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(subtypeSelect.value).toBe(""));

    fireEvent.change(await screen.findByLabelText("mood"), {
      target: { value: "calm" },
    });
    await waitFor(() => expect(updateSidecarMock).toHaveBeenCalledTimes(2));

    const calls = updateSidecarMock.mock.calls as unknown[][];
    expect(calls[0][3]).toEqual(["resourceSubtype"]);
    expect(calls[1][2]).toMatchObject({ userMetadata: { mood: "calm" } });
    expect(calls[1][2]).not.toHaveProperty("resourceSubtype");
    const redux = store.getState().resources.resources as AnyResource[];
    expect(redux[0].resourceSubtype).toBeUndefined();
  });
});
