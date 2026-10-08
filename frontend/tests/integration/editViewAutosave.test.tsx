import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Provider } from "react-redux";
import EditView from "../../components/WorkArea/EditView";
import { makeStore } from "../../src/store/store";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { RevisionEntry } from "../../src/store/revisionsSlice";
import { toRevisionEntry } from "../../src/store/revision-normalization";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  copyResourceCore,
  createResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { listRevisions } from "../../src/lib/models/revision";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "../unit/helpers/project-creator";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

function seedRevisions(
  store: ReturnType<typeof makeStore>,
  resourceId: string,
  revisions: RevisionEntry[],
  currentRevisionId: string,
): void {
  store.dispatch({
    type: "revisions/loadRevisionsForSelectedResource/pending",
    meta: { arg: { resourceId } },
  });
  store.dispatch({
    type: "revisions/loadRevisionsForSelectedResource/fulfilled",
    payload: { resourceId, revisions, currentRevisionId },
  });
}

vi.mock("../../components/TipTapEditor", () => {
  return {
    __esModule: true,
    default: ({
      value,
      onChange,
    }: {
      value?: string;
      onChange?: (v: string, doc: { type: "doc"; content: unknown[] }) => void;
    }) => (
      <textarea
        data-testid="tiptap-mock"
        value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
        onChange={(e) =>
          onChange?.(e.target.value, { type: "doc", content: [] })
        }
      />
    ),
  };
});

function createRevisionEntry(resourceId: string): RevisionEntry {
  return {
    id: "rev-canonical",
    resourceId,
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    filePath: "/tmp/rev-canonical.json",
    isCanonical: true,
    displayName: "Canonical",
    isProtected: false,
  };
}

describe("EditView autosave integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows failure state and retries canonical autosave", async () => {
    const store = makeStore();
    const resource = createTextResource({
      name: "Draft",
      plainText: "Initial text",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (
            url.includes(`/api/resource/revision/${resource.id}`) &&
            init?.method === "PATCH"
          ) {
            return {
              ok: false,
              status: 500,
              json: async () => ({}),
            } as Response;
          }

          return { ok: false, status: 404, json: async () => ({}) } as Response;
        },
      );

    store.dispatch(
      setProject({
        id: "project-autosave",
        name: "Autosave Project",
        rootPath: "/tmp/project",
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId("project-autosave"));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));
    seedRevisions(
      store,
      resource.id,
      [createRevisionEntry(resource.id)],
      "rev-canonical",
    );

    render(
      <Provider store={store}>
        <EditView initialContent="Initial text" />
      </Provider>,
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId("tiptap-mock"), {
        target: { value: "Updated text" },
      });
    });

    expect(screen.getByText(/Autosave queued/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await Promise.resolve();
    });

    expect(screen.getByText(/Autosave failed/i)).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /Retry now/i });
    await act(async () => {
      fireEvent.click(retryButton);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const patchCalls = fetchMock.mock.calls.filter((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url.includes(`/api/resource/revision/${resource.id}`);
    });
    expect(patchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("sends the project directory basename as projectId, not StoredProject.id, when autosaving", async () => {
    const store = makeStore();
    const resource = createTextResource({
      name: "Draft",
      plainText: "Initial text",
    });

    // `id` (mirrors project.json's internal id) is deliberately different
    // from the trailing segment of `rootPath` (the on-disk directory
    // basename) to catch any call site that regresses to sending
    // `StoredProject.id` instead of the directory basename (see FR12 /
    // `selectActiveProjectDirectoryId`'s doc comment in `projectsSlice.ts`).
    const directoryBasename = "on-disk-directory-id";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (
            url.includes(`/api/resource/revision/${resource.id}`) &&
            init?.method === "PATCH"
          ) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ updatedAt: new Date().toISOString() }),
            } as Response;
          }

          return { ok: false, status: 404, json: async () => ({}) } as Response;
        },
      );

    store.dispatch(
      setProject({
        id: "project-json-internal-id-should-not-be-sent",
        name: "Autosave Project",
        rootPath: `/tmp/${directoryBasename}`,
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(
      setSelectedProjectId("project-json-internal-id-should-not-be-sent"),
    );
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));
    seedRevisions(
      store,
      resource.id,
      [createRevisionEntry(resource.id)],
      "rev-canonical",
    );

    render(
      <Provider store={store}>
        <EditView initialContent="Initial text" />
      </Provider>,
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId("tiptap-mock"), {
        target: { value: "Updated text" },
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await Promise.resolve();
    });

    const patchCall = fetchMock.mock.calls.find((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return (
        url.includes(`/api/resource/revision/${resource.id}`) &&
        call[1]?.method === "PATCH"
      );
    });
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall?.[1]?.body as string) as {
      projectId?: string;
      projectPath?: string;
      projectRoot?: string;
    };
    expect(body.projectId).toBe(directoryBasename);
    expect(body.projectPath).toBeUndefined();
    expect(body.projectRoot).toBeUndefined();
  });
});

/**
 * Feature 73, Task 5 (FR-32, automated half).
 *
 * Scope of what these cases show: the harness mocks the editor
 * (`TipTapEditor`) and the HTTP layer (`fetch`), so the first case proves only
 * that the editor autosaves a copy that HAS a canonical revision, using the
 * revision list `copyResourceCore` really produced. The server side of that
 * PATCH (writing into the copy's revision in place) is covered by Task 3's
 * `updateRevisionInPlace` assertion in `resource-copy-revision.test.ts`.
 */
describe("EditView autosave of a copied text resource", () => {
  let projectsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
    if (projectsDir) await removeDirRetry(projectsDir);
  });

  function patchCallsFor(
    fetchMock: ReturnType<typeof vi.spyOn>,
    resourceId: string,
  ): unknown[][] {
    return (fetchMock.mock.calls as unknown[][]).filter((call) => {
      const url = typeof call[0] === "string" ? call[0] : String(call[0]);
      return (
        url.includes(`/api/resource/revision/${resourceId}`) &&
        (call[1] as RequestInit | undefined)?.method === "PATCH"
      );
    });
  }

  function mockPatchOk(resourceId: string): ReturnType<typeof vi.spyOn> {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (
            url.includes(`/api/resource/revision/${resourceId}`) &&
            init?.method === "PATCH"
          ) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ updatedAt: new Date().toISOString() }),
            } as Response;
          }
          return { ok: false, status: 404, json: async () => ({}) } as Response;
        },
      );
  }

  async function editAndAdvance(): Promise<void> {
    await act(async () => {
      fireEvent.change(screen.getByTestId("tiptap-mock"), {
        target: { value: "Updated text" },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(2600);
      await Promise.resolve();
    });
  }

  it("PATCHes the copy's own canonical revision id, from the real output of copyResourceCore and listRevisions", async () => {
    // Real filesystem work runs on real timers; fake timers are enabled by the
    // suite's beforeEach, so switch back for setup and forward again after.
    vi.useRealTimers();
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-autosave-copy-"));
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    const projectId = generateUUID();
    const projectRoot = path.join(projectsDir, projectId);
    await createAndAssertProject(SPEC_PATH, {
      projectRoot,
      name: "Autosave Copy",
    });
    const source = await createResourceCore(projectId, {
      type: "text",
      name: "Source",
      text: { plainText: "initial words" },
    });
    const copy = (await copyResourceCore(
      projectId,
      source.id,
      "Source Copy",
    )) as { id: string; name: string };
    await flushIndexer();
    const copyRevisions = await listRevisions(projectRoot, copy.id);
    expect(copyRevisions).toHaveLength(1);
    const canonical = copyRevisions[0];
    expect(canonical.isCanonical).toBe(true);
    const entries = copyRevisions.map((r) => toRevisionEntry(r));
    vi.useFakeTimers();

    const store = makeStore();
    const resource = {
      ...createTextResource({ name: copy.name, plainText: "initial words" }),
      id: copy.id,
    };
    const fetchMock = mockPatchOk(copy.id);

    store.dispatch(
      setProject({
        id: "project-json-internal-id",
        name: "Autosave Copy",
        rootPath: projectRoot,
        resources: [{ id: copy.id, name: copy.name }],
      }),
    );
    store.dispatch(setSelectedProjectId("project-json-internal-id"));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(copy.id));
    seedRevisions(store, copy.id, entries, canonical.id);

    render(
      <Provider store={store}>
        <EditView initialContent="initial words" />
      </Provider>,
    );
    await editAndAdvance();

    const calls = patchCallsFor(fetchMock, copy.id);
    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0][1] as RequestInit).body as string) as {
      revisionId?: string;
    };
    expect(body.revisionId).toBe(canonical.id);
  });

  it("issues no PATCH when the resource has no canonical revision (negative control)", async () => {
    // Characterises the editor's behaviour when no canonical revision exists.
    // It is NOT evidence of the cause of the original failure.
    const store = makeStore();
    const resource = createTextResource({
      name: "No revision",
      plainText: "Initial text",
    });
    const fetchMock = mockPatchOk(resource.id);

    store.dispatch(
      setProject({
        id: "project-no-revision",
        name: "No Revision Project",
        rootPath: "/tmp/project-no-revision",
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId("project-no-revision"));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));
    seedRevisions(store, resource.id, [], "");

    render(
      <Provider store={store}>
        <EditView initialContent="Initial text" />
      </Provider>,
    );
    await editAndAdvance();

    expect(patchCallsFor(fetchMock, resource.id)).toHaveLength(0);
  });
});
