/**
 * @vitest-environment jsdom
 *
 * Feature 121 (Task 28, FR-17): a document marked as merged is left out of the
 * Compile dialog and the Compile Entity Resources dialog, the dialog says so,
 * nothing offers a per-run override and nothing is written to compileDefaults.
 *
 * Not shown: the server compile (it takes the client's ids and reads no
 * sidecar for membership, `experiments/task-3.md`); no CLI compile exists.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import EntityCompileSection from "../../components/Sidebar/EntityCompileSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type { CompileFormat } from "../../components/common/CompilePreviewModal";
import { COMPILE_MERGED_NOTICE } from "../../src/lib/models/merge-messages";
import { runCompileAndDownload } from "../../src/lib/compile/run-compile-and-download";

vi.mock("../../src/lib/compile/run-compile-and-download", () => ({
  runCompileAndDownload: vi.fn().mockResolvedValue(undefined),
}));
const runCompileMock = vi.mocked(runCompileAndDownload);

const MARK = {
  targetId: "target",
  snapshotRevisionId: "rev-1",
  date: "2026-11-15",
};
const NOTICE = COMPILE_MERGED_NOTICE;

function doc(id: string, extra: Record<string, unknown> = {}): AnyResource {
  const res = createTextResource({ name: `Doc ${id}` });
  Object.assign(res, { id }, extra);
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
  runCompileMock.mockClear();
});

function renderDialog(
  resources: AnyResource[],
  overrides: Partial<React.ComponentProps<typeof CompilePreviewModal>> = {},
) {
  const onConfirmCompile = vi.fn();
  const saveDefaults = vi.fn().mockResolvedValue(undefined);
  render(
    <CompilePreviewModal
      isOpen
      projectId="proj-1"
      resources={resources}
      readSavedDefaults={async () => []}
      saveDefaults={saveDefaults}
      onConfirmCompile={onConfirmCompile}
      {...overrides}
    />,
  );
  return { onConfirmCompile, saveDefaults };
}

describe("Compile dialog (FR-17)", () => {
  it.each<CompileFormat>(["txt", "md", "pdf", "docx"])(
    "leaves a marked document out of the compile list in %s",
    async (format) => {
      const { onConfirmCompile } = renderDialog([
        doc("a"),
        doc("b", { mergedMark: MARK }),
      ]);
      expect(screen.queryByText("Doc b")).not.toBeInTheDocument();
      expect(screen.getByText("Doc a")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Compile as"), {
        target: { value: format },
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /Compile \(1\)/ }),
        ).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: /Compile \(1\)/ }));
      expect(onConfirmCompile).toHaveBeenCalledWith(
        ["a"],
        expect.objectContaining({ format }),
      );
    },
  );

  it("states the exclusion when a marked document exists", () => {
    renderDialog([doc("a"), doc("b", { mergedMark: MARK })]);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("states the exclusion in entity mode when an associated document is marked", () => {
    renderDialog([doc("a"), doc("b", { mergedMark: MARK })], {
      entityMode: {
        entries: [{ resourceId: "a", name: "Doc a", resourceType: "text" }],
        orderedResourceIds: ["a"],
        candidateResourceIds: ["a", "b"],
      },
    });
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("states nothing in entity mode when only an unassociated document is marked", () => {
    renderDialog([doc("a"), doc("b", { mergedMark: MARK })], {
      entityMode: {
        entries: [{ resourceId: "a", name: "Doc a", resourceType: "text" }],
        orderedResourceIds: ["a"],
        candidateResourceIds: ["a"],
      },
    });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("states nothing when no document is marked", () => {
    renderDialog([doc("a")]);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("offers no control to include a marked document for a run", () => {
    renderDialog([doc("a"), doc("b", { mergedMark: MARK })]);
    expect(screen.queryByRole("checkbox", { name: /Doc b/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getByRole("button", { name: /Compile \(1\)/ })).toBeVisible();
  });

  it("writes nothing to compileDefaults", async () => {
    const { saveDefaults } = renderDialog([
      doc("a"),
      doc("b", { mergedMark: MARK }),
    ]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Compile \(1\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Compile \(1\)/ }));
    expect(saveDefaults).not.toHaveBeenCalled();
  });

  it("treats an unmarked document excluded by a saved default as before", async () => {
    renderDialog([doc("a"), doc("c")], {
      readSavedDefaults: async () => ["c"],
    });
    await waitFor(() =>
      expect(screen.getByText(/1 resource\(s\) selected/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

describe("Compile Entity Resources dialog (FR-17)", () => {
  it("leaves a marked document out of the entity list and the compile", async () => {
    const store = makeStore();
    store.dispatch(
      setProject({ id: "p1", name: "Test Project", rootPath: "/tmp/p" }),
    );
    store.dispatch(setSelectedProjectId("p1"));
    const entity = doc("entity-1", { entityKind: "character" });
    store.dispatch(
      setResources([entity, doc("a"), doc("b", { mergedMark: MARK })]),
    );
    store.dispatch(setSelectedResourceId("entity-1"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input.toString().includes("/mentioned-in")) {
        const row = (resourceId: string) => ({
          resourceId,
          name: resourceId,
          isLinked: true,
          isMentioned: false,
          snippets: [],
          offsets: [],
          ambiguousWith: [],
        });
        return {
          ok: true,
          json: async () => ({ mentionedIn: [row("a"), row("b")] }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityCompileSection />
        </EntityMentionsProvider>
      </Provider>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Compile this entity's resources",
      }),
    );
    expect(await screen.findByText("Doc a")).toBeInTheDocument();
    expect(screen.queryByText("Doc b")).not.toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Compile \(1\)/ }));
    await waitFor(() => expect(runCompileMock).toHaveBeenCalled());
    expect(runCompileMock.mock.calls[0][0].resourceIds).toEqual(["a"]);
  });

  it("states nothing when the merged document is not one of the entity's", async () => {
    const store = makeStore();
    store.dispatch(
      setProject({ id: "p1", name: "Test Project", rootPath: "/tmp/p" }),
    );
    store.dispatch(setSelectedProjectId("p1"));
    const entity = doc("entity-1", { entityKind: "character" });
    store.dispatch(
      setResources([entity, doc("a"), doc("b", { mergedMark: MARK })]),
    );
    store.dispatch(setSelectedResourceId("entity-1"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input.toString().includes("/mentioned-in")) {
        return {
          ok: true,
          json: async () => ({
            mentionedIn: [
              {
                resourceId: "a",
                name: "a",
                isLinked: true,
                isMentioned: false,
                snippets: [],
                offsets: [],
                ambiguousWith: [],
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityCompileSection />
        </EntityMentionsProvider>
      </Provider>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Compile this entity's resources",
      }),
    );
    expect(await screen.findByText("Doc a")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
