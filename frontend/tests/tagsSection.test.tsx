import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import TagsSection from "../components/Sidebar/TagsSection";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import { createTag, deleteTag, updateTag } from "../src/lib/api/tags";

const PROJECT_PATH = "/tmp/test-project";
const PROJECT_ID = "proj-test-1";

function makeFetchStub(options: {
  tags?: { id: string; name: string; color?: string }[];
  tagIds?: string[];
}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : {};

        if (url.includes("/api/project/tags") && !url.includes("/assign")) {
          if (body.action === "list") {
            return {
              ok: true,
              json: async () => ({ tags: options.tags ?? [] }),
            } as Response;
          }
          if (body.action === "assignments") {
            return {
              ok: true,
              json: async () => ({ tagIds: options.tagIds ?? [] }),
            } as Response;
          }
        }

        if (url.includes("/api/project/tags/assign")) {
          return { ok: true, json: async () => ({}) } as Response;
        }

        return { ok: true, json: async () => ({}) } as Response;
      },
    );
}

function setupStore(resourceId: string) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  const res = createTextResource({ name: "My Scene" });
  (res as any).id = resourceId;
  store.dispatch(setResources([res]));
  store.dispatch(setSelectedResourceId(resourceId));
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TagsSection", () => {
  it("renders tag chips from the project tag list", async () => {
    const tags = [
      { id: "tag-1", name: "Draft" },
      { id: "tag-2", name: "Review" },
    ];
    makeFetchStub({ tags, tagIds: [] });
    const store = setupStore("res-abc");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(await screen.findByText("Review")).toBeInTheDocument();
  });

  it("marks assigned tags as active (aria-pressed=true)", async () => {
    const tags = [
      { id: "tag-1", name: "Draft" },
      { id: "tag-2", name: "Review" },
    ];
    makeFetchStub({ tags, tagIds: ["tag-1"] });
    const store = setupStore("res-abc");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    const draftBtn = await screen.findByRole("button", { name: "Draft" });
    const reviewBtn = await screen.findByRole("button", { name: "Review" });

    await waitFor(() => {
      expect(draftBtn).toHaveAttribute("aria-pressed", "true");
      expect(reviewBtn).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("clicking an inactive chip calls the assign endpoint and activates it", async () => {
    const tags = [{ id: "tag-1", name: "Draft" }];
    const fetchStub = makeFetchStub({ tags, tagIds: [] });
    const store = setupStore("res-def");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    const btn = await screen.findByRole("button", { name: "Draft" });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-pressed", "true");
    });

    const assignCall = fetchStub.mock.calls.find(([url]) =>
      url.toString().includes("/api/project/tags/assign"),
    );
    expect(assignCall).toBeDefined();
    const body = JSON.parse(assignCall![1]?.body as string);
    expect(body.assign).toBe(true);
    expect(body.tagId).toBe("tag-1");
  });

  it("clicking an active chip calls the unassign endpoint and deactivates it", async () => {
    const tags = [{ id: "tag-1", name: "Draft" }];
    const fetchStub = makeFetchStub({ tags, tagIds: ["tag-1"] });
    const store = setupStore("res-def");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    const btn = await screen.findByRole("button", { name: "Draft" });
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    const assignCall = fetchStub.mock.calls.find(([url]) =>
      url.toString().includes("/api/project/tags/assign"),
    );
    expect(assignCall).toBeDefined();
    const body = JSON.parse(assignCall![1]?.body as string);
    expect(body.assign).toBe(false);
  });

  it("shows the empty-state hint when the tag list is empty", async () => {
    makeFetchStub({ tags: [], tagIds: [] });
    const store = setupStore("res-empty");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    expect(await screen.findByText(/No tags yet/i)).toBeInTheDocument();
  });
});

describe("TagsSection — a tag changed elsewhere", () => {
  function stubTagWrites(initial: { id: string; name: string }[]) {
    let tags = [...initial];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (input.toString().includes("/delete")) {
          tags = tags.filter((t) => t.id !== body.tagId);
          return {
            ok: true,
            json: async () => ({ deleted: true }),
          } as Response;
        }
        if (body.action === "create") {
          const tag = { id: "tag-new", name: body.name };
          tags = [...tags, tag];
          return { ok: true, json: async () => ({ tag }) } as Response;
        }
        if (body.action === "list") {
          return { ok: true, json: async () => ({ tags }) } as Response;
        }
        return { ok: true, json: async () => ({ tagIds: [] }) } as Response;
      },
    );
  }

  function renderSection() {
    render(
      <Provider store={setupStore("res-abc")}>
        <TagsSection />
      </Provider>,
    );
  }

  it("shows a tag created in the tags manager", async () => {
    stubTagWrites([{ id: "tag-1", name: "Draft" }]);
    renderSection();
    await screen.findByText("Draft");

    await createTag("test-project", "Flashback");

    expect(await screen.findByText("Flashback")).toBeInTheDocument();
  });

  it("drops a tag deleted in the tags manager", async () => {
    stubTagWrites([
      { id: "tag-1", name: "Draft" },
      { id: "tag-2", name: "Review" },
    ]);
    renderSection();
    await screen.findByText("Review");

    await deleteTag("test-project", "tag-2");

    await waitFor(() =>
      expect(screen.queryByText("Review")).not.toBeInTheDocument(),
    );
  });

  it("shows a tag's new name after it is edited in the tags manager", async () => {
    let tags = [{ id: "tag-1", name: "Draft" }];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (body.action === "update") {
          tags = [{ id: body.tagId, name: body.name }];
          return { ok: true, json: async () => ({ tag: tags[0] }) } as Response;
        }
        if (body.action === "list") {
          return { ok: true, json: async () => ({ tags }) } as Response;
        }
        return { ok: true, json: async () => ({ tagIds: [] }) } as Response;
      },
    );
    const store = setupStore("res-abc");
    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );
    await screen.findByText("Draft");

    await updateTag("test-project", "tag-1", { name: "First draft" });

    expect(await screen.findByText("First draft")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});

/**
 * The revert-on-failure path in `TagsSection.handleToggle` was unreachable
 * until `assignTag` began rejecting: the write was fire-and-forget, so a
 * failed assignment resolved like a successful one and the chip stayed
 * selected, unpersisted, until the next reload.
 */
describe("TagsSection — a failed assignment", () => {
  function makeFetchStubWithFailingAssign(
    tags: { id: string; name: string }[],
  ) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input.toString();
          const body = init?.body ? JSON.parse(init.body as string) : {};
          if (url.includes("/api/project/tags/assign")) {
            return { ok: false, status: 500 } as Response;
          }
          if (url.includes("/api/project/tags")) {
            if (body.action === "list") {
              return { ok: true, json: async () => ({ tags }) } as Response;
            }
            if (body.action === "assignments") {
              return {
                ok: true,
                json: async () => ({ tagIds: [] }),
              } as Response;
            }
          }
          return { ok: true, json: async () => ({}) } as Response;
        },
      );
  }

  it("reverts the chip rather than leaving it selected", async () => {
    makeFetchStubWithFailingAssign([{ id: "tag-1", name: "Draft" }]);
    const store = setupStore("res-revert");

    render(
      <Provider store={store}>
        <TagsSection />
      </Provider>,
    );

    const chip = await screen.findByText("Draft");
    fireEvent.click(chip);

    // The optimistic selection is rolled back once the write rejects. Asserted
    // via aria-pressed rather than styling so it reflects what is announced.
    await waitFor(() => {
      const button = chip.closest("button");
      expect(button?.getAttribute("aria-pressed")).not.toBe("true");
    });
  });
});
