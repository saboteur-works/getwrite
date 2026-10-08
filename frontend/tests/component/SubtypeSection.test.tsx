import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import SubtypeSection from "../../components/Sidebar/SubtypeSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
} from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), success: vi.fn() },
}));

import { updateSidecar } from "../../src/lib/api/resources";
import { toastService } from "../../src/lib/toast-service";

const PROJECT_ID = "proj-subtype-1";

function setupStore(resource: AnyResource, subtypes?: string[]) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      subtypes,
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));
  return store;
}

function renderSection(resource: AnyResource, subtypes?: string[]) {
  const store = setupStore(resource, subtypes);
  render(
    <Provider store={store}>
      <SubtypeSection />
    </Provider>,
  );
  return store;
}

function getSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Subtype" }) as HTMLSelectElement;
}

function optionTexts(): string[] {
  return Array.from(getSelect().options).map((o) => o.textContent ?? "");
}

beforeEach(() => {
  vi.mocked(updateSidecar).mockReset();
  vi.mocked(updateSidecar).mockResolvedValue(undefined);
  vi.mocked(toastService.error).mockReset();
});

describe("SubtypeSection", () => {
  it.each([
    ["text", () => createTextResource({ name: "T" })],
    ["image", () => createImageResource({ name: "I" })],
    ["audio", () => createAudioResource({ name: "A" })],
  ])("shows the control for a %s resource", (_kind, make) => {
    renderSection(make(), ["Scene"]);
    expect(getSelect()).toBeTruthy();
  });

  it("offers 'No subtype' first then the project list in order, and a resource with none shows 'No subtype'", () => {
    renderSection(createTextResource({ name: "T" }), [
      "Scene",
      "Profile",
      "Aside",
    ]);
    expect(optionTexts()).toEqual(["No subtype", "Scene", "Profile", "Aside"]);
    expect(getSelect().selectedOptions[0].textContent).toBe("No subtype");
    expect(getSelect().disabled).toBe(false);
  });

  it("shows a stored subtype that is not in the list as '<value> (not in the current list)' without writing", () => {
    const resource = {
      ...createTextResource({ name: "T" }),
      resourceSubtype: "Legacy",
    } as AnyResource;
    renderSection(resource, ["Scene"]);
    expect(getSelect().selectedOptions[0].textContent).toBe(
      "Legacy (not in the current list)",
    );
    expect(updateSidecar).not.toHaveBeenCalled();
  });

  it("does not show a stored subtype as stale when the list holds it under the comparison key", () => {
    const resource = {
      ...createTextResource({ name: "T" }),
      resourceSubtype: "Scene",
    } as AnyResource;
    renderSection(resource, ["scene"]);
    expect(optionTexts()).toEqual(["No subtype", "scene"]);
    expect(getSelect().selectedOptions[0].textContent).toBe("scene");
  });

  it("with an empty list and no stored subtype the select is disabled and the hint is present", () => {
    renderSection(createTextResource({ name: "T" }), []);
    expect(getSelect().disabled).toBe(true);
    expect(
      screen.getByText(
        "No subtypes yet. Add them in Project Settings, Metadata tab.",
      ),
    ).toBeTruthy();
  });

  it("with an empty list but a stored subtype the select is enabled and clearable", () => {
    const resource = {
      ...createTextResource({ name: "T" }),
      resourceSubtype: "Legacy",
    } as AnyResource;
    renderSection(resource, []);
    expect(getSelect().disabled).toBe(false);
    expect(
      screen.queryByText(
        "No subtypes yet. Add them in Project Settings, Metadata tab.",
      ),
    ).toBeNull();
  });

  it("choosing a value sends only the resourceSubtype key and updates Redux on success", async () => {
    const resource = createTextResource({ name: "T" });
    const store = renderSection(resource, ["Scene", "Profile"]);
    fireEvent.change(getSelect(), { target: { value: "Profile" } });

    await waitFor(() => expect(updateSidecar).toHaveBeenCalledTimes(1));
    const call = vi.mocked(updateSidecar).mock.calls[0];
    expect(call[0]).toBe(resource.id);
    expect(call[1]).toBe(PROJECT_ID);
    expect(call[2]).toEqual({ resourceSubtype: "Profile" });
    expect(call[3]).toBeUndefined();

    await waitFor(() =>
      expect(
        (store.getState().resources.resources as AnyResource[])[0],
      ).toMatchObject({ resourceSubtype: "Profile" }),
    );
    expect(getSelect().selectedOptions[0].textContent).toBe("Profile");
  });

  it("choosing 'No subtype' sends only clearKeys and removes the value from Redux", async () => {
    const resource = {
      ...createTextResource({ name: "T" }),
      resourceSubtype: "Scene",
    } as AnyResource;
    const store = renderSection(resource, ["Scene"]);
    fireEvent.change(getSelect(), { target: { value: "" } });

    await waitFor(() => expect(updateSidecar).toHaveBeenCalledTimes(1));
    const call = vi.mocked(updateSidecar).mock.calls[0];
    expect(call[2]).toEqual({});
    expect(call[3]).toEqual(["resourceSubtype"]);

    await waitFor(() =>
      expect(
        (store.getState().resources.resources as AnyResource[])[0]
          .resourceSubtype,
      ).toBeUndefined(),
    );
    expect(getSelect().selectedOptions[0].textContent).toBe("No subtype");
  });

  it("a rejected write reverts the control to the stored value and shows an error toast", async () => {
    vi.mocked(updateSidecar).mockRejectedValue(new Error("boom"));
    const resource = {
      ...createTextResource({ name: "T" }),
      resourceSubtype: "Scene",
    } as AnyResource;
    const store = renderSection(resource, ["Scene", "Profile"]);
    fireEvent.change(getSelect(), { target: { value: "Profile" } });

    await waitFor(() => expect(toastService.error).toHaveBeenCalledTimes(1));
    expect(getSelect().value).toBe("Scene");
    expect(
      (store.getState().resources.resources as AnyResource[])[0]
        .resourceSubtype,
    ).toBe("Scene");
  });

  it("reflects list changes with no reload", () => {
    const store = renderSection(createTextResource({ name: "T" }), []);
    expect(getSelect().disabled).toBe(true);
    React.act(() => {
      store.dispatch(
        setProject({
          id: PROJECT_ID,
          name: "Test Project",
          rootPath: `/tmp/${PROJECT_ID}`,
          subtypes: ["Scene"],
        } as Parameters<typeof setProject>[0]),
      );
    });
    expect(getSelect().disabled).toBe(false);
    expect(optionTexts()).toEqual(["No subtype", "Scene"]);
  });
});
