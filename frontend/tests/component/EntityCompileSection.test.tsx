import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityCompileSection from "../../components/Sidebar/EntityCompileSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
  getProjectDirectoryId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource, Folder } from "../../src/lib/models/types";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import { runCompileAndDownload } from "../../src/lib/compile/run-compile-and-download";

vi.mock("../../src/lib/compile/run-compile-and-download", () => ({
  runCompileAndDownload: vi.fn().mockResolvedValue(undefined),
}));

const runCompileAndDownloadMock = vi.mocked(runCompileAndDownload);

const PROJECT_PATH = "/tmp/test-project";

function setupStore(resourceId: string, overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "proj-test-1",
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId("proj-test-1"));
  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = resourceId;
  Object.assign(res, { entityKind: "character" }, overrides);
  store.dispatch(setResources([res]));
  store.dispatch(setSelectedResourceId(resourceId));
  return store;
}

function mockMentionedIn(mentionedIn: EntityMentionedIn[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  runCompileAndDownloadMock.mockClear();
});

/**
 * The entity-scoped compile trigger, split out of `EntityMentionsSection`
 * so it can render outside the collapsible "Entity Mentions" section (see
 * `EntityCompileSection.tsx`). These assertions moved here wholesale with
 * that component; the behaviour under test is unchanged, only the component
 * that owns it and the provider supplying its rows.
 */
describe("EntityCompileSection", () => {
  it("disables the compile trigger with a visible explanation when there are no associated resources", async () => {
    mockMentionedIn([]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityCompileSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    expect(
      screen.queryByLabelText("entity-mentions-list"),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "Compile this entity's resources",
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("No associated resources to compile."),
    ).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      screen.queryByTestId("compile-preview-modal"),
    ).not.toBeInTheDocument();
  });

  describe("entity-scoped compile trigger", () => {
    function makeResource(
      id: string,
      name: string,
      orderIndex: number,
      type: AnyResource["type"] = "text",
    ): AnyResource {
      const res = createTextResource({ name });
      (res as unknown as { id: string }).id = id;
      Object.assign(res, { orderIndex, type });
      return res as AnyResource;
    }

    function setupStoreWithResources(
      entityId: string,
      resources: AnyResource[],
    ) {
      const store = makeStore();
      store.dispatch(
        setProject({
          id: "proj-test-1",
          name: "Test Project",
          rootPath: PROJECT_PATH,
        }),
      );
      store.dispatch(setSelectedProjectId("proj-test-1"));
      const entity = createTextResource({ name: "Aria" });
      (entity as unknown as { id: string }).id = entityId;
      Object.assign(entity, { entityKind: "character" });
      store.dispatch(setResources([entity, ...resources]));
      store.dispatch(setSelectedResourceId(entityId));
      return store;
    }

    it("is enabled, keyboard-operable, and has an accessible name when rows exist", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ]);
      const resources = [makeResource("res-b", "Scene B", 0)];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsProvider>
            <EntityCompileSection />
          </EntityMentionsProvider>
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      expect(trigger).not.toBeDisabled();

      trigger.focus();
      expect(trigger).toHaveFocus();
      fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
      fireEvent.click(trigger);

      expect(
        await screen.findByTestId("compile-preview-modal"),
      ).toBeInTheDocument();
    });

    it("opens the modal pre-populated with the FR-2 merged set in FR-3 tree order", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: ["mentioned"],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
        {
          resourceId: "res-a",
          name: "Scene A",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ]);
      // Tree order (by orderIndex) is A then B, opposite of fetch order.
      const resources = [
        makeResource("res-a", "Scene A", 0),
        makeResource("res-b", "Scene B", 1),
      ];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsProvider>
            <EntityCompileSection />
          </EntityMentionsProvider>
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const listItems = await screen.findAllByTestId(
        "entity-compile-resource-list-item",
      );
      expect(listItems).toHaveLength(2);
      expect(listItems[0]).toHaveTextContent("Scene A");
      expect(listItems[1]).toHaveTextContent("Scene B");
    });

    it("calls runCompileAndDownload with exactly the ordered merged-set ids on confirm", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
        {
          resourceId: "res-a",
          name: "Scene A",
          snippets: ["mentioned"],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
      ]);
      const resources = [
        makeResource("res-a", "Scene A", 0),
        makeResource("res-b", "Scene B", 1),
      ];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsProvider>
            <EntityCompileSection />
          </EntityMentionsProvider>
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const compileButton = await screen.findByRole("button", {
        name: /Compile \(2\)/,
      });
      fireEvent.click(compileButton);

      await waitFor(() => {
        expect(runCompileAndDownloadMock).toHaveBeenCalledTimes(1);
      });
      const [compileBody] = runCompileAndDownloadMock.mock.calls[0];
      expect(compileBody.resourceIds).toEqual(["res-a", "res-b"]);
      expect(compileBody.projectId).toBe(getProjectDirectoryId(PROJECT_PATH));
      expect(compileBody.projectName).toBe("Test Project");
    });

    // Regression (FR-3): `buildResourceTree` resolves a resource's `folderId`
    // against folder entries in the *same* array and silently re-parents to
    // root anything whose parent is absent. Passing only the resources slice
    // therefore flattens the tree, and the depth-first walk degrades into a
    // global `orderIndex` sort — which put same-folder siblings far apart in
    // the real app while every existing test still passed, because those
    // fixtures had no folders at all.
    //
    // Both folders here hold an orderIndex-0 and an orderIndex-1 scene, so
    // the two orderings are distinguishable:
    //   depth-first (correct): f1s1, f1s2, f2s1, f2s2
    //   global orderIndex sort (bug): f1s1, f2s1, f1s2, f2s2
    it("orders resources depth-first by folder, not by a flat orderIndex sort (FR-3)", async () => {
      mockMentionedIn(
        ["f2s2", "f1s2", "f2s1", "f1s1"].map((id) => ({
          resourceId: id,
          name: id,
          snippets: [],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        })),
      );

      const folder = (id: string, orderIndex: number): Folder =>
        ({
          id,
          slug: id,
          name: id,
          type: "folder",
          createdAt: "",
          updatedAt: "",
          userMetadata: {},
          orderIndex,
        }) as unknown as Folder;

      const inFolder = (
        id: string,
        folderId: string,
        orderIndex: number,
      ): AnyResource => {
        const res = makeResource(id, id, orderIndex);
        Object.assign(res, { folderId });
        return res;
      };

      const store = setupStoreWithResources("entity-aria", [
        inFolder("f1s1", "folder-1", 0),
        inFolder("f1s2", "folder-1", 1),
        inFolder("f2s1", "folder-2", 0),
        inFolder("f2s2", "folder-2", 1),
      ]);
      store.dispatch(
        setFolders([folder("folder-1", 0), folder("folder-2", 1)]),
      );

      render(
        <Provider store={store}>
          <EntityMentionsProvider>
            <EntityCompileSection />
          </EntityMentionsProvider>
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const compileButton = await screen.findByRole("button", {
        name: /Compile \(4\)/,
      });
      fireEvent.click(compileButton);

      await waitFor(() => {
        expect(runCompileAndDownloadMock).toHaveBeenCalledTimes(1);
      });
      const [compileBody] = runCompileAndDownloadMock.mock.calls[0];
      expect(compileBody.resourceIds).toEqual(["f1s1", "f1s2", "f2s1", "f2s2"]);
    });
  });
});
