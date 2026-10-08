/**
 * Component tests for the entity feature-toggle section (split out of
 * ProjectFeatureToggles into its own Project Settings "Entities" tab panel).
 *
 * Covers: the `entities` toggle reflects `config.features` (absent flag =
 * off) and persists via `updateProjectFeatures`; the dependent
 * `entityHighlighting` toggle only renders once `entities` is on and
 * persists the same way; and the section renders nothing when no project is
 * selected.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityFeatureToggles from "../components/preferences/EntityFeatureToggles";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../src/lib/models/types";

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

function setup(features?: ProjectFeatureFlags) {
  const store = makeStore();
  const projectId = "test-project-id";
  store.dispatch(
    setProject({
      id: projectId,
      rootPath: "/test",
      ...(features ? { features } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(projectId));
  const utils = render(
    <Provider store={store}>
      <EntityFeatureToggles />
    </Provider>,
  );
  return { store, projectId, ...utils };
}

function mockFeatureRoute(features: ProjectFeatureFlags) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ features, organizerCardBody: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

describe("EntityFeatureToggles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders an Entities checkbox, unchecked when the flag is absent", () => {
    setup();
    expect(
      screen.getByRole("checkbox", { name: /entities/i }),
    ).not.toBeChecked();
  });

  it("reflects the entities flag when already on", () => {
    setup({ entities: true });
    expect(screen.getByRole("checkbox", { name: /entities/i })).toBeChecked();
  });

  it("persists the entities flag when toggled on", async () => {
    const { store } = setup();
    const fetchSpy = mockFeatureRoute({ entities: true });

    fireEvent.click(screen.getByRole("checkbox", { name: /entities/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/features");
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      features: { entities: true },
    });

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /entities/i })).toBeChecked(),
    );
    expect(
      store.getState().projects.projects["test-project-id"].features,
    ).toEqual({ entities: true });
  });

  it("does not render the entity highlighting toggle when entities is off", () => {
    setup();
    expect(screen.queryByText(/entity highlighting/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /entity highlighting/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the entity highlighting toggle when entities is on", () => {
    setup({ entities: true });
    expect(
      screen.getByRole("checkbox", { name: /entity highlighting/i }),
    ).toBeInTheDocument();
  });

  it("persists entityHighlighting when toggled on", async () => {
    const { store } = setup({ entities: true });
    const fetchSpy = mockFeatureRoute({
      entities: true,
      entityHighlighting: true,
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: /entity highlighting/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/features");
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      features: { entities: true, entityHighlighting: true },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /entity highlighting/i }),
      ).toBeChecked(),
    );
    expect(
      store.getState().projects.projects["test-project-id"].features,
    ).toEqual({ entities: true, entityHighlighting: true });
  });

  it("shows a success toast confirming the toggle", async () => {
    setup();
    mockFeatureRoute({ entities: true });

    fireEvent.click(screen.getByRole("checkbox", { name: /entities/i }));

    await waitFor(() =>
      expect(toastService.success).toHaveBeenCalledWith("Entities enabled"),
    );
  });

  it("shows an error toast when the update fails", async () => {
    setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /entities/i }));

    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
    expect(toastService.success).not.toHaveBeenCalled();
  });

  it("renders nothing when no project is selected", () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <EntityFeatureToggles />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
