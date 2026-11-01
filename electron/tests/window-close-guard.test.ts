/**
 * The window waits for the page's saves before it closes: the close decision,
 * the time limit, and what happens when a save fails.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createCloseGuard,
  type CloseGuardDeps,
} from "../src/window-close-guard";

function setup(overrides: Partial<CloseGuardDeps> = {}) {
  const deps: CloseGuardDeps = {
    flush: vi.fn(async () => true),
    shouldSkipFlush: vi.fn(() => false),
    timeoutMs: 5000,
    confirmCloseAnyway: vi.fn(async () => false),
    proceed: vi.fn(),
    onKeepEditing: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
  return { deps, guard: createCloseGuard(deps) };
}

const closeEvent = () => ({ preventDefault: vi.fn() });
const settle = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
});

describe("createCloseGuard", () => {
  it("holds the close until the saves finish, then proceeds", async () => {
    let finish: (ok: boolean) => void = () => {};
    const { deps, guard } = setup({
      flush: vi.fn(() => new Promise<boolean>((r) => (finish = r))),
    });
    const event = closeEvent();
    guard.onClose(event);
    await settle();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(deps.proceed).not.toHaveBeenCalled();
    finish(true);
    await settle();
    expect(deps.proceed).toHaveBeenCalledOnce();
    expect(deps.confirmCloseAnyway).not.toHaveBeenCalled();
  });

  it("lets the close through once the saves have finished", async () => {
    const { deps, guard } = setup();
    guard.onClose(closeEvent());
    await settle();
    const second = closeEvent();
    guard.onClose(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(deps.flush).toHaveBeenCalledOnce();
  });

  it("asks only once while a flush is running", async () => {
    let finish: (ok: boolean) => void = () => {};
    const { deps, guard } = setup({
      flush: vi.fn(() => new Promise<boolean>((r) => (finish = r))),
    });
    guard.onClose(closeEvent());
    const second = closeEvent();
    guard.onClose(second);
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(deps.flush).toHaveBeenCalledOnce();
    finish(true);
    await settle();
    expect(deps.proceed).toHaveBeenCalledOnce();
  });

  it("does not wait when the window is not showing the app's own page", () => {
    const { deps, guard } = setup({ shouldSkipFlush: () => true });
    const event = closeEvent();
    guard.onClose(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.flush).not.toHaveBeenCalled();
  });

  it("keeps the window open when a save fails and the writer keeps editing", async () => {
    const { deps, guard } = setup({ flush: vi.fn(async () => false) });
    const event = closeEvent();
    guard.onClose(event);
    await settle();
    expect(deps.confirmCloseAnyway).toHaveBeenCalledOnce();
    expect(deps.proceed).not.toHaveBeenCalled();
    expect(deps.onKeepEditing).toHaveBeenCalledOnce();
    // The next close tries the saves again.
    const next = closeEvent();
    guard.onClose(next);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(deps.flush).toHaveBeenCalledTimes(2);
  });

  it("closes when a save fails and the writer chooses Close Anyway", async () => {
    const { deps, guard } = setup({
      flush: vi.fn(async () => false),
      confirmCloseAnyway: vi.fn(async () => true),
    });
    guard.onClose(closeEvent());
    await settle();
    expect(deps.proceed).toHaveBeenCalledOnce();
    expect(deps.onKeepEditing).not.toHaveBeenCalled();
  });

  it("treats a flush that throws as a failed save", async () => {
    const { deps, guard } = setup({
      flush: vi.fn(async () => {
        throw new Error("page gone");
      }),
    });
    guard.onClose(closeEvent());
    await settle();
    expect(deps.confirmCloseAnyway).toHaveBeenCalledOnce();
    expect(deps.proceed).not.toHaveBeenCalled();
  });

  it("treats no answer within the time limit as a failed save", async () => {
    vi.useFakeTimers();
    const { deps, guard } = setup({
      flush: vi.fn(() => new Promise<boolean>(() => {})),
    });
    guard.onClose(closeEvent());
    await vi.advanceTimersByTimeAsync(4999);
    expect(deps.confirmCloseAnyway).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.confirmCloseAnyway).toHaveBeenCalledOnce();
  });
});
