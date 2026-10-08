import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
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
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/resources", () => ({
  updateSidecar: vi.fn().mockResolvedValue(undefined),
}));

const PROJECT_ID = "proj-subtype-a11y";

function mount(resource: AnyResource, subtypes: string[]) {
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
  return render(
    <Provider store={store}>
      <SubtypeSection />
    </Provider>,
  );
}

function withSubtype(value: string): AnyResource {
  return {
    ...createTextResource({ name: "Chapter" }),
    resourceSubtype: value,
  } as AnyResource;
}

describe("a11y: SubtypeSection", () => {
  it("axe passes with no subtype set", async () => {
    const { container } = mount(createTextResource({ name: "Chapter" }), [
      "Scene",
      "Profile",
    ]);
    await screen.findByRole("combobox", { name: "Subtype" });
    await runAxe(container);
  });

  it("axe passes with a subtype set", async () => {
    const { container } = mount(withSubtype("Scene"), ["Scene", "Profile"]);
    await screen.findByRole("combobox", { name: "Subtype" });
    await runAxe(container);
  });

  it("axe passes with a stale subtype", async () => {
    const { container } = mount(withSubtype("Legacy"), ["Scene"]);
    await screen.findByRole("combobox", { name: "Subtype" });
    await runAxe(container);
  });

  it("axe passes with an empty list (disabled select and hint)", async () => {
    const { container } = mount(createTextResource({ name: "Chapter" }), []);
    const select = await screen.findByRole("combobox", { name: "Subtype" });
    expect(select).toBeDisabled();
    await runAxe(container);
  });
});
