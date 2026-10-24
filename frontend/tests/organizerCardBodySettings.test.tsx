/**
 * Component tests for the Organizer card-body source settings (Task 6).
 *
 * Covers: the source selector lists None / Text excerpt / each live schema
 * field; an unset config defaults to the Notes field when Notes is enabled and
 * to None otherwise; a persisted config is reflected; each source choice
 * dispatches `updateProjectOrganizerCardBody` with the right payload; the
 * excerpt-length input appears only for text-excerpt mode and persists changes;
 * and the section renders nothing when no project is selected.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerCardBodySettings from "../components/preferences/OrganizerCardBodySettings";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type {
  OrganizerCardBodyConfig,
  ProjectFeatureFlags,
} from "../src/lib/models/types";

vi.mock("../src/lib/toast-service", () => {
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  };
  return { toastService, default: toastService };
});
import { toastService } from "../src/lib/toast-service";

function setup(options?: {
  features?: ProjectFeatureFlags;
  organizerCardBody?: OrganizerCardBodyConfig;
}) {
  const store = makeStore();
  const projectId = "test-project-id";
  store.dispatch(
    setProject({
      id: projectId,
      rootPath: "/test",
      ...(options?.features ? { features: options.features } : {}),
      ...(options?.organizerCardBody
        ? { organizerCardBody: options.organizerCardBody }
        : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(projectId));
  const utils = render(
    <Provider store={store}>
      <OrganizerCardBodySettings />
    </Provider>,
  );
  return { store, projectId, ...utils };
}

function mockFeatureRoute(organizerCardBody: OrganizerCardBodyConfig | null) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ features: {}, organizerCardBody }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

function sourceSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", {
    name: /card body source/i,
  }) as HTMLSelectElement;
}

describe("OrganizerCardBodySettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists None, Text excerpt, and each live schema field", () => {
    setup();
    expect(screen.getByRole("option", { name: /^none$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /text excerpt/i }),
    ).toBeInTheDocument();
    // Built-in default-schema fields appear as options.
    expect(
      screen.getByRole("option", { name: /^synopsis$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /^notes$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /point of view/i }),
    ).toBeInTheDocument();
  });

  it("defaults to the Notes field when Notes is enabled and no config is set", () => {
    setup({ features: { notes: true } });
    expect(sourceSelect().value).toBe("field:notes");
  });

  it("defaults to None when Notes is disabled and no config is set", () => {
    setup();
    expect(sourceSelect().value).toBe("none");
  });

  it("reflects a persisted field config", () => {
    setup({ organizerCardBody: { source: "field", fieldKey: "synopsis" } });
    expect(sourceSelect().value).toBe("field:synopsis");
  });

  it("hides the excerpt-length input unless text-excerpt is selected", () => {
    setup({ organizerCardBody: { source: "none" } });
    expect(
      screen.queryByRole("spinbutton", { name: /excerpt length/i }),
    ).not.toBeInTheDocument();
  });

  it("selecting a field dispatches updateProjectOrganizerCardBody and updates the store", async () => {
    const { store } = setup({ organizerCardBody: { source: "none" } });
    const fetchSpy = mockFeatureRoute({
      source: "field",
      fieldKey: "synopsis",
    });

    fireEvent.change(sourceSelect(), { target: { value: "field:synopsis" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/features");
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      organizerCardBody: { source: "field", fieldKey: "synopsis" },
    });

    await waitFor(() =>
      expect(
        store.getState().projects.projects["test-project-id"].organizerCardBody,
      ).toEqual({ source: "field", fieldKey: "synopsis" }),
    );
  });

  it("selecting Text excerpt persists the default length and reveals the input", async () => {
    setup({ organizerCardBody: { source: "none" } });
    const fetchSpy = mockFeatureRoute({
      source: "text-excerpt",
      excerptLength: 200,
    });

    fireEvent.change(sourceSelect(), { target: { value: "text-excerpt" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("spinbutton", { name: /excerpt length/i }),
      ).toBeInTheDocument(),
    );
  });

  it("changing the excerpt length persists a positive integer", async () => {
    setup({
      organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
    });
    const fetchSpy = mockFeatureRoute({
      source: "text-excerpt",
      excerptLength: 120,
    });

    fireEvent.change(
      screen.getByRole("spinbutton", { name: /excerpt length/i }),
      { target: { value: "120" } },
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      organizerCardBody: { source: "text-excerpt", excerptLength: 120 },
    });
  });

  it("does not persist an empty or non-positive excerpt length", () => {
    setup({
      organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
    });
    const fetchSpy = mockFeatureRoute({
      source: "text-excerpt",
      excerptLength: 200,
    });

    const input = screen.getByRole("spinbutton", { name: /excerpt length/i });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "0" } });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selecting None dispatches a none config", async () => {
    setup({ organizerCardBody: { source: "field", fieldKey: "synopsis" } });
    const fetchSpy = mockFeatureRoute({ source: "none" });

    fireEvent.change(sourceSelect(), { target: { value: "none" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      organizerCardBody: { source: "none" },
    });
  });

  it("renders nothing when no project is selected", () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <OrganizerCardBodySettings />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe("in-flight guard (Feature 93, E-5)", () => {
    /** Fake route: stores the request's block at once, holds each response. */
    function holdingRoute() {
      const server = { stored: null as OrganizerCardBodyConfig | null };
      const releases: Array<() => void> = [];
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (_url, init) => {
          const block = (
            JSON.parse((init as RequestInit).body as string) as {
              organizerCardBody: OrganizerCardBodyConfig;
            }
          ).organizerCardBody;
          server.stored = block;
          await new Promise<void>((resolve) => releases.push(resolve));
          return new Response(
            JSON.stringify({ features: {}, organizerCardBody: block }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });
      return { server, spy, release: () => releases.shift()?.() };
    }

    const lengthInput = () =>
      screen.getByRole("spinbutton", { name: /excerpt length/i });

    it("does not send a second edit until the first has settled; the stored block is the second edit", async () => {
      for (let rep = 0; rep < 20; rep += 1) {
        const { store } = setup({
          organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
        });
        const { server, spy, release } = holdingRoute();

        fireEvent.change(lengthInput(), { target: { value: "300" } });
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

        expect(lengthInput()).toBeDisabled();
        expect(sourceSelect()).toBeDisabled();
        fireEvent.change(lengthInput(), { target: { value: "400" } });
        fireEvent.change(sourceSelect(), { target: { value: "none" } });
        expect(spy).toHaveBeenCalledTimes(1);

        release();
        await waitFor(() => expect(lengthInput()).not.toBeDisabled());
        expect(
          store.getState().projects.projects["test-project-id"]
            .organizerCardBody,
        ).toEqual({ source: "text-excerpt", excerptLength: 300 });

        fireEvent.change(lengthInput(), { target: { value: "400" } });
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        release();
        await waitFor(() =>
          expect(
            store.getState().projects.projects["test-project-id"]
              .organizerCardBody,
          ).toEqual({ source: "text-excerpt", excerptLength: 400 }),
        );
        expect(server.stored).toEqual({
          source: "text-excerpt",
          excerptLength: 400,
        });
        vi.restoreAllMocks();
        cleanup();
      }
    });

    it("marks the section busy while saving", async () => {
      setup({ organizerCardBody: { source: "none" } });
      const { release } = holdingRoute();
      fireEvent.change(sourceSelect(), { target: { value: "text-excerpt" } });
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: /organizer card body/i }),
        ).toHaveAttribute("aria-busy", "true"),
      );
      release();
      await waitFor(() => expect(sourceSelect()).not.toBeDisabled());
    });

    it("shows the error of a failed save and re-enables the controls", async () => {
      setup({
        organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      );
      fireEvent.change(lengthInput(), { target: { value: "300" } });
      await waitFor(() => expect(toastService.error).toHaveBeenCalled());
      await waitFor(() => expect(lengthInput()).not.toBeDisabled());
      expect(sourceSelect()).not.toBeDisabled();
      expect(lengthInput()).toHaveValue(200);
    });
  });
});
