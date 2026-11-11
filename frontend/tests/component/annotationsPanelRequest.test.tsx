/** @vitest-environment jsdom */
/**
 * Device run fix 2 and 4: a request from outside the editor (the Claims tab's
 * Open) opens the annotations panel of the editor on that resource and hands
 * the panel the row to bring into view. The request is consumed once, is
 * ignored for another resource, survives an editor that mounts after it, and
 * expires.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnotationsPanel } from "../../components/Editor/Annotations/useAnnotationsPanel";
import {
  REQUEST_MAX_AGE_MS,
  getAnnotationsPanelRequest,
  requestAnnotationsPanel,
  resetAnnotationsPanelRequestForTests,
} from "../../components/Editor/Annotations/annotationsPanelRequest";

beforeEach(() => resetAnnotationsPanelRequestForTests());
afterEach(() => {
  vi.useRealTimers();
  resetAnnotationsPanelRequestForTests();
});

describe("annotations panel request", () => {
  it("opens the panel for the matching resource, hands over the row, and is consumed", () => {
    const { result } = renderHook(() => useAnnotationsPanel("r1", null));
    expect(result.current.isOpen).toBe(false);
    act(() =>
      requestAnnotationsPanel({
        resourceId: "r1",
        annotationId: "a1",
        isPassageMissing: true,
      }),
    );
    expect(result.current.isOpen).toBe(true);
    expect(result.current.focus).toEqual({
      annotationId: "a1",
      isPassageMissing: true,
    });
    expect(getAnnotationsPanelRequest()).toBeNull();
    act(() => result.current.clearFocus());
    expect(result.current.focus).toBeNull();
    expect(result.current.isOpen).toBe(true);
  });

  it("ignores a request for another resource and keeps it for that editor", () => {
    const { result } = renderHook(() => useAnnotationsPanel("r1", null));
    act(() =>
      requestAnnotationsPanel({
        resourceId: "r2",
        annotationId: "a1",
        isPassageMissing: false,
      }),
    );
    expect(result.current.isOpen).toBe(false);
    expect(getAnnotationsPanelRequest()?.resourceId).toBe("r2");
  });

  it("applies a request that arrived before the editor for that resource mounted", () => {
    requestAnnotationsPanel({
      resourceId: "r1",
      annotationId: "a1",
      isPassageMissing: false,
    });
    const { result } = renderHook(() => useAnnotationsPanel("r1", null));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.focus?.annotationId).toBe("a1");
  });

  it("applies a request after the resource changes to the requested one, not wiped by the reset", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useAnnotationsPanel(id, null),
      { initialProps: { id: "r0" } },
    );
    act(() =>
      requestAnnotationsPanel({
        resourceId: "r1",
        annotationId: "a1",
        isPassageMissing: false,
      }),
    );
    expect(result.current.isOpen).toBe(false);
    rerender({ id: "r1" });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.focus?.annotationId).toBe("a1");
  });

  it("drops a request nobody consumed in time", () => {
    vi.useFakeTimers();
    requestAnnotationsPanel({
      resourceId: "r1",
      annotationId: "a1",
      isPassageMissing: false,
    });
    vi.advanceTimersByTime(REQUEST_MAX_AGE_MS + 1);
    expect(getAnnotationsPanelRequest()).toBeNull();
    const { result } = renderHook(() => useAnnotationsPanel("r1", null));
    expect(result.current.isOpen).toBe(false);
  });

  it("closing the panel drops the pending row focus", () => {
    const { result } = renderHook(() => useAnnotationsPanel("r1", null));
    act(() =>
      requestAnnotationsPanel({
        resourceId: "r1",
        annotationId: "a1",
        isPassageMissing: false,
      }),
    );
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.focus).toBeNull();
  });
});
