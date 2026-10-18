/**
 * Feature 86, Task 24 (review finding R-1): a Tags chip restored from a saved
 * smart folder, and the failure state of the project's tag read.
 *
 * Tests are named for what is observed on screen, not for a cause.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import type { AnyResource } from "../src/lib/models/types";

const PROJECT_A = "proj_tags_reopen_a";
const PROJECT_B = "proj_tags_reopen_b";
const FLASHBACK = { id: "tag-flashback", name: "flashback" };
const SAVED_FOLDER_NAME = "Tag flashback";
const SAVED_DEFINITION = { op: "in", field: "tags", value: FLASHBACK };

type TagsReply =
  | { kind: "tags"; tags: Array<{ id: string; name: string }> }
  | { kind: "status"; status: number }
  | { kind: "reject" }
  | { kind: "never" };

interface Deferred {
  resolve: () => void;
  promise: Promise<void>;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

interface Harness {
  store: ReturnType<typeof makeStore>;
  writes: string[];
  tagReads: string[];
}

/** Per-project tag replies; a `gate` holds the reply until released. */
const replies = new Map<string, { reply: TagsReply; gate?: Deferred }>();

let originalFetch: typeof globalThis.fetch;
let writes: string[];
let tagReads: string[];

function makeProject(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    rootPath: `/test/${id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
  };
}

function setup(): Harness {
  const resources: AnyResource[] = [
    createTextResource({ name: "Scene A", plainText: "" }) as AnyResource,
  ];
  const store = makeStore();
  for (const [id, name] of [
    [PROJECT_A, "A"],
    [PROJECT_B, "B"],
  ]) {
    store.dispatch(
      setProject({
        ...makeProject(id, name),
        folders: [],
        resources: [],
      } as never),
    );
  }
  store.dispatch(setSelectedProjectId(PROJECT_A));
  store.dispatch(setResources(resources));
  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={makeProject(PROJECT_A, "A") as never}
        resources={resources}
      />
    </Provider>,
  );
  return { store, writes, tagReads };
}

beforeEach(() => {
  replies.clear();
  writes = [];
  tagReads = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      const ok = (json: unknown): Response =>
        ({
          ok: true,
          status: 200,
          json: async () => json,
          text: async () => "",
        }) as Response;
      if (url.includes("/api/project/tags") && body.action === "list") {
        const projectId = String(body.projectId);
        tagReads.push(projectId);
        const entry = replies.get(projectId);
        if (entry?.gate) await entry.gate.promise;
        const reply = entry?.reply ?? { kind: "tags", tags: [] };
        if (reply.kind === "never")
          return new Promise<Response>(() => undefined);
        if (reply.kind === "reject") throw new TypeError("network down");
        if (reply.kind === "status") {
          return {
            ok: false,
            status: reply.status,
            json: async () => ({}),
            text: async () => "",
          } as Response;
        }
        return ok({ tags: reply.tags });
      }
      if (url.includes("/api/project/query/saved")) {
        if (body.action === "write" || body.action === "delete") {
          writes.push(`${url} ${String(body.action)}`);
        }
        return ok({
          queries: [
            {
              id: "sf-tag",
              name: SAVED_FOLDER_NAME,
              definition: SAVED_DEFINITION,
            },
          ],
        });
      }
      if (url.includes("/api/project/query/evaluate")) return ok({ ids: [] });
      if (method !== "GET" && method !== "POST")
        writes.push(`${method} ${url}`);
      if (method === "PATCH" || method === "PUT")
        writes.push(`${method} ${url}`);
      return ok({});
    },
  ) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

async function openSavedFolderForEdit(): Promise<void> {
  fireEvent.click(screen.getByRole("tab", { name: /Data/i }));
  const edit = await screen.findByRole("button", {
    name: `Edit ${SAVED_FOLDER_NAME}`,
  });
  fireEvent.click(edit);
}

function valueSlot(): HTMLElement {
  const slot = document.querySelector<HTMLElement>(".filter-chip__slot--value");
  if (!slot) throw new Error("no value slot");
  return slot;
}

describe("AppShell — reopening a saved Tags folder (Feature 86 Task 24)", () => {
  it("shows flashback in the value box when the tags load after Edit is clicked", async () => {
    const gate = deferred();
    replies.set(PROJECT_A, {
      reply: { kind: "tags", tags: [FLASHBACK] },
      gate,
    });
    setup();
    await openSavedFolderForEdit();
    await waitFor(() => expect(valueSlot()).toBeTruthy());
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(tagReads.length).toBeGreaterThan(0));
    await waitFor(() => expect(valueSlot().textContent).toContain("flashback"));
    expect(valueSlot().querySelector("input[aria-label='Tag']")).toBeNull();
  });

  it("shows flashback in the value box when the tag read never resolves", async () => {
    replies.set(PROJECT_A, { reply: { kind: "never" } });
    setup();
    await openSavedFolderForEdit();
    await waitFor(() => expect(valueSlot()).toBeTruthy());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(valueSlot().textContent).toContain("flashback");
    expect(valueSlot().querySelector("input[aria-label='Tag']")).toBeNull();
  });

  it("writes no saved query, project or sidecar when a saved Tags folder is reopened", async () => {
    replies.set(PROJECT_A, { reply: { kind: "tags", tags: [FLASHBACK] } });
    setup();
    await openSavedFolderForEdit();
    await waitFor(() => expect(valueSlot().textContent).toContain("flashback"));
    expect(writes).toEqual([]);
  });

  async function startNewTagsChip(): Promise<void> {
    fireEvent.click(screen.getByRole("tab", { name: /Data/i }));
    fireEvent.click(await screen.findByLabelText("New smart folder"));
    const trigger = await screen.findByRole("button", {
      name: "Select a field",
    });
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", { name: /^Tags/ });
    fireEvent.click(option);
  }

  it("offers no previous project's tags in the Tags value box after switching project", async () => {
    replies.set(PROJECT_A, { reply: { kind: "tags", tags: [FLASHBACK] } });
    const gateB = deferred();
    replies.set(PROJECT_B, { reply: { kind: "tags", tags: [] }, gate: gateB });
    const { store } = setup();
    fireEvent.click(screen.getByRole("tab", { name: /Data/i }));
    fireEvent.click(await screen.findByLabelText("New smart folder"));
    await waitFor(() => expect(tagReads).toContain(PROJECT_A));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await act(async () => {
      store.dispatch(setSelectedProjectId(PROJECT_B));
    });
    await waitFor(() => expect(tagReads).toContain(PROJECT_B));
    fireEvent.click(
      await screen.findByRole("button", { name: "Select a field" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^Tags/ }));
    const input = document.querySelector<HTMLInputElement>(
      ".filter-chip__slot--value input",
    );
    if (!input) throw new Error("no value input");
    fireEvent.change(input, { target: { value: "flash" } });
    const offered = screen
      .queryAllByRole("option")
      .filter((o: HTMLElement) => o.closest("select") === null)
      .map((o: HTMLElement) => o.textContent ?? "");
    expect(offered).not.toContain("flashback");
  });

  it("shows a short failure message in the Tags value box when the tag read rejects", async () => {
    replies.set(PROJECT_A, { reply: { kind: "reject" } });
    setup();
    await waitFor(() => expect(tagReads).toContain(PROJECT_A));
    await startNewTagsChip();
    await waitFor(() =>
      expect(valueSlot().textContent).toMatch(/could not load tags/i),
    );
    expect(valueSlot().querySelector("input[aria-label='Tag']")).toBeNull();
  });

  it("shows the same failure message when the tag read answers 409 (locked access)", async () => {
    replies.set(PROJECT_A, { reply: { kind: "status", status: 409 } });
    setup();
    await waitFor(() => expect(tagReads).toContain(PROJECT_A));
    await startNewTagsChip();
    await waitFor(() =>
      expect(valueSlot().textContent).toMatch(/could not load tags/i),
    );
  });

  it("shows an empty state, not the failure message, when the project has no tags", async () => {
    replies.set(PROJECT_A, { reply: { kind: "tags", tags: [] } });
    setup();
    await waitFor(() => expect(tagReads).toContain(PROJECT_A));
    await startNewTagsChip();
    await waitFor(() =>
      expect(valueSlot().textContent).not.toMatch(/could not load tags/i),
    );
    expect(valueSlot().querySelector("input[aria-label='Tag']")).not.toBeNull();
  });
});
