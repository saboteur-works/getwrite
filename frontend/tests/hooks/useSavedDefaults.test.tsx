/**
 * Feature 101, Task 5 (FR-4, FR-5, FR-6): saved-defaults read state.
 */
import React, { Component, type ReactNode } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSavedDefaults } from "../../components/common/useSavedDefaults";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import * as compileDefaultsClient from "../../src/lib/api/compile-defaults";
import * as exportDefaultsClient from "../../src/lib/api/export-defaults";

describe("useSavedDefaults", () => {
  it("is loading, then ok with the saved ids; no setter is called", async () => {
    const setCompile = vi.spyOn(compileDefaultsClient, "setCompileDefaults");
    const setExport = vi.spyOn(exportDefaultsClient, "setExportDefaults");
    const read = vi.fn().mockResolvedValue(["a", "gone"]);
    const { result } = renderHook(() => useSavedDefaults("p1", read));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(result.current.state).toEqual({
      status: "ok",
      excludedResourceIds: ["a", "gone"],
    });
    expect(read).toHaveBeenCalledWith("p1");
    expect(setCompile).not.toHaveBeenCalled();
    expect(setExport).not.toHaveBeenCalled();
  });

  it("is ok with no ids when the keys are absent", async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSavedDefaults("p1", read));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(result.current.state).toEqual({
      status: "ok",
      excludedResourceIds: [],
    });
  });

  it("a read error is `failed`, and retry re-reads", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(["a"]);
    const { result } = renderHook(() => useSavedDefaults("p1", read));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({
      status: "ok",
      excludedResourceIds: ["a"],
    });
  });

  it("does not read when disabled (entity mode) and reports ok with none", () => {
    const read = vi.fn();
    const { result } = renderHook(() =>
      useSavedDefaults("p1", read, { enabled: false }),
    );
    expect(read).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({
      status: "ok",
      excludedResourceIds: [],
    });
  });

  it("does not read without a project id", () => {
    const read = vi.fn();
    const { result } = renderHook(() => useSavedDefaults(undefined, read));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("ok");
  });

  it("discards a stale response after the project changes", async () => {
    let resolveFirst: (v: string[]) => void = () => undefined;
    const read = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string[]>((r) => (resolveFirst = r)),
      )
      .mockResolvedValueOnce(["new"]);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSavedDefaults(id, read),
      { initialProps: { id: "p1" } },
    );
    rerender({ id: "p2" });
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    await act(async () => {
      resolveFirst(["old"]);
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({
      status: "ok",
      excludedResourceIds: ["new"],
    });
  });

  it("rethrows a locked-access error instead of reporting `failed`", async () => {
    const caught = vi.fn();
    class Boundary extends Component<{ children: ReactNode }, { e: boolean }> {
      state = { e: false };
      static getDerivedStateFromError(): { e: boolean } {
        return { e: true };
      }
      componentDidCatch(error: unknown): void {
        caught(error);
      }
      render(): ReactNode {
        return this.state.e ? "boundary" : this.props.children;
      }
    }
    const locked = new ProjectLockedError("p1");
    const read = vi.fn().mockRejectedValue(locked);
    function Probe(): JSX.Element {
      const { state } = useSavedDefaults("p1", read);
      return <p>{state.status}</p>;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(
      <Boundary>
        <Probe />
      </Boundary>,
    );
    await waitFor(() => expect(view.container.textContent).toBe("boundary"));
    expect(caught).toHaveBeenCalledWith(locked);
    spy.mockRestore();
  });
});
