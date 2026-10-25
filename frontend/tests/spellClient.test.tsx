/**
 * @module spellClient.test
 *
 * Task 30 (spell-checker): the engine seam, worker protocol, version discard
 * and test double (FR-21, FR-23, AC-10). A deferred test-double worker holds
 * requests and replies until the test releases them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSpellClient } from "../src/lib/spelling/spell-client";
import type { SpellClientEvent } from "../src/lib/spelling/spell-client";
import {
  createDeferredWorker,
  createTestDoubleEngine,
} from "../src/lib/spelling/spell-client.test-double";
import { validateWorkerRequest } from "../src/lib/spelling/worker-protocol";

function setup(
  engineOptions: Parameters<typeof createTestDoubleEngine>[0] = {},
) {
  const engine = createTestDoubleEngine(engineOptions);
  const worker = createDeferredWorker(engine);
  const events: SpellClientEvent[] = [];
  const client = createSpellClient({ createWorker: () => worker });
  client.subscribe((event) => events.push(event));
  return { engine, worker, events, client };
}

const results = (events: SpellClientEvent[]) =>
  events.filter((e) => e.type === "result");

describe("spell client: protocol", () => {
  it("posts init first, then check with a version and blocks", async () => {
    const { worker, client } = setup();
    client.check(1, [{ id: "b1", text: "A wrng word" }]);
    expect(worker.posted[0]).toEqual({ type: "init" });
    expect(worker.posted[1]).toEqual({
      type: "check",
      version: 1,
      blocks: [{ id: "b1", text: "A wrng word" }],
    });
  });

  it("validates requests at the worker boundary", () => {
    expect(
      validateWorkerRequest({ type: "check", version: 1, blocks: [] }),
    ).toBeNull();
    expect(
      validateWorkerRequest({ type: "check", version: "1", blocks: [] }),
    ).not.toBeNull();
    expect(
      validateWorkerRequest({ type: "suggest", requestId: 1 }),
    ).not.toBeNull();
    expect(validateWorkerRequest({ type: "nope" })).not.toBeNull();
    expect(validateWorkerRequest(null)).not.toBeNull();
  });
});

describe("spell client: version discard", () => {
  it("delivers a result for the current version", async () => {
    const { worker, events, client } = setup({ known: ["a", "word"] });
    client.check(1, [{ id: "b1", text: "A wrng word" }]);
    await worker.process();
    worker.release();
    expect(results(events)).toEqual([
      {
        type: "result",
        version: 1,
        blocks: [{ id: "b1", unknown: [{ word: "wrng", start: 2, end: 6 }] }],
      },
    ]);
  });

  it("discards a result for a version older than the current one", async () => {
    const { worker, events, client } = setup({ known: ["word"] });
    client.check(1, [{ id: "b1", text: "wrng word" }]);
    client.check(2, [{ id: "b1", text: "wrng word again" }]);
    await worker.process();
    const replies = worker.outbox();
    const v1 = replies.findIndex(
      (r) => (r as { version?: number }).version === 1,
    );
    const v2 = replies.findIndex(
      (r) => (r as { version?: number }).version === 2,
    );
    worker.release(v2);
    worker.release(v1 > v2 ? v1 - 1 : v1);
    expect(
      results(events).map((e) => e.type === "result" && e.version),
    ).toEqual([2]);
  });

  it("discards an older result that arrives after a newer request was posted", async () => {
    const { worker, events, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    await worker.process();
    client.check(2, [{ id: "b1", text: "wrng" }]);
    worker.release();
    expect(results(events)).toEqual([]);
  });
});

describe("spell client: the main thread never calls the engine", () => {
  it("calls the engine only when the worker runs a request", async () => {
    const { engine, worker, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    void client.suggest("wrng");
    expect(engine.calls).toEqual([]);
    await worker.process();
    expect(engine.calls.length).toBeGreaterThan(0);
  });

  it("spell-client.ts imports no engine module or package", () => {
    const source = readFileSync(
      path.join(__dirname, "../src/lib/spelling/spell-client.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /from\s+["'][^"']*(nspell|dictionary-en|harper)/,
    );
    expect(source).not.toMatch(/from\s+["']\.\/engine["']/);
  });

  it("the seam files import no engine package", () => {
    for (const file of [
      "engine.ts",
      "worker-protocol.ts",
      "spell-client.ts",
      "spell-client.test-double.ts",
    ]) {
      const source = readFileSync(
        path.join(__dirname, "../src/lib/spelling", file),
        "utf8",
      );
      expect(source).not.toMatch(
        /from\s+["'](nspell|dictionary-en|harper\.js)/,
      );
    }
  });
});

describe("spell client: unavailable", () => {
  it("emits unavailable with a reason when the engine throws on load", async () => {
    const { worker, events, client } = setup({
      loadError: new Error("dictionary missing"),
    });
    client.check(1, [{ id: "b1", text: "wrng" }]);
    await worker.process();
    worker.release();
    const unavailable = events.filter((e) => e.type === "unavailable");
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]).toMatchObject({
      reason: expect.stringContaining("dictionary missing"),
    });
    expect(results(events)).toEqual([]);
  });

  it("emits unavailable, never an empty result, when the engine throws during a check", async () => {
    const { worker, events, client } = setup({
      checkError: new Error("engine crashed"),
    });
    client.check(1, [{ id: "b1", text: "wrng" }]);
    await worker.process();
    worker.release();
    expect(results(events)).toEqual([]);
    expect(events.find((e) => e.type === "unavailable")).toMatchObject({
      reason: expect.stringContaining("engine crashed"),
    });
  });

  it("emits unavailable when the worker itself crashes", () => {
    const { worker, events, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    worker.crash("Worker script failed");
    expect(results(events)).toEqual([]);
    expect(events.find((e) => e.type === "unavailable")).toMatchObject({
      reason: expect.stringContaining("Worker script failed"),
    });
  });

  it("emits unavailable when the worker cannot be created", () => {
    const events: SpellClientEvent[] = [];
    const client = createSpellClient({
      createWorker: () => {
        throw new Error("no Worker here");
      },
    });
    client.subscribe((e) => events.push(e));
    client.check(1, [{ id: "b1", text: "wrng" }]);
    expect(events).toEqual([
      {
        type: "unavailable",
        reason: expect.stringContaining("no Worker here"),
      },
    ]);
  });

  it("emits unavailable once, and later checks post nothing new", async () => {
    const { worker, events, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    worker.crash("boom");
    worker.crash("boom again");
    client.check(2, [{ id: "b1", text: "wrng" }]);
    expect(events.filter((e) => e.type === "unavailable")).toHaveLength(1);
    expect(worker.posted.filter((m) => m.type === "check")).toHaveLength(1);
  });

  it("rejects a malformed reply as unavailable", () => {
    const { worker, events, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    worker.deliver({ type: "checked", version: "x" });
    expect(events.find((e) => e.type === "unavailable")).toBeDefined();
  });
});

describe("spell client: suggest", () => {
  it("resolves with suggestions, capped at five", async () => {
    const { worker, client } = setup({
      suggestions: ["a1", "a2", "a3", "a4", "a5", "a6"],
    });
    const pending = client.suggest("wrng");
    await worker.process();
    worker.release();
    expect(await pending).toEqual({
      status: "ok",
      suggestions: ["a1", "a2", "a3", "a4", "a5"],
    });
  });

  it("resolves ok with an empty list when the engine has none", async () => {
    const { worker, client } = setup({ suggestions: [] });
    const pending = client.suggest("zzzz");
    await worker.process();
    worker.release();
    expect(await pending).toEqual({ status: "ok", suggestions: [] });
  });

  it("a failed suggest is 'unavailable', distinct from an empty list", async () => {
    const { worker, events, client } = setup({
      suggestError: new Error("suggest broke"),
    });
    const pending = client.suggest("wrng");
    await worker.process();
    worker.release();
    const result = await pending;
    expect(result).toEqual({
      status: "unavailable",
      reason: expect.stringContaining("suggest broke"),
    });
    expect(events.filter((e) => e.type === "unavailable")).toEqual([]);
  });

  it("resolves pending suggests as unavailable when the worker crashes", async () => {
    const { worker, client } = setup();
    const pending = client.suggest("wrng");
    worker.crash("gone");
    expect(await pending).toMatchObject({ status: "unavailable" });
  });

  it("answers suggest as unavailable after the client is unavailable", async () => {
    const { worker, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    worker.crash("gone");
    expect(await client.suggest("wrng")).toMatchObject({
      status: "unavailable",
    });
  });
});

describe("spell client: dispose", () => {
  it("terminates the worker and ignores later replies", async () => {
    const { worker, events, client } = setup();
    client.check(1, [{ id: "b1", text: "wrng" }]);
    await worker.process();
    client.dispose();
    worker.release();
    expect(worker.terminated).toBe(true);
    expect(events).toEqual([]);
  });
});
