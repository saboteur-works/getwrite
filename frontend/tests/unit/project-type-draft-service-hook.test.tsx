import { describe, it, expect, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, act } from "@testing-library/react";
import { useProjectTypeDraftService } from "../../components/project-types/ProjectTypeDraftService";
import type {
  ProjectTypesTransport,
  ProjectTypeWriteOutcome,
} from "../../src/lib/api/project-types";
import type {
  ProjectTypeDefinition,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";

const def = (id: string, name: string): ProjectTypeDefinition => ({
  id,
  name,
  description: "",
  folders: [{ name: "Drafts" }],
  defaultFolders: [],
  defaultResources: [],
  statuses: [],
});

const templates: ProjectTypeTemplateFile[] = [
  { fileName: "novel.json", definition: def("novel", "Novel") },
  { fileName: "mine.json", definition: def("mine", "Mine"), source: "saved" },
];

function transportWith(
  create: (spec: ProjectTypeDefinition) => Promise<ProjectTypeWriteOutcome>,
): ProjectTypesTransport {
  return {
    list: vi.fn(),
    create: vi.fn(create),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

describe("useProjectTypeDraftService writes", () => {
  it("saving an edited built-in adds a saved copy, keeps the built-in listed and selects the copy", async () => {
    const transport = transportWith(async (spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    }));
    const { result } = renderHook(() =>
      useProjectTypeDraftService(templates, async () => transport),
    );
    act(() => {
      result.current.updateSelectedDefinition((d) => ({
        ...d,
        description: "edited",
      }));
    });
    expect(result.current.selectedItem?.hasChanges).toBe(true);

    await act(async () => {
      await result.current.handleSave();
    });

    const ids = result.current.items.map((i) => i.definition.id);
    expect(ids).toContain("novel");
    expect(ids).toHaveLength(3);
    const builtIn = result.current.items.find(
      (i) => i.definition.id === "novel",
    );
    expect(builtIn?.hasChanges).toBe(false);
    expect(builtIn?.definition.description).toBe("");
    expect(builtIn?.source).toBe("built-in");
    expect(result.current.selectedItem?.source).toBe("saved");
    expect(result.current.selectedItem?.hasChanges).toBe(false);
    expect(result.current.isWriting).toBe(false);
  });

  it("a refusal leaves the draft unchanged and still selected", async () => {
    const transport = transportWith(async () => ({
      ok: false,
      reason: "saving-unavailable",
      message: "Saving project types is not available here.",
    }));
    const { result } = renderHook(() =>
      useProjectTypeDraftService(templates, async () => transport),
    );
    act(() => {
      result.current.updateSelectedDefinition((d) => ({
        ...d,
        description: "edited",
      }));
    });
    const before = result.current.items;

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleSave();
    });

    expect(outcome).toMatchObject({ ok: false, kind: "refused" });
    expect(result.current.items).toEqual(before);
  });

  it("deleting a saved type removes it; a built-in delete is refused and keeps it", async () => {
    const transport = transportWith(async () => {
      throw new Error("unused");
    });
    (transport.remove as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      fileName: "mine.json",
    });
    const { result } = renderHook(() =>
      useProjectTypeDraftService(templates, async () => transport),
    );

    let refused: unknown;
    await act(async () => {
      refused = await result.current.handleDelete();
    });
    expect(refused).toMatchObject({ ok: false, reason: "built-in" });
    expect(result.current.items).toHaveLength(2);

    act(() => result.current.setSelectedKey("file:mine.json"));
    await act(async () => {
      await result.current.handleDelete();
    });
    expect(result.current.items.map((i) => i.definition.id)).toEqual(["novel"]);
  });
});

describe("useProjectTypeDraftService module declaration (Feature 108, FR-5)", () => {
  const withModules: ProjectTypeTemplateFile[] = [
    { fileName: "novel.json", definition: def("novel", "Novel") },
    {
      fileName: "mine.json",
      definition: { ...def("mine", "Mine"), modules: { claims: true } },
      source: "saved",
    },
  ];

  it("exposes one not-set state per manifest module for a type with no declaration", () => {
    const { result } = renderHook(() => useProjectTypeDraftService(templates));
    expect(result.current.moduleStates).toEqual({
      sources: "not-set",
      claims: "not-set",
    });
  });

  it("loads an existing type's declaration into the draft", () => {
    const { result } = renderHook(() =>
      useProjectTypeDraftService(withModules),
    );
    act(() => result.current.setSelectedKey("file:mine.json"));
    expect(result.current.moduleStates).toEqual({
      sources: "not-set",
      claims: "on",
    });
    expect(result.current.canEditModules).toBe(true);
  });

  it("a built-in's declaration is read-only: a change is ignored", () => {
    const { result } = renderHook(() =>
      useProjectTypeDraftService(withModules),
    );
    expect(result.current.canEditModules).toBe(false);
    act(() => result.current.handleModuleStateChange("claims", "on"));
    expect(result.current.selectedItem?.hasChanges).toBe(false);
    expect(result.current.moduleStates.claims).toBe("not-set");
  });

  it("changing a saved type's state marks it edited and sends exactly that entry", async () => {
    const update = vi.fn(async (_id: string, spec: ProjectTypeDefinition) => ({
      ok: true as const,
      fileName: "mine.json",
      spec,
    }));
    const transport: ProjectTypesTransport = {
      list: vi.fn(),
      create: vi.fn(),
      update,
      remove: vi.fn(),
    };
    const { result } = renderHook(() =>
      useProjectTypeDraftService(withModules, async () => transport),
    );
    act(() => result.current.setSelectedKey("file:mine.json"));
    act(() => result.current.handleModuleStateChange("sources", "off"));
    act(() => result.current.handleModuleStateChange("claims", "not-set"));
    expect(result.current.selectedItem?.hasChanges).toBe(true);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(update.mock.calls[0]?.[1].modules).toEqual({ sources: false });
  });

  it("a failed save keeps the draft and returns an error text", async () => {
    const update = vi.fn(async () => {
      throw new Error("disk full");
    });
    const transport: ProjectTypesTransport = {
      list: vi.fn(),
      create: vi.fn(),
      update,
      remove: vi.fn(),
    };
    const { result } = renderHook(() =>
      useProjectTypeDraftService(withModules, async () => transport),
    );
    act(() => result.current.setSelectedKey("file:mine.json"));
    act(() => result.current.handleModuleStateChange("claims", "off"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleSave();
    });
    expect(outcome).toMatchObject({
      ok: false,
      kind: "failed",
      message: "disk full",
    });
    expect(result.current.selectedItem?.hasChanges).toBe(true);
    expect(result.current.moduleStates.claims).toBe("off");
  });

  it("where saving is unavailable (hosted) no save is offered and nothing is sent", async () => {
    const transport = transportWith(async () => {
      throw new Error("unused");
    });
    const { result } = renderHook(() =>
      useProjectTypeDraftService(withModules, async () => transport, {
        savingAvailable: false,
      }),
    );
    act(() => result.current.setSelectedKey("file:mine.json"));
    expect(result.current.canSave).toBe(false);
    expect(result.current.canEditModules).toBe(false);
    act(() => result.current.handleModuleStateChange("claims", "off"));
    expect(result.current.moduleStates.claims).toBe("on");
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleSave();
    });
    expect(outcome).toMatchObject({
      ok: false,
      kind: "refused",
      reason: "saving-unavailable",
    });
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.update).not.toHaveBeenCalled();
  });

  it("saving is offered by default", () => {
    const { result } = renderHook(() => useProjectTypeDraftService(templates));
    expect(result.current.canSave).toBe(true);
  });
});
