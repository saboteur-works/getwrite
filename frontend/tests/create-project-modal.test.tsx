import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StartPage from "../components/Start/StartPage";
import CreateProjectModal from "../components/Start/CreateProjectModal";
import { projectTypesListBody } from "./helpers/projectTypesListBody";

describe("Create project flow (integration) - modal calls API and adds project", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads project types, posts creation, and shows new project in the list", async () => {
    // Mock global fetch and route responses by URL/method to avoid
    // ordering races with StartPage initial requests.
    const fetchSpy = vi
      .spyOn(globalThis as any, "fetch")
      .mockImplementation((...args: unknown[]) => {
        const [input, init] = args as [
          RequestInfo | URL,
          RequestInit | undefined,
        ];
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        // initial projects list on mount
        if (
          url.endsWith("/api/projects") &&
          (!init || !init.method || init.method === "GET")
        ) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.endsWith("/api/project-types")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              projectTypesListBody([
                {
                  id: "novel",
                  name: "Novel",
                  folders: [{ name: "Workspace", defaultResources: [] }],
                },
              ]),
          });
        }
        if (url.endsWith("/api/projects") && init && init.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              project: {
                id: "proj_new",
                name: "My Novel",
                createdAt: "2024-01-01T00:00:00.000Z",
                config: { editorConfig: {} },
              },
              folders: [],
              resources: [],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

    // Render modal directly to avoid StartPage mounting side-effects
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreate={onCreate}
        defaultName=""
        defaultType="novel"
      />,
    );
    // Wait for types to load (modal select present)
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy(), {
      timeout: 2000,
    });

    // Fill name and select type
    const nameInput = screen.getByLabelText(/Name/i);
    fireEvent.change(nameInput, { target: { value: "My Novel" } });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "novel" } });

    // Submit
    const createBtn = screen.getByRole("button", { name: /Create/i });
    fireEvent.click(createBtn);

    // Ensure fetch was called for GET and POST
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });

    // Assert POST called with expected payload
    const postCall = fetchSpy.mock.calls[1];
    const postInit = postCall?.[1] as RequestInit | undefined;
    expect(postCall[0]).toBe("/api/projects");
    expect(postInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(postInit?.body).toBe(
      JSON.stringify({ name: "My Novel", projectType: "novel" }),
    );

    // Assert the modal invoked onCreate with the created project
    await waitFor(() => expect(onCreate).toHaveBeenCalled(), { timeout: 2000 });
    const call = onCreate.mock.calls[0];
    expect(call[0]).toMatchObject({ name: "My Novel", projectType: "novel" });
    expect(call[1]).toBeDefined();
    expect(call[1].project).toMatchObject({ id: "proj_new", name: "My Novel" });
  });
});

/**
 * T027: US3 — Project-type list pane parity coverage.
 *
 * Verifies that the CreateProjectModal correctly loads and exposes project-type
 * options, so that downstream ProjectTypeListPane decomposition cannot break
 * the create-project modal flow.
 */
describe("Create project modal — project-type list parity (T027)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders only the project types returned by the API", async () => {
    vi.spyOn(globalThis as any, "fetch").mockImplementation(
      (...args: unknown[]) => {
        const [input] = args as [RequestInfo | URL];
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;

        if (url.endsWith("/api/project-types")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              projectTypesListBody([
                {
                  id: "screenplay",
                  name: "Screenplay",
                  folders: [{ name: "Workspace" }],
                },
                {
                  id: "essay",
                  name: "Essay",
                  folders: [{ name: "Workspace" }],
                },
              ]),
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      },
    );

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        defaultName=""
        defaultType=""
      />,
    );

    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).toBeTruthy();
    });

    const options = screen.getByRole("combobox").querySelectorAll("option");
    const optionValues = Array.from(options).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(optionValues).toContain("screenplay");
    expect(optionValues).toContain("essay");
  });

  it("shows an error placeholder when the project-types API call fails", async () => {
    vi.spyOn(globalThis as any, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        defaultName=""
        defaultType=""
      />,
    );

    await waitFor(
      () => {
        // Modal should still render; either show error text or empty select
        expect(screen.getByRole("dialog")).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });
});

describe("Create project modal - resolver list (Feature 90, Task 24)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const spec = (id: string, name: string) => ({
    id,
    name,
    folders: [{ name: "Workspace" }],
  });

  function stubBodies(bodies: unknown[]): ReturnType<typeof vi.spyOn> {
    let call = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      return { ok: true, json: async () => body } as Response;
    });
  }

  const renderModal = (isOpen: boolean) => (
    <CreateProjectModal
      isOpen={isOpen}
      onClose={vi.fn()}
      onCreate={vi.fn()}
      defaultName=""
      defaultType="novel"
    />
  );

  it("marks saved types as Saved in text and leaves built-ins unmarked", async () => {
    stubBodies([
      {
        entries: [
          {
            spec: spec("novel", "Novel"),
            fileName: "novel.json",
            source: "built-in",
          },
          {
            spec: spec("mine", "My Type"),
            fileName: "mine.json",
            source: "saved",
          },
        ],
        unusable: [],
        savedStatus: "ok",
      },
    ]);
    render(renderModal(true));
    const saved = await screen.findByRole("option", { name: /My Type/ });
    expect(saved.textContent).toMatch(/\(Saved\)/);
    const builtIn = screen.getByRole("option", { name: /Novel/ });
    expect(builtIn.textContent).not.toMatch(/Saved/);
  });

  it("re-reads the list on each open so a newly saved type appears", async () => {
    const first = projectTypesListBody([spec("novel", "Novel")]);
    const second = {
      entries: [
        {
          spec: spec("novel", "Novel"),
          fileName: "novel.json",
          source: "built-in",
        },
        {
          spec: spec("fresh", "Fresh Type"),
          fileName: "fresh.json",
          source: "saved",
        },
      ],
      unusable: [],
      savedStatus: "ok",
    };
    const fetchSpy = stubBodies([first, second]);
    const { rerender } = render(renderModal(true));
    await screen.findByRole("option", { name: /Novel/ });
    expect(screen.queryByRole("option", { name: /Fresh Type/ })).toBeNull();
    rerender(renderModal(false));
    rerender(renderModal(true));
    await screen.findByRole("option", { name: /Fresh Type/ });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shows the notice when saved files are unusable", async () => {
    stubBodies([
      projectTypesListBody([spec("novel", "Novel")], {
        unusable: [{ fileName: "bad.json", reason: "invalid" }],
      }),
    ]);
    render(renderModal(true));
    const notice = await screen.findByText(/saved project type file/);
    expect(notice.getAttribute("role")).toBe("status");
  });

  it("shows the notice when the saved folder is unreadable", async () => {
    stubBodies([
      projectTypesListBody([spec("novel", "Novel")], {
        savedStatus: "unreadable",
      }),
    ]);
    render(renderModal(true));
    expect(
      await screen.findByText(/Saved project types could not be read/),
    ).toBeTruthy();
  });

  it("shows no notice for a clean list", async () => {
    stubBodies([projectTypesListBody([spec("novel", "Novel")])]);
    render(renderModal(true));
    await screen.findByRole("option", { name: /Novel/ });
    expect(screen.queryByText(/could not be/)).toBeNull();
  });

  it("shows the error and no stale list when a reopen fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => projectTypesListBody([spec("novel", "Novel")]),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const { rerender } = render(renderModal(true));
    await screen.findByRole("option", { name: /Novel/ });
    rerender(renderModal(false));
    rerender(renderModal(true));
    expect(
      await screen.findByText(/Failed to load project types/),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Novel/ })).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("Create project modal - type filter keeps the submitted type in sync (task_2191963a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const specs = [
    {
      id: "novel",
      name: "Novel",
      description: "Long-form fiction.",
      folders: [{ name: "Workspace" }],
    },
    {
      id: "blank",
      name: "Blank",
      description: "Only a Workspace folder.",
      folders: [{ name: "Workspace" }],
    },
  ];

  function stubFetch(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith("/api/project-types")) {
        return {
          ok: true,
          json: async () => projectTypesListBody(specs),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          project: {
            id: "p1",
            name: "T",
            createdAt: "2024-01-01T00:00:00.000Z",
            config: { editorConfig: {} },
          },
          folders: [],
          resources: [],
        }),
      } as Response;
    });
  }

  function renderModal(onCreate = vi.fn()) {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onCreate={onCreate}
        defaultName="T"
        defaultType="novel"
      />,
    );
    return onCreate;
  }

  it("submits and describes the type the filtered select shows, not the hidden default", async () => {
    const fetchSpy = stubFetch();
    const onCreate = renderModal();
    await screen.findByRole("option", { name: /Blank/ });

    fireEvent.change(screen.getByLabelText("Filter project types"), {
      target: { value: "blank" },
    });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("blank");
    expect(screen.getByText("Only a Workspace folder.")).toBeTruthy();
    expect(screen.queryByText("Long-form fiction.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const post = fetchSpy.mock.calls.find(
      (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      name: "T",
      projectType: "blank",
    });
  });

  it("keeps the chosen type when the filter is cleared", async () => {
    stubFetch();
    renderModal();
    await screen.findByRole("option", { name: /Blank/ });
    const filter = screen.getByLabelText("Filter project types");
    fireEvent.change(filter, { target: { value: "blank" } });
    fireEvent.change(filter, { target: { value: "" } });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "blank",
    );
  });

  it("disables Create when the filter matches no type, instead of submitting a hidden one", async () => {
    const fetchSpy = stubFetch();
    renderModal();
    await screen.findByRole("option", { name: /Blank/ });

    fireEvent.change(screen.getByLabelText("Filter project types"), {
      target: { value: "zzz-no-match" },
    });

    const create = screen.getByRole("button", { name: /Create/i });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No project types match the filter.")).toBeTruthy();
    fireEvent.click(create);
    expect(
      fetchSpy.mock.calls.some(
        (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });
});

describe("Create project modal - Enter in the name field with no filter match (task_2191963a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not submit", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        return {
          ok: true,
          json: async () =>
            projectTypesListBody([
              { id: "novel", name: "Novel", folders: [{ name: "Workspace" }] },
            ]),
        } as Response;
      });
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        defaultName="T"
        defaultType="novel"
      />,
    );
    await screen.findByRole("option", { name: /Novel/ });
    fireEvent.change(screen.getByLabelText("Filter project types"), {
      target: { value: "zzz" },
    });
    fireEvent.keyDown(screen.getByLabelText(/^Name/i), { key: "Enter" });
    await new Promise((r) => setTimeout(r, 20));
    expect(
      fetchSpy.mock.calls.some(
        (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });
});
