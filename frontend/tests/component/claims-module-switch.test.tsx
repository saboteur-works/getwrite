/**
 * Feature 108, Task 5 (FR-3, FR-6): the Modules screen shows a claims switch
 * that reads off when the project has no claims entry, saves only the entry
 * toggled, and the hooks read the per-module default for an absent entry.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import ModuleSwitchSection from "../../components/Modules/ModuleSwitchSection";
import { useModuleEnabled } from "../../components/Modules/useModuleEnabled";
import { useModuleViews } from "../../components/Modules/useEnabledModuleViews";
import {
  createUiModuleRegistry,
  type UiModuleEntry,
} from "../../components/Modules/uiRegistry";

const setModuleEnabled = vi.fn();
vi.mock("../../src/lib/api/modules", () => ({
  setModuleEnabled: (...a: unknown[]) => setModuleEnabled(...a),
}));

function makeStoreWith(modules?: Record<string, boolean>) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test", modules }));
  store.dispatch(setSelectedProjectId("p"));
  return store;
}

function mount(modules?: Record<string, boolean>): void {
  const store = makeStoreWith(modules);
  render(
    <Provider store={store}>
      <ModuleSwitchSection projectId="proj-dir" />
    </Provider>,
  );
}

const FAKE_ENTRIES: UiModuleEntry[] = [
  {
    id: "sources",
    view: { id: "sources", label: "Sources", render: () => null },
  },
  { id: "claims", view: { id: "claims", label: "Claims", render: () => null } },
];
const FAKE_UI_REGISTRY = createUiModuleRegistry(FAKE_ENTRIES);

beforeEach(() => {
  // Braces: a returned mock would be run by vitest as a teardown function.
  setModuleEnabled.mockReset();
});
afterEach(cleanup);

describe("claims switch on the Modules screen", () => {
  it("renders claims off and Sources on when the project has no entries", () => {
    mount(undefined);
    expect(screen.getByRole("checkbox", { name: /Claims/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Sources/ })).toBeChecked();
  });

  it("renders claims on for an explicit true", () => {
    mount({ claims: true });
    expect(screen.getByRole("checkbox", { name: /Claims/ })).toBeChecked();
  });

  it("toggling claims sends only the claims entry", async () => {
    setModuleEnabled.mockResolvedValue({ modules: { claims: true } });
    mount(undefined);
    await userEvent.click(screen.getByRole("checkbox", { name: /Claims/ }));
    expect(setModuleEnabled).toHaveBeenCalledTimes(1);
    expect(setModuleEnabled).toHaveBeenCalledWith({
      projectId: "proj-dir",
      moduleId: "claims",
      enabled: true,
    });
    expect(await screen.findByText("Claims is now on.")).toBeInTheDocument();
  });

  it("toggling Sources writes no claims entry", async () => {
    setModuleEnabled.mockResolvedValue({ modules: { sources: false } });
    mount(undefined);
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    expect(setModuleEnabled).toHaveBeenCalledTimes(1);
    const request = setModuleEnabled.mock.calls[0][0] as { moduleId: string };
    expect(request.moduleId).toBe("sources");
    expect(screen.getByRole("checkbox", { name: /Claims/ })).not.toBeChecked();
  });

  it("a failed claims save keeps the writer's choice and shows a text error", async () => {
    setModuleEnabled.mockRejectedValue(new Error("Disk full."));
    mount(undefined);
    await userEvent.click(screen.getByRole("checkbox", { name: /Claims/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not turn Claims on: Disk full.",
    );
    expect(screen.getByRole("checkbox", { name: /Claims/ })).toBeChecked();
  });
});

describe("hooks read the per-module default", () => {
  function wrap(modules?: Record<string, boolean>) {
    const store = makeStoreWith(modules);
    return function Wrapper({
      children,
    }: {
      children: React.ReactNode;
    }): JSX.Element {
      return <Provider store={store}>{children}</Provider>;
    };
  }

  it("useModuleEnabled: absent claims entry is off, absent Sources entry is on", () => {
    const wrapper = wrap(undefined);
    const claims = renderHook(() => useModuleEnabled("claims"), { wrapper });
    const sources = renderHook(() => useModuleEnabled("sources"), { wrapper });
    expect(claims.result.current).toBe(false);
    expect(sources.result.current).toBe(true);
  });

  it("useModuleEnabled: a StaticModulesProvider map without claims is off", () => {
    function Wrapper({ children }: { children: React.ReactNode }): JSX.Element {
      return (
        <Provider store={makeStoreWith(undefined)}>
          <StaticModulesProvider value={{ sources: true }}>
            {children}
          </StaticModulesProvider>
        </Provider>
      );
    }
    const { result } = renderHook(() => useModuleEnabled("claims"), {
      wrapper: Wrapper,
    });
    expect(result.current).toBe(false);
  });

  it("useModuleViews: with claims off the Claims view is registered but not enabled", () => {
    const { result } = renderHook(() => useModuleViews(FAKE_UI_REGISTRY), {
      wrapper: wrap(undefined),
    });
    expect(result.current.registered.map((v) => v.id)).toContain("claims");
    expect(result.current.enabled.map((v) => v.id)).toEqual(["sources"]);
  });

  it("useModuleViews: with claims on the Claims view is enabled", () => {
    const { result } = renderHook(() => useModuleViews(FAKE_UI_REGISTRY), {
      wrapper: wrap({ claims: true }),
    });
    expect(result.current.enabled.map((v) => v.id)).toEqual([
      "sources",
      "claims",
    ]);
  });
});

/**
 * A fake shell holding the open view in state and applying the same
 * "registered but not enabled, so leave it" rule `AppShell` applies to a
 * switched-off module view. `AppShell` itself is not mounted here.
 */
function FakeShell(): JSX.Element {
  const views = useModuleViews(FAKE_UI_REGISTRY);
  const [view, setView] = React.useState<string>("claims");
  React.useEffect(() => {
    const isOff =
      views.registered.some((v) => v.id === view) &&
      !views.enabled.some((v) => v.id === view);
    if (isOff) setView("edit");
  }, [views, view]);
  return <p data-testid="open-view">{view}</p>;
}

describe("an open Claims tab when the module is off", () => {
  it("falls back to Edit", () => {
    render(
      <Provider store={makeStoreWith(undefined)}>
        <FakeShell />
      </Provider>,
    );
    expect(screen.getByTestId("open-view")).toHaveTextContent("edit");
  });

  it("stays on Claims when the module is on", () => {
    render(
      <Provider store={makeStoreWith({ claims: true })}>
        <FakeShell />
      </Provider>,
    );
    expect(screen.getByTestId("open-view")).toHaveTextContent("claims");
  });
});
