/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useCaptureProjectChoice,
  type CaptureProjectOption,
} from "../../src/hooks/useCaptureProjectChoice";
import {
  LAST_CAPTURED_PROJECT_STORAGE_KEY,
  LAST_OPENED_PROJECT_STORAGE_KEY,
} from "../../src/lib/capture-preferences";

const listProjects = vi.fn();
vi.mock("../../src/lib/api/projects", () => ({
  listProjects: (...args: unknown[]) => listProjects(...args),
}));

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

function entry(id: string, name: string) {
  return {
    project: { id, name, createdAt: "2026-01-01T00:00:00.000Z" },
    folders: [],
    resources: [],
  };
}
const lockedEntry = (id: string) => ({
  project: { id, createdAt: "2026-02-03T00:00:00.000Z" },
  folders: [],
  resources: [],
  isLocked: true,
  isEncrypted: true,
});
const unusableEntry = (id: string) => ({
  project: { id },
  folders: [],
  resources: [],
  isUnusable: true,
  unusableReason: "unreadable",
});

describe("useCaptureProjectChoice", () => {
  beforeEach(() => {
    listProjects.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("does not read the list while closed", () => {
    renderHook(() => useCaptureProjectChoice(false));
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("is loading, then ready with the default from last-captured", async () => {
    window.localStorage.setItem(LAST_CAPTURED_PROJECT_STORAGE_KEY, ID_B);
    listProjects.mockResolvedValue([entry(ID_A, "Alpha"), entry(ID_B, "Beta")]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.defaultProjectId).toBe(ID_B);
    expect(result.current.options.map((o: { id: string }) => o.id)).toEqual([
      ID_A,
      ID_B,
    ]);
  });

  it("falls back to last-opened when last-captured is gone", async () => {
    window.localStorage.setItem(LAST_CAPTURED_PROJECT_STORAGE_KEY, ID_C);
    window.localStorage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, ID_A);
    listProjects.mockResolvedValue([entry(ID_B, "Beta"), entry(ID_A, "Alpha")]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.defaultProjectId).toBe(ID_A);
  });

  it("treats a malformed stored id as gone", async () => {
    window.localStorage.setItem(LAST_CAPTURED_PROJECT_STORAGE_KEY, "../x");
    listProjects.mockResolvedValue([entry(ID_A, "Alpha")]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.defaultProjectId).toBe(ID_A);
  });

  it("reports 'empty' with no default when there are no projects", async () => {
    listProjects.mockResolvedValue([]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.defaultProjectId).toBeNull();
    expect(result.current.options).toEqual([]);
  });

  it("reports 'empty' when only unusable projects exist", async () => {
    listProjects.mockResolvedValue([unusableEntry(ID_A)]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });

  it("lists a locked project as 'Locked project' with its date and no name; omits unusable", async () => {
    listProjects.mockResolvedValue([
      entry(ID_A, "Alpha"),
      lockedEntry(ID_B),
      unusableEntry(ID_C),
    ]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const ids = result.current.options.map((o: { id: string }) => o.id);
    expect(ids).toEqual([ID_A, ID_B]);
    const locked = result.current.options[1] as Extract<
      CaptureProjectOption,
      { kind: "locked" }
    >;
    expect(locked.kind).toBe("locked");
    expect(locked.label).toBe("Locked project");
    expect(locked.encryptedAt).toBe("2026-02-03T00:00:00.000Z");
    expect(locked).not.toHaveProperty("name");
  });

  it("shows only what the tenant-scoped listing returns", async () => {
    listProjects.mockResolvedValue([entry(ID_A, "Mine")]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(result.current.options).toHaveLength(1);
  });

  it("reports 'failed' with a readable message, never empty, and retries", async () => {
    listProjects.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.errorMessage).toMatch(/projects/i);

    listProjects.mockResolvedValue([entry(ID_A, "Alpha")]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.defaultProjectId).toBe(ID_A);
  });

  it("still lists and defaults when localStorage reads throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    listProjects.mockResolvedValue([entry(ID_A, "Alpha")]);
    const { result } = renderHook(() => useCaptureProjectChoice(true));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.defaultProjectId).toBe(ID_A);
  });

  it("re-reads the list each time the box opens", async () => {
    listProjects.mockResolvedValue([entry(ID_A, "Alpha")]);
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useCaptureProjectChoice(open),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2));
  });
});
