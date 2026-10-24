/** @vitest-environment jsdom */
/**
 * Experiment E-4 (Feature 93, Task 2), sender half. NOT part of the suite.
 *
 * Mounts the real `app/(app)/page.tsx` (construction of
 * frontend/tests/page-stale-sidecar-save.test.tsx; only StartPage, TipTapEditor,
 * openProject/listProjects and `updateSidecar` are mocked). The project payload
 * returned by `openProject` carries the page copy written by
 * e4-key-inventory.test.ts ($E4_PAGE_COPY_IN: the real server open-project
 * resource object). Drives the five production senders in turn and records the
 * argument keys of every `updateSidecar` call to $E4_SENDERS_OUT.
 * Senders: EntitySection (entity kind), page.tsx (custom field -> userMetadata),
 * SubtypeSection, WordCountGoalSection, RemoveEntityControl.
 */
import fs from "node:fs";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../../../frontend/src/store/store";
import { setSelectedResourceId as setResourceId } from "../../../../frontend/src/store/resourcesSlice";
import TrashRefreshProvider from "../../../../frontend/components/Layout/TrashRefreshContext";
import { setupAppShellFetchStub } from "../../../../frontend/tests/helpers/appShellFetchStub";

const { updateSidecarMock, pageCopy } = vi.hoisted(() => {
  const raw = JSON.parse(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").readFileSync(
      process.env.E4_PAGE_COPY_IN as string,
      "utf8",
    ),
  ) as { pageCopy: Record<string, unknown> };
  return { updateSidecarMock: vi.fn(), pageCopy: raw.pageCopy };
});

vi.mock("../../../../frontend/components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

vi.mock("../../../../frontend/src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../frontend/src/lib/api/resources")
  >("../../../../frontend/src/lib/api/resources");
  return {
    ...actual,
    updateSidecar: (...args: unknown[]) => updateSidecarMock(...args),
  };
});

vi.mock("../../../../frontend/components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

vi.mock(
  "../../../../frontend/src/lib/api/projects",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../frontend/src/lib/api/projects")
    >()),
    listProjects: vi.fn().mockResolvedValue([]),
    openProject: vi
      .fn()
      .mockResolvedValue({
        project: {
          id: "project-internal-id",
          name: "E4 Project",
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
        resources: [pageCopy],
      }),
  }),
);

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../../../../frontend/components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

setupAppShellFetchStub();

describe("E-4 sender payload keys", () => {
  it("records the keys each production sender sends", async () => {
    updateSidecarMock.mockResolvedValue(undefined);
    const { default: Page } =
      await import("../../../../frontend/app/(app)/page");
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
    store.dispatch(setResourceId(pageCopy.id as string));

    const record: Record<string, unknown>[] = [];
    const step = async (sender: string, act: () => void | Promise<void>) => {
      const before = updateSidecarMock.mock.calls.length;
      await act();
      await waitFor(() =>
        expect(updateSidecarMock.mock.calls.length).toBeGreaterThan(before),
      );
      const call = updateSidecarMock.mock.calls[before] as unknown[];
      const payload = call[2] as Record<string, unknown>;
      record.push({
        sender,
        payloadKeys: Object.keys(payload).sort(),
        clearKeys: call[3] ?? null,
      });
    };

    await step("EntitySection (entity kind)", async () => {
      fireEvent.change(await screen.findByLabelText("entity-kind-input"), {
        target: { value: "character" },
      });
    });
    await step("page.tsx updateResource (custom field)", async () => {
      fireEvent.change(await screen.findByLabelText("mood"), {
        target: { value: "calm" },
      });
    });
    await step("SubtypeSection", async () => {
      fireEvent.change(
        await screen.findByRole("combobox", { name: "Subtype" }),
        { target: { value: "Scene" } },
      );
    });
    await step("WordCountGoalSection", async () => {
      fireEvent.change(await screen.findByLabelText("word-count-goal-input"), {
        target: { value: "500" },
      });
    });
    await step("RemoveEntityControl", async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "Remove Entity" }),
      );
      const confirm = (await screen.findByText("Remove")) as HTMLButtonElement;
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.click(confirm);
    });

    if (process.env.E4_SENDERS_OUT) {
      fs.writeFileSync(
        process.env.E4_SENDERS_OUT,
        JSON.stringify(
          { pageCopyKeys: Object.keys(pageCopy).sort(), record },
          null,
          1,
        ),
      );
    }
    expect(record.length).toBe(5);
  }, 60_000);
});
