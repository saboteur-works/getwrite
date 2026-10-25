/**
 * Feature 93, Task 19 (FR-17, AC-10): a `withMetaLock` call made from inside a
 * `withMetaLock` callback for the same key is detected under test and throws
 * instead of waiting on itself forever.
 */
import { afterEach, describe, expect, it } from "vitest";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import {
  getLockGuard,
  installLockGuard,
  LockOrderViolationError,
  type LockGuardHooks,
} from "../../src/lib/models/lock-guard";
import { createLockOrderGuard } from "../helpers/lockOrderGuard";

const HANG = Symbol("hang");

function orHang<T>(p: Promise<T>): Promise<T | typeof HANG> {
  return Promise.race([
    p,
    new Promise<typeof HANG>((r) => setTimeout(() => r(HANG), 200)),
  ]);
}

describe("withMetaLock nesting detection (test-only guard)", () => {
  it("throws on a nested call for the same key rather than hanging", async () => {
    const outcome = await orHang(
      withMetaLock("/p/a", async () => {
        await withMetaLock("/p/a", async () => undefined);
      }).then(
        () => "resolved" as const,
        (e: unknown) => e,
      ),
    );
    expect(outcome).not.toBe(HANG);
    expect(outcome).toBeInstanceOf(LockOrderViolationError);
    expect(String(outcome)).toContain("/p/a");
  });

  it("throws on a nested call made after an await inside the callback", async () => {
    const outcome = await orHang(
      withMetaLock("/p/a2", async () => {
        await new Promise((r) => setTimeout(r, 5));
        await withMetaLock("/p/a2", async () => undefined);
      }).then(
        () => "resolved" as const,
        (e: unknown) => e,
      ),
    );
    expect(outcome).toBeInstanceOf(LockOrderViolationError);
  });

  it("does not throw for sequential calls on the same key", async () => {
    await withMetaLock("/p/b", async () => undefined);
    await expect(withMetaLock("/p/b", async () => "ok")).resolves.toBe("ok");
  });

  it("does not throw for concurrent calls on the same key from outside", async () => {
    const order: string[] = [];
    await Promise.all([
      withMetaLock("/p/c", async () => void order.push("1")),
      withMetaLock("/p/c", async () => void order.push("2")),
    ]);
    expect(order).toEqual(["1", "2"]);
  });

  it("does not throw for a nested call on a different key", async () => {
    await expect(
      withMetaLock("/p/d", () => withMetaLock("/p/e", async () => "inner")),
    ).resolves.toBe("inner");
  });
});

describe("without a guard installed", () => {
  const previous: LockGuardHooks | null = getLockGuard();
  afterEach(() => installLockGuard(previous ?? createLockOrderGuard()));

  it("withMetaLock behaves as before and the slot is null", async () => {
    installLockGuard(null);
    expect(getLockGuard()).toBeNull();
    const events: string[] = [];
    await Promise.all([
      withMetaLock("/p/f", async () => {
        await new Promise((r) => setTimeout(r, 5));
        events.push("a");
      }),
      withMetaLock("/p/f", async () => void events.push("b")),
    ]);
    expect(events).toEqual(["a", "b"]);
  });
});
