// Feature 107 Task 6: the ShareIn plugin wrapper, its web stub and the
// next.config.mjs alias, tested against a fake plugin. Whether the real
// Capacitor bridge replays a retained event is NOT claimed here (Task 14).
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseShareReceivedEvent,
  startShareListenerWith,
} from "../../src/store/transport/native-share-in-plugin";
import { startNativeShareListener as startStub } from "../../src/store/transport/native-share-in-plugin.web-stub";
import type {
  ShareInPluginContract,
  ShareReceivedEvent,
} from "../../src/lib/api/share-capture-types";

const root = path.resolve(__dirname, "..", "..");
const read = (rel: string): string =>
  fs.readFileSync(path.join(root, rel), "utf8");

interface FakePlugin extends ShareInPluginContract {
  emit: (event: unknown) => void;
  calls: string[];
  removed: number;
  listenerCount: () => number;
}

/** A fake plugin; `retained` events replay, in order, when a listener is added. */
function makeFake(retained: unknown[] = []): FakePlugin {
  const listeners = new Set<(e: ShareReceivedEvent) => void>();
  const fake: FakePlugin = {
    calls: [],
    removed: 0,
    listenerCount: () => listeners.size,
    emit: (event) => {
      for (const l of listeners) l(event as ShareReceivedEvent);
    },
    addListener: async (_name, listener) => {
      listeners.add(listener);
      fake.calls.push("addListener");
      for (const e of retained) listener(e as ShareReceivedEvent);
      return {
        remove: async () => {
          listeners.delete(listener);
          fake.removed += 1;
        },
      };
    },
    acknowledge: async ({ shareId }) => {
      fake.calls.push(`ack:${shareId}`);
    },
  };
  return fake;
}

const textShare = (id: string): ShareReceivedEvent => ({
  shareId: id,
  items: [{ kind: "text", text: "hello" }],
});
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const acks = (fake: FakePlugin): string[] =>
  fake.calls.filter((c) => c.startsWith("ack:"));

afterEach(() => vi.restoreAllMocks());

describe("parseShareReceivedEvent", () => {
  it("accepts text and image items, size optional", () => {
    const ev = {
      shareId: "s1",
      items: [
        { kind: "text", text: "a" },
        {
          kind: "image",
          uri: "content://x/1",
          name: "a.png",
          mimeType: "image/png",
        },
        {
          kind: "image",
          uri: "content://x/2",
          name: "b.png",
          mimeType: "image/png",
          size: 5,
        },
      ],
    };
    expect(parseShareReceivedEvent(ev)).toEqual({ ok: true, event: ev });
  });

  it.each([
    [
      "unknown item kind",
      { shareId: "s", items: [{ kind: "video", uri: "u" }] },
    ],
    [
      "image missing uri",
      {
        shareId: "s",
        items: [{ kind: "image", name: "n", mimeType: "image/png" }],
      },
    ],
    ["non-string text", { shareId: "s", items: [{ kind: "text", text: 4 }] }],
    ["missing shareId", { items: [{ kind: "text", text: "a" }] }],
    ["items not an array", { shareId: "s", items: "x" }],
    ["empty items", { shareId: "s", items: [] }],
    ["null", null],
    [
      "negative size",
      {
        shareId: "s",
        items: [
          {
            kind: "image",
            uri: "u",
            name: "n",
            mimeType: "image/png",
            size: -1,
          },
        ],
      },
    ],
  ])("rejects %s", (_label, ev) => {
    expect(parseShareReceivedEvent(ev).ok).toBe(false);
  });
});

describe("startShareListenerWith", () => {
  it("hands each event to the callback", async () => {
    const fake = makeFake();
    const onShare = vi.fn();
    await startShareListenerWith(fake, { onShare, onFailure: vi.fn() });
    fake.emit(textShare("a"));
    await flush();
    expect(onShare).toHaveBeenCalledWith(textShare("a"));
  });

  it("delivers replayed events once each, in order", async () => {
    const fake = makeFake([textShare("1"), textShare("2")]);
    const seen: string[] = [];
    await startShareListenerWith(fake, {
      onShare: (e) => void seen.push(e.shareId),
      onFailure: vi.fn(),
    });
    await flush();
    expect(seen).toEqual(["1", "2"]);
  });

  it("rejects a malformed event, reports it, passes nothing on, acknowledges nothing", async () => {
    const fake = makeFake();
    const onShare = vi.fn();
    const onFailure = vi.fn();
    await startShareListenerWith(fake, { onShare, onFailure });
    fake.emit({
      shareId: "bad",
      items: [{ kind: "image", name: "n", mimeType: "image/png" }],
    });
    await flush();
    expect(onShare).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(acks(fake)).toEqual([]);
  });

  it("acknowledges once, after the callback has taken the share, not before", async () => {
    const fake = makeFake();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    await startShareListenerWith(fake, {
      onShare: () => gate,
      onFailure: vi.fn(),
    });
    fake.emit(textShare("a"));
    await flush();
    expect(acks(fake)).toEqual([]);
    release();
    await flush();
    expect(acks(fake)).toEqual(["ack:a"]);
  });

  it("does not acknowledge when the callback throws, and reports it", async () => {
    const fake = makeFake();
    const onFailure = vi.fn();
    await startShareListenerWith(fake, {
      onShare: () => {
        throw new Error("boom");
      },
      onFailure,
    });
    fake.emit(textShare("a"));
    await flush();
    expect(acks(fake)).toEqual([]);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("reports a failed acknowledge", async () => {
    const fake = makeFake();
    fake.acknowledge = async () => {
      throw new Error("nope");
    };
    const onFailure = vi.fn();
    await startShareListenerWith(fake, { onShare: vi.fn(), onFailure });
    fake.emit(textShare("a"));
    await flush();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("removes its listener on teardown", async () => {
    const fake = makeFake();
    const session = await startShareListenerWith(fake, {
      onShare: vi.fn(),
      onFailure: vi.fn(),
    });
    expect(fake.listenerCount()).toBe(1);
    await session.stop();
    expect(fake.listenerCount()).toBe(0);
    expect(fake.removed).toBe(1);
  });
});

describe("web stub", () => {
  it("registers nothing, throws nothing and never emits", async () => {
    const onShare = vi.fn();
    const onFailure = vi.fn();
    const session = await startStub({ onShare, onFailure });
    await expect(session.stop()).resolves.toBeUndefined();
    await flush();
    expect(onShare).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe("build wiring", () => {
  const loader = read("src/lib/api/share-in.ts");
  const config = read("next.config.mjs");

  it("loads the plugin module through a literal dynamic import", () => {
    expect(loader).toContain(
      'import("../../store/transport/native-share-in-plugin")',
    );
  });

  it("aliases that literal specifier to the web stub in next.config.mjs", () => {
    expect(config).toMatch(
      /"\.\.\/\.\.\/store\/transport\/native-share-in-plugin":\s*"\.\/src\/store\/transport\/native-share-in-plugin\.web-stub"/,
    );
  });

  it("keeps node:* and React out of the wrapper, stub and loader", () => {
    for (const rel of [
      "src/store/transport/native-share-in-plugin.ts",
      "src/store/transport/native-share-in-plugin.web-stub.ts",
      "src/lib/api/share-in.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/from\s+["']node:/);
      expect(src, rel).not.toMatch(/from\s+["']react["']/);
    }
  });

  it("registers the plugin under the name ShareIn", () => {
    expect(read("src/store/transport/native-share-in-plugin.ts")).toMatch(
      /registerPlugin<ShareInPluginContract>\(\s*"ShareIn"/,
    );
  });
});
