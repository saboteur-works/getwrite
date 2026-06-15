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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerCardBodySettings from "../components/preferences/OrganizerCardBodySettings";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type {
  OrganizerCardBodyConfig,
  ProjectFeatureFlags,
} from "../src/lib/models/types";

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
      projectPath: "/test",
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
      projectPath: "/test",
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
      projectPath: "/test",
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
      projectPath: "/test",
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
});
