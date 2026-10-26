/**
 * @module spellEngineAdapter.test
 *
 * Task 31 (spell-checker): the nspell adapter behind the `SpellEngine` seam,
 * run against the real `nspell` and `dictionary-en` packages (FR-21, FR-23,
 * FR-24). The dictionary text is read from node_modules here; in the app the
 * worker fetches it as a same-origin asset.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createFetchAssetLoader,
  createNspellEngine,
  SPELL_DEBOUNCE_MS,
  type DictionaryAssets,
} from "../src/lib/spelling/engine-nspell";
import { createSpellClient } from "../src/lib/spelling/spell-client";
import type { SpellClientEvent } from "../src/lib/spelling/spell-client";
import { serializeRequests } from "../src/lib/spelling/serialize-requests";
import { createWorkerHandler } from "../src/lib/spelling/worker-protocol";
import { createDeferredWorker } from "../src/lib/spelling/spell-client.test-double";

const dictionaryDir = path.join(__dirname, "../node_modules/dictionary-en");

async function realAssets(): Promise<DictionaryAssets> {
  return {
    aff: readFileSync(path.join(dictionaryDir, "index.aff"), "utf8"),
    dic: readFileSync(path.join(dictionaryDir, "index.dic"), "utf8"),
  };
}

async function loadedEngine() {
  const engine = createNspellEngine({ loadAssets: realAssets });
  await engine.load();
  return engine;
}

describe("nspell adapter: engine behaviour", () => {
  it("flags a planted misspelling and accepts correct words", async () => {
    const engine = await loadedEngine();
    expect(engine.isCorrect("receive")).toBe(true);
    expect(engine.isCorrect("Receive")).toBe(true);
    expect(engine.isCorrect("recieve")).toBe(false);
  });

  it("treats a curly apostrophe like a straight one", async () => {
    const engine = await loadedEngine();
    expect(engine.isCorrect("don't")).toBe(true);
    expect(engine.isCorrect("don’t")).toBe(true);
  });

  it("returns at most max suggestions, and includes the likely word", async () => {
    const engine = await loadedEngine();
    const five = engine.suggest("recieve", 5);
    expect(five.length).toBeGreaterThan(0);
    expect(five.length).toBeLessThanOrEqual(5);
    expect(five).toContain("receive");
    expect(engine.suggest("recieve", 1)).toHaveLength(1);
  });

  it("throws, rather than answering, before load", () => {
    const engine = createNspellEngine({ loadAssets: realAssets });
    expect(() => engine.isCorrect("word")).toThrow(/not loaded/);
    expect(() => engine.suggest("word", 5)).toThrow(/not loaded/);
  });
});

describe("nspell adapter: load failure", () => {
  it("rejects load when the assets cannot be loaded", async () => {
    const engine = createNspellEngine({
      loadAssets: async () => {
        throw new Error("assets gone");
      },
    });
    await expect(engine.load()).rejects.toThrow("assets gone");
    expect(() => engine.isCorrect("word")).toThrow(/not loaded/);
  });

  it("surfaces a load failure through the client's unavailable path", async () => {
    const engine = createNspellEngine({
      loadAssets: async () => {
        throw new Error("assets gone");
      },
    });
    const worker = createDeferredWorker(engine);
    const events: SpellClientEvent[] = [];
    const client = createSpellClient({ createWorker: () => worker });
    client.subscribe((event) => events.push(event));
    client.check(1, [{ id: "b", text: "word" }]);
    await worker.process();
    worker.release();
    expect(events).toEqual([{ type: "unavailable", reason: "assets gone" }]);
  });

  it("does not take a corrupt dictionary for a loaded one", async () => {
    const engine = createNspellEngine({
      loadAssets: async () => ({ aff: "", dic: "" }),
    });
    await expect(engine.load()).rejects.toThrow();
  });
});

describe("nspell adapter: same-origin assets (FR-24)", () => {
  const origin = "https://app.example.test";
  const okText = (body: string) =>
    vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(body, { status: 200 }),
    );

  it("fetches both files from the page's origin", async () => {
    const fetchFn = okText("x");
    const load = createFetchAssetLoader({
      affUrl: `${origin}/_next/static/media/index.aff`,
      dicUrl: "/_next/static/media/index.dic",
      origin,
      fetchFn,
    });
    await expect(load()).resolves.toEqual({ aff: "x", dic: "x" });
    expect(fetchFn.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      `${origin}/_next/static/media/index.aff`,
      `${origin}/_next/static/media/index.dic`,
    ]);
  });

  it("refuses a third-party URL without making a request", async () => {
    const fetchFn = okText("x");
    const load = createFetchAssetLoader({
      affUrl: "https://cdn.example.net/index.aff",
      dicUrl: "/index.dic",
      origin,
      fetchFn,
    });
    await expect(load()).rejects.toThrow(/same origin/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects on a non-ok status instead of loading an empty dictionary", async () => {
    const load = createFetchAssetLoader({
      affUrl: "/index.aff",
      dicUrl: "/index.dic",
      origin,
      fetchFn: vi.fn<(url: string) => Promise<Response>>(
        async () => new Response("", { status: 404 }),
      ),
    });
    await expect(load()).rejects.toThrow(/404/);
  });

  it("holds no absolute http(s) URL in the worker-side sources", () => {
    const dir = path.join(__dirname, "../src/lib/spelling");
    for (const file of [
      "engine-nspell.ts",
      "spell.worker.ts",
      "create-spell-worker.ts",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/https?:\/\//);
    }
  });
});

describe("worker request order", () => {
  it("finishes init before it answers the check posted right after it", async () => {
    const engine = createNspellEngine({
      loadAssets: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return realAssets();
      },
    });
    const handle = createWorkerHandler(engine);
    const unserialized = await Promise.all([
      handle({ type: "init" }),
      handle({ type: "check", version: 1, blocks: [] }),
    ]);
    expect(unserialized[1]).toMatchObject({
      type: "error",
      message: "the spelling engine is not loaded",
    });

    const serialized = serializeRequests(
      createWorkerHandler(createNspellEngine({ loadAssets: realAssets })),
    );
    const replies = await Promise.all([
      serialized({ type: "init" }),
      serialized({
        type: "check",
        version: 1,
        blocks: [{ id: "b", text: "I recieve it" }],
      }),
    ]);
    expect(replies[0]).toEqual({ type: "ready" });
    expect(replies[1]).toMatchObject({
      type: "checked",
      version: 1,
      blocks: [{ id: "b", unknown: [{ word: "recieve" }] }],
    });
  });
});

describe("debounce interval", () => {
  it("exceeds the longest measured whole-document check (224.8 ms)", () => {
    expect(SPELL_DEBOUNCE_MS).toBeGreaterThan(224.8);
  });
});

describe("emitted worker assets (need a `next build` with a consumer of createSpellWorker)", () => {
  const chunksDir = path.join(__dirname, "../.next/static/chunks");
  const mediaDir = path.join(__dirname, "../.next/static/media");
  const engineChunk = existsSync(chunksDir)
    ? readdirSync(chunksDir)
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(path.join(chunksDir, f), "utf8"))
        .find((text) => /\/_next\/static\/media\/index\.[^"]*\.aff/.test(text))
    : undefined;

  it.skipIf(engineChunk === undefined)(
    "references both dictionary files by same-origin path and no third-party URL",
    () => {
      const refs =
        engineChunk?.match(/\/_next\/static\/media\/index\.[^"]+/g) ?? [];
      expect(refs.some((r) => r.endsWith(".aff"))).toBe(true);
      expect(refs.some((r) => r.endsWith(".dic"))).toBe(true);
      expect(engineChunk).not.toMatch(/https?:\/\//);
      for (const ref of refs) {
        expect(existsSync(path.join(mediaDir, path.basename(ref)))).toBe(true);
      }
    },
  );
});
