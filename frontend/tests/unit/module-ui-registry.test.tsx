// Last Updated: 2026-11-07

/**
 * Feature 103, Task 9 (FR-3 UI side, FR-4, FR-11, FR-31, OQ-12): the UI
 * registry declares the view slot kind only and is imported by nothing in the
 * worker graph; `useModuleEnabled` reads the live store and honours the
 * Storybook decorator's static provider.
 */
import React from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it } from "vitest";
import projectsReducer, {
  setProject,
  type StoredProject,
} from "../../src/store/projectsSlice";
import { useModuleEnabled } from "../../components/Modules/useModuleEnabled";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import * as uiRegistryModule from "../../components/Modules/uiRegistry";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");

function makeStore(modules?: Record<string, boolean>) {
  const project: StoredProject = {
    id: "p1",
    rootPath: "/p1",
    folders: [],
    resources: [],
    modules,
  };
  return configureStore({
    reducer: { projects: projectsReducer },
    preloadedState: {
      projects: { selectedProjectId: "p1", projects: { p1: project } },
    },
  });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

afterEach(cleanup);

describe("useModuleEnabled with the store", () => {
  it("is true when the project has no modules entry", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(makeStore()),
    });
    expect(result.current).toBe(true);
  });

  it("is true for an id absent from a non-empty modules map", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(makeStore({ other: false })),
    });
    expect(result.current).toBe(true);
  });

  it("is false only for an explicit false", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(makeStore({ sources: false })),
    });
    expect(result.current).toBe(false);
  });

  it("is true for an explicit true", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(makeStore({ sources: true })),
    });
    expect(result.current).toBe(true);
  });

  it("follows the live store value when the project changes", () => {
    const store = makeStore({ sources: true });
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(store),
    });
    expect(result.current).toBe(true);
    act(() => {
      store.dispatch(
        setProject({
          id: "p1",
          rootPath: "/p1",
          folders: [],
          resources: [],
          modules: { sources: false },
        }),
      );
    });
    expect(result.current).toBe(false);
    act(() => {
      store.dispatch(
        setProject({ id: "p1", rootPath: "/p1", folders: [], resources: [] }),
      );
    });
    expect(result.current).toBe(true);
  });

  it("is true when no project is selected", () => {
    const store = configureStore({ reducer: { projects: projectsReducer } });
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: wrapperFor(store as unknown as ReturnType<typeof makeStore>),
    });
    expect(result.current).toBe(true);
  });
});

describe("useModuleEnabled under StaticModulesProvider", () => {
  function withStatic(
    modules: Record<string, boolean> | undefined,
    storeModules?: Record<string, boolean>,
  ) {
    const Inner = wrapperFor(makeStore(storeModules));
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <Inner>
          <StaticModulesProvider value={modules}>
            {children}
          </StaticModulesProvider>
        </Inner>
      );
    };
  }

  it("overrides the store with the story's flags: off", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: withStatic({ sources: false }),
    });
    expect(result.current).toBe(false);
  });

  it("overrides the store with the story's flags: on", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: withStatic({ sources: true }, { sources: false }),
    });
    expect(result.current).toBe(true);
  });

  it("with no value falls through to the store", () => {
    const { result } = renderHook(() => useModuleEnabled("sources"), {
      wrapper: withStatic(undefined, { sources: false }),
    });
    expect(result.current).toBe(false);
  });
});

describe("UI registry shape (OQ-12, FR-11)", () => {
  it("declares the view, attachments-section and citation-control slot kinds only (Tasks 20, 31)", () => {
    expect(uiRegistryModule.UI_SLOT_KINDS).toEqual([
      "view",
      "attachmentsSection",
      "citationControl",
    ]);
  });

  it("an entry has an id, a view slot and at most an attachments-section and a citation-control slot", () => {
    for (const entry of uiRegistryModule.UI_MODULE_VIEWS) {
      const keys = Object.keys(entry).sort();
      expect(["id", "view"].every((k) => keys.includes(k))).toBe(true);
      expect(
        keys.filter(
          (k) =>
            !["id", "view", "attachmentsSection", "citationControl"].includes(
              k,
            ),
        ),
      ).toEqual([]);
    }
  });

  it("only the Sources module has an attachments-section slot, the slot kind's real consumer", () => {
    const withSlot = uiRegistryModule.UI_MODULE_VIEWS.filter(
      (entry) => entry.attachmentsSection !== undefined,
    ).map((entry) => entry.id);
    expect(withSlot).toEqual(["sources"]);
  });

  it("looks a view up by module id and returns undefined when none", () => {
    const registry = uiRegistryModule.createUiModuleRegistry([
      { id: "t", view: { id: "t", label: "T", render: () => null } },
    ]);
    expect(registry.getView("t")?.label).toBe("T");
    expect(registry.getView("missing")).toBeUndefined();
    expect(() =>
      uiRegistryModule.createUiModuleRegistry([
        { id: "t", view: { id: "t", label: "T", render: () => null } },
        { id: "t", view: { id: "t", label: "T", render: () => null } },
      ]),
    ).toThrow(/Duplicate/);
  });

  it("source declares no fields for other slot kinds", () => {
    const src = readFileSync(
      path.join(FRONTEND_ROOT, "components/Modules/uiRegistry.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const word of [
      "resourceType",
      "trashKind",
      "importer",
      "permission",
      "projectType",
    ]) {
      expect(code.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
}

describe("UI registry is outside the worker graph (FR-4)", () => {
  it("is not imported from src/lib/models, core.ts, cli/src or electron/src", () => {
    const files: string[] = [];
    walk(path.join(FRONTEND_ROOT, "src/lib/models"), files);
    files.push(path.join(FRONTEND_ROOT, "src/lib/core.ts"));
    walk(path.join(REPO_ROOT, "cli/src"), files);
    walk(path.join(REPO_ROOT, "electron/src"), files);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /components\/Modules\/(uiRegistry|useModuleEnabled|ModulesContext)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
