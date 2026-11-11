// Last Updated: 2026-11-07

/**
 * Feature 103, Task 10 (FR-7, FR-31, OQ-13): the per-project module switch in
 * Project Settings, and the Feature 102 create entry and sidebar section
 * ignoring it.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import {
  selectActiveProjectModules,
  setProject,
  setSelectedProjectId,
} from "../src/store/projectsSlice";
import { StaticModulesProvider } from "../components/Modules/ModulesContext";
import ModuleSwitchSection from "../components/Modules/ModuleSwitchSection";
import CreateResourceModal from "../components/ResourceTree/CreateResourceModal";
import SourceAttachmentsSection from "../components/Sidebar/SourceAttachmentsSection";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { createSourceResource } from "../src/lib/models/resource-factory";

const setModuleEnabled = vi.fn();
vi.mock("../src/lib/api/modules", () => ({
  setModuleEnabled: (...a: unknown[]) => setModuleEnabled(...a),
}));

const listAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: vi.fn(),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

function makeLoadedStore(modules?: Record<string, boolean>) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test", modules }));
  store.dispatch(setSelectedProjectId("p"));
  return store;
}

function mount(modules?: Record<string, boolean>) {
  const store = makeLoadedStore(modules);
  render(
    <Provider store={store}>
      <ModuleSwitchSection projectId="proj-dir" />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  setModuleEnabled.mockReset();
  listAttachments.mockReset();
  listAttachments.mockResolvedValue([]);
});
afterEach(cleanup);

describe("ModuleSwitchSection", () => {
  it("shows the Sources switch on when the project has no modules entry (OQ-13)", () => {
    mount(undefined);
    expect(screen.getByRole("checkbox", { name: /Sources/ })).toBeChecked();
  });

  it("shows the switch off for an explicit false", () => {
    mount({ sources: false });
    expect(screen.getByRole("checkbox", { name: /Sources/ })).not.toBeChecked();
  });

  it("toggling calls the client with the request and shows a visible result", async () => {
    setModuleEnabled.mockResolvedValue({ modules: { sources: false } });
    const store = mount(undefined);
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    expect(setModuleEnabled).toHaveBeenCalledWith({
      projectId: "proj-dir",
      moduleId: "sources",
      enabled: false,
    });
    const sourcesSwitch = screen.getByRole("checkbox", { name: /Sources/ });
    const sourcesRow = sourcesSwitch.closest("div") as HTMLElement;
    expect(await within(sourcesRow).findByRole("status")).toHaveTextContent(
      /Sources.*off/i,
    );
    expect(screen.getByRole("checkbox", { name: /Sources/ })).not.toBeChecked();
    expect(selectActiveProjectModules(store.getState())).toEqual({
      sources: false,
    });
  });

  it("a failed save shows a visible failure and keeps the writer's choice", async () => {
    setModuleEnabled.mockRejectedValue(new Error("Disk is read-only."));
    const store = mount({ sources: true });
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Disk is read-only.");
    expect(screen.getByRole("checkbox", { name: /Sources/ })).not.toBeChecked();
    expect(selectActiveProjectModules(store.getState())).toEqual({
      sources: true,
    });
  });

  it("a failure with a non-Error rejection still shows a failure", async () => {
    setModuleEnabled.mockRejectedValue("nope");
    mount(undefined);
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sources/);
  });

  it("is keyboard operable with Space and has an accessible name", async () => {
    setModuleEnabled.mockResolvedValue({ modules: { sources: false } });
    mount(undefined);
    await userEvent.tab();
    const box = screen.getByRole("checkbox", { name: /Sources/ });
    expect(box).toHaveFocus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(setModuleEnabled).toHaveBeenCalledTimes(1));
  });

  it("is not disabled: the module write is not limited on a paired device", () => {
    mount(undefined);
    expect(screen.getByRole("checkbox", { name: /Sources/ })).toBeEnabled();
  });
});

describe("Feature 102 surfaces ignore the module switch (OQ-13)", () => {
  it("CreateResourceModal still offers and creates a Source with the module off", async () => {
    const onCreate = vi.fn();
    render(
      <Provider store={makeLoadedStore({ sources: false })}>
        <StaticModulesProvider value={{ sources: false }}>
          <CreateResourceModal
            isOpen={true}
            initialTitle="Interview"
            initialType="text"
            parentId={undefined}
            parents={[]}
            onCreate={onCreate}
            onClose={vi.fn()}
          />
        </StaticModulesProvider>
      </Provider>,
    );
    const select = screen.getByLabelText("resource-type") as HTMLSelectElement;
    expect(Array.from(select.options).some((o) => o.value === "source")).toBe(
      true,
    );
    await userEvent.selectOptions(select, "source");
    await userEvent.click(screen.getByText("Create"));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "source", title: "Interview" }),
      undefined,
      expect.any(Object),
    );
  });

  it("SourceAttachmentsSection still lists attachments with the module off", async () => {
    listAttachments.mockResolvedValue([
      {
        id: "a1",
        fileName: "a1.pdf",
        originalName: "alpha.pdf",
        mime: "application/pdf",
        size: 1,
        addedAt: "2026-11-07T00:00:00.000Z",
      },
    ]);
    render(
      <Provider store={makeLoadedStore({ sources: false })}>
        <StaticModulesProvider value={{ sources: false }}>
          <TrashRefreshProvider>
            <SourceAttachmentsSection
              resource={createSourceResource({ name: "Interview" })}
            />
          </TrashRefreshProvider>
        </StaticModulesProvider>
      </Provider>,
    );
    expect(await screen.findByText("alpha.pdf")).toBeInTheDocument();
  });
});
