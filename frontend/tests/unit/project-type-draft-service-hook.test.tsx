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
