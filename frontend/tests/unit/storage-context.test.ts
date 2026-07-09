import { describe, it, expect } from "vitest";
import type { StorageAdapter } from "../../src/lib/models/io";
import {
  runInStorageContext,
  getStorageContext,
} from "../../src/lib/models/storage-context";

/**
 * Minimal `StorageAdapter`-shaped stub. Only identity matters for these
 * tests — none of the methods are invoked.
 */
function createFakeAdapter(): StorageAdapter {
  return {
    mkdir: async () => {},
    writeFile: async () => {},
    readFile: async () => "",
    readdir: async () => [],
    stat: async () => ({}) as Awaited<ReturnType<StorageAdapter["stat"]>>,
    rm: async () => {},
    rename: async () => {},
  } as StorageAdapter;
}

/** Resolves after a macrotask tick, forcing interleaving across contexts. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("storage-context", () => {
  it("returns undefined when called outside any runInStorageContext scope", () => {
    expect(getStorageContext()).toBeUndefined();
  });

  it("keeps distinct contexts isolated across interleaved async chains", async () => {
    const adapterA = createFakeAdapter();
    const adapterB = createFakeAdapter();

    const observedA: Array<
      { tenantRoot: string; adapter: StorageAdapter } | undefined
    > = [];
    const observedB: Array<
      { tenantRoot: string; adapter: StorageAdapter } | undefined
    > = [];

    const chainA = runInStorageContext(
      { tenantRoot: "/tenants/a", adapter: adapterA },
      async () => {
        observedA.push(getStorageContext());
        await tick();
        observedA.push(getStorageContext());
        await tick();
        observedA.push(getStorageContext());
      },
    );

    // Stagger the start of chain B so the two chains interleave across
    // await boundaries rather than running strictly sequentially.
    await tick();

    const chainB = runInStorageContext(
      { tenantRoot: "/tenants/b", adapter: adapterB },
      async () => {
        observedB.push(getStorageContext());
        await tick();
        observedB.push(getStorageContext());
        await tick();
        observedB.push(getStorageContext());
      },
    );

    await Promise.all([chainA, chainB]);

    expect(observedA).toHaveLength(3);
    expect(observedB).toHaveLength(3);

    for (const snapshot of observedA) {
      expect(snapshot?.tenantRoot).toBe("/tenants/a");
      expect(snapshot?.adapter).toBe(adapterA);
    }

    for (const snapshot of observedB) {
      expect(snapshot?.tenantRoot).toBe("/tenants/b");
      expect(snapshot?.adapter).toBe(adapterB);
    }

    // Outside both chains, there is no active context again.
    expect(getStorageContext()).toBeUndefined();
  });
});
