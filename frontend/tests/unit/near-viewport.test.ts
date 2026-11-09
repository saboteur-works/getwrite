// @vitest-environment jsdom
/** Feature 105 Task 5: the near-viewport helper, with a fake observer. */
import { afterEach, describe, it, expect, vi } from "vitest";
import { observeNearViewport } from "../../src/lib/near-viewport";

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = 0;
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  disconnect(): void {
    this.disconnected += 1;
  }
  fire(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("observeNearViewport", () => {
  it("fires once when the element becomes near, then disconnects", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const el = document.createElement("div");
    const onNear = vi.fn();
    observeNearViewport(el, onNear, "300px");
    const obs = FakeObserver.instances[0];
    expect(obs.observed).toEqual([el]);
    expect(obs.options?.rootMargin).toBe("300px");
    obs.fire(false);
    expect(onNear).not.toHaveBeenCalled();
    obs.fire(true);
    obs.fire(true);
    expect(onNear).toHaveBeenCalledTimes(1);
    expect(obs.disconnected).toBeGreaterThanOrEqual(1);
  });

  it("disconnects on release and never fires afterwards", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const onNear = vi.fn();
    const release = observeNearViewport(document.createElement("div"), onNear);
    const obs = FakeObserver.instances[0];
    release();
    expect(obs.disconnected).toBe(1);
    obs.fire(true);
    expect(onNear).not.toHaveBeenCalled();
  });

  it("treats the element as near when no IntersectionObserver exists", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onNear = vi.fn();
    observeNearViewport(document.createElement("div"), onNear);
    await Promise.resolve();
    expect(onNear).toHaveBeenCalledTimes(1);
  });

  it("does not fire in the fallback if released first", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onNear = vi.fn();
    const release = observeNearViewport(document.createElement("div"), onNear);
    release();
    await Promise.resolve();
    expect(onNear).not.toHaveBeenCalled();
  });
});
