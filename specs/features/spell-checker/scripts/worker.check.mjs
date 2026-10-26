// Node check for worker-nspell.mjs, worker-harper.mjs and protocol.mjs (Task 6).
// Run: node worker.check.mjs
// Each engine worker is run in a worker_threads Worker through node-worker-host.mjs,
// which gives it the Web Worker surface (self.postMessage / self.onmessage / fetch).
// Timings are taken with performance.now() here, in the harness, never in a worker.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const protocol = await import("./protocol.mjs");
const { spawnWorker } = await import("./node-worker-host.mjs");
const dictDir = resolve(here, "../../../../frontend/node_modules/dictionary-en");
const assets = {
  aff: pathToFileURL(join(dictDir, "index.aff")).href,
  dic: pathToFileURL(join(dictDir, "index.dic")).href,
};
const engines = [
  { engine: "nspell", file: "worker-nspell.mjs" },
  { engine: "harper", file: "worker-harper.mjs" },
];
const TEXT = "I will recieve the letter, but teh wrold is Zorvath's and the house is red.";
const timings = {};
const live = [];
after(() => Promise.all(live.map((w) => w.terminate())));

const shapeOf = (m) =>
  JSON.stringify(Object.keys(m).sort().map((k) => [k, Array.isArray(m[k]) ? "array" : typeof m[k]]));
const next = (w, pred = () => true) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("worker reply timed out")), 60000);
    const on = (m) => { if (pred(m)) { clearTimeout(t); w.off("message", on); res(m); } };
    w.on("message", on);
  });

async function started(file) {
  const w = spawnWorker(join(here, file));
  live.push(w);
  const t0 = performance.now();
  const ready = next(w, (m) => m.type === "ready");
  w.postMessage({ type: "init", assets });
  const msg = await ready;
  return { w, msg, loadMs: performance.now() - t0 };
}
const ask = async (w, req, replyType) => {
  const reply = next(w, (m) => m.id === req.id);
  w.postMessage(req);
  const m = await reply;
  assert.equal(m.type, replyType, JSON.stringify(m));
  return m;
};

const shapes = {};
for (const { engine, file } of engines) {
  test(`${engine}: ready after init, then check and suggest`, async () => {
    const { w, msg, loadMs } = await started(file);
    assert.equal(msg.type, "ready");
    assert.equal(msg.engine, engine);
    assert.ok(Number.isFinite(loadMs) && loadMs > 0);
    timings[engine] = { loadMs };
    shapes[engine] = { ready: shapeOf(msg) };

    let t = performance.now();
    const checked = await ask(w, { id: 1, type: "check", text: TEXT }, "checked");
    timings[engine].checkMs = performance.now() - t;
    shapes[engine].checked = shapeOf(checked);
    assert.equal(checked.id, 1);
    const words = checked.unknown.map((u) => u.word);
    for (const expected of ["recieve", "teh", "wrold"]) assert.ok(words.includes(expected), `${engine} flagged ${words}`);
    for (const known of ["house", "letter", "red", "will"]) assert.ok(!words.includes(known), `${engine} flagged ${known}`);
    for (const u of checked.unknown) {
      assert.equal(shapeOf(u), shapeOf({ word: "", start: 0, end: 0 }));
      assert.equal(TEXT.slice(u.start, u.end), u.word);
    }

    assert.deepEqual((await ask(w, { id: 2, type: "check", text: "The house is red." }, "checked")).unknown, []);
    assert.deepEqual((await ask(w, { id: 3, type: "check", text: "" }, "checked")).unknown, []);

    t = performance.now();
    const sug = await ask(w, { id: 4, type: "suggest", word: "recieve" }, "suggested");
    timings[engine].suggestMs = performance.now() - t;
    shapes[engine].suggested = shapeOf(sug);
    assert.equal(sug.word, "recieve");
    assert.ok(sug.suggestions.includes("receive"), JSON.stringify(sug.suggestions));
    assert.ok(sug.suggestions.every((s) => typeof s === "string"));
    assert.deepEqual((await ask(w, { id: 5, type: "suggest", word: "house" }, "suggested")).suggestions.includes("house"), false);
  });

  test(`${engine}: malformed and early requests get an error reply, not silence`, async () => {
    const early = spawnWorker(join(here, file));
    live.push(early);
    const r1 = next(early, (m) => m.id === 9);
    early.postMessage({ id: 9, type: "check", text: "hello" });
    const e1 = await r1;
    assert.equal(e1.type, "error");
    assert.match(e1.message, /init/i);
    shapes[engine] = { ...shapes[engine], error: shapeOf(e1) };

    const { w } = await started(file);
    const r2 = next(w, (m) => m.id === 10);
    w.postMessage({ id: 10, type: "nope" });
    assert.equal((await r2).type, "error");
    const r3 = next(w, (m) => m.id === 11);
    w.postMessage({ id: 11, type: "check", text: 42 });
    assert.equal((await r3).type, "error");
  });
}

test("both engines use identical message shapes", () => {
  assert.deepEqual(shapes.nspell, shapes.harper);
});

test("protocol exports its message types and tokenizer", () => {
  assert.deepEqual(Object.keys(protocol.REQUEST_TYPES).sort(), ["check", "init", "suggest"]);
  assert.deepEqual(
    protocol.tokenize("Don’t stop, o'er-the 'quoted' x").map((t) => t.word),
    ["Don’t", "stop", "o'er", "the", "quoted", "x"],
  );
});

test("workers import no application module and take no timings", () => {
  for (const f of ["worker-nspell.mjs", "worker-harper.mjs", "protocol.mjs", "node-worker-host.mjs"]) {
    const src = readFileSync(join(here, f), "utf8");
    const specs = [...src.matchAll(/(?:import\s[^"']*from\s*|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const s of specs) {
      const ok = s.startsWith("node:") || s === "./protocol.mjs" || /^(\.\.\/){4}frontend\/node_modules\//.test(s) || s === "./node-worker-host.mjs";
      assert.ok(ok, `${f} imports ${s}`);
      assert.ok(!/(^|\/)(app|components|src)\//.test(s.replace(/node_modules\/.*/, "")), `${f} imports ${s}`);
    }
    if (f.startsWith("worker-") || f === "protocol.mjs") assert.ok(!/performance\.now|Date\.now/.test(src), `${f} times itself`);
  }
});

after(() => console.log("harness timings (ms, performance.now in harness):", JSON.stringify(timings)));
