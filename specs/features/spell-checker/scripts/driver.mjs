// Spike driver (Feature 95, Task 7; FR-3, FR-4, FR-6). Runs the FR-6 sequence for
// each engine in its own dedicated Web Worker and prints one JSON block.
// Timing uses performance.now() here, never in the worker. No application module.
//
// Whether a load is cold depends on the browser profile, not on this page: the first
// load in a fresh browser context is cold. Each load records its transferred bytes so
// a cold load is recognisable (transferSize > 0 for the dictionary or wasm).

const params = new URLSearchParams(location.search);
const num = (name, fallback) => (params.has(name) ? Number(params.get(name)) : fallback);
const CONFIG = {
  engines: (params.get("engines") ?? "nspell,harper").split(",").filter(Boolean),
  warmLoads: num("warm", 20),
  sizes: (params.get("sizes") ?? "5000,50000,200000").split(",").map(Number),
  sizeRuns: num("sizeRuns", 1),
  recheckRuns: num("recheckRuns", 10),
  suggestReps: num("suggestReps", 5),
  suggestionWords: 200,
  uasMemory: params.get("uas") !== "0",
};
const WORKER_FILE = { nspell: "worker-nspell.js", harper: "worker-harper.js" };
const WORKER_TYPE = { nspell: "classic", harper: "module" };
const TIMEOUT_MS = 20 * 60 * 1000;
const abs = (rel) => new URL(rel, location.href).href;
const logEl = document.getElementById("log");
const log = (msg) => {
  console.log(msg);
  logEl.textContent += `${msg}\n`;
};

/** Worker client: protocol requests by id, control messages (prefix "__") by ctl. */
class Client {
  constructor(engine) {
    this.engine = engine;
    this.nextId = 1;
    this.pending = new Map();
    this.workerUrl = abs(WORKER_FILE[engine]);
    this.worker = new Worker(this.workerUrl, { type: WORKER_TYPE[engine] });
    this.ready = new Promise((ok, fail) => {
      this.onReady = ok;
      this.onFatal = fail;
    });
    this.worker.onmessage = (e) => this.handle(e.data);
    this.worker.onerror = (e) => {
      const err = new Error(`worker error: ${e.message || "no message (script failed to load or parse)"}`);
      this.onFatal(err);
      for (const p of this.pending.values()) p.fail(err);
    };
  }
  handle(d) {
    if (d.type === "ready") return this.onReady(d);
    const key = d.type === "__reply" ? `ctl${d.ctl}` : d.id;
    const p = this.pending.get(key);
    if (!p) return d.type === "error" ? this.onFatal(new Error(d.message)) : undefined;
    this.pending.delete(key);
    if (d.type === "error") p.fail(new Error(d.message));
    else p.ok(d);
  }
  send(msg, key) {
    return new Promise((ok, fail) => {
      this.pending.set(key, { ok, fail });
      this.worker.postMessage(msg);
    });
  }
  init() {
    this.worker.postMessage({ type: "init", assets: { aff: abs("assets/index.aff"), dic: abs("assets/index.dic") } });
    return this.ready;
  }
  request(msg) {
    const id = this.nextId++;
    return this.send({ ...msg, id }, id);
  }
  control(msg) {
    const ctl = this.nextId++;
    return this.send({ ...msg, ctl }, `ctl${ctl}`);
  }
  terminate() {
    this.worker.terminate();
  }
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const percentile = (xs, p) => (xs.length === 0 ? null : sorted(xs)[Math.max(0, Math.ceil((p / 100) * xs.length) - 1)]);
const stats = (xs) => ({ n: xs.length, median: percentile(xs, 50), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null });

const kindOf = (name, workerUrl) =>
  name === workerUrl ? "worker-script" : /\.wasm$/.test(name) ? "wasm" : /\.(aff|dic)$/.test(name) ? "dictionary" : "other";

/** One worker load from creation to "ready", plus the bytes it fetched. */
async function loadOnce(engine) {
  const mark = performance.getEntriesByType("resource").length;
  const t0 = performance.now();
  const client = new Client(engine);
  await client.init();
  const ms = performance.now() - t0;
  const pageEntries = performance.getEntriesByType("resource").slice(mark).filter((e) => e.name === client.workerUrl);
  const workerReply = await client.control({ type: "__resources" });
  const entries = [...pageEntries, ...workerReply.entries].map((e) => ({
    name: e.name.replace(location.origin, ""),
    kind: kindOf(e.name, client.workerUrl),
    transferSize: e.transferSize,
    encodedBodySize: e.encodedBodySize,
    decodedBodySize: e.decodedBodySize,
  }));
  return { client, ms, entries };
}

function byteTotals(entries) {
  const kinds = {};
  for (const e of entries) {
    const k = (kinds[e.kind] ??= { transferred: 0, encoded: 0, decoded: 0, files: 0 });
    k.transferred += e.transferSize;
    k.encoded += e.encodedBodySize;
    k.decoded += e.decodedBodySize;
    k.files += 1;
  }
  return {
    transferred: sum(entries.map((e) => e.transferSize)),
    encoded: sum(entries.map((e) => e.encodedBodySize)),
    decoded: sum(entries.map((e) => e.decodedBodySize)),
    byKind: kinds,
  };
}

async function loadSequence(engine) {
  const loads = [];
  const kept = {};
  let last = null;
  for (let i = 0; i <= CONFIG.warmLoads; i++) {
    if (last) last.client.terminate();
    last = await loadOnce(engine);
    const totals = byteTotals(last.entries);
    loads.push({ index: i, ms: last.ms, transferred: totals.transferred, decoded: totals.decoded });
    if (i <= 1) kept[i] = { resources: last.entries, totals };
    log(`${engine} load ${i}: ${last.ms.toFixed(1)} ms, transferred ${totals.transferred}`);
  }
  const warm = loads.slice(1).map((l) => l.ms);
  return {
    session: last.client,
    result: {
      firstLoad: { ms: loads[0].ms, ...kept[0] },
      secondLoad: kept[1] ?? null,
      firstLoadWasCold: loads[0].transferred > 0,
      loads,
      warmMs: stats(warm),
    },
  };
}

async function suggestionTimes(client, words) {
  const reps = [];
  let withSuggestions = 0;
  for (let r = 0; r < CONFIG.suggestReps; r++) {
    const times = [];
    for (const word of words) {
      const t0 = performance.now();
      const reply = await client.request({ type: "suggest", word });
      times.push(performance.now() - t0);
      if (r === 0 && reply.suggestions.length > 0) withSuggestions++;
    }
    reps.push({ p50: percentile(times, 50), p95: percentile(times, 95), max: Math.max(...times) });
  }
  return { words: words.length, wordsWithSuggestionsInFirstRepetition: withSuggestions, repetitions: reps, p50: stats(reps.map((r) => r.p50)), p95: stats(reps.map((r) => r.p95)) };
}

/** Planted word indexes (the generator plants by word index, see manifest) mapped to offsets. */
function plantedOffsets(text, m) {
  const misspellings = new Map();
  const names = new Map();
  let i = 0;
  for (const match of text.matchAll(/\S+/g)) {
    if (i % m.nameEvery === m.nameOffset) names.set(match.index, match[0]);
    else if (i % m.misspellEvery === m.misspellOffset) misspellings.set(match.index, match[0]);
    i++;
  }
  return { misspellings, names };
}

function correctness(text, unknown, manifest) {
  const planted = plantedOffsets(text, manifest);
  const flaggedStarts = new Set(unknown.map((u) => u.start));
  const count = (map) => [...map.keys()].filter((s) => flaggedStarts.has(s)).length;
  const unplanted = unknown.filter((u) => !planted.misspellings.has(u.start) && !planted.names.has(u.start));
  return {
    plantedMisspellings: planted.misspellings.size,
    plantedMisspellingsFlagged: count(planted.misspellings),
    plantedNames: planted.names.size,
    plantedNamesFlagged: count(planted.names),
    unplantedFlagged: unplanted.length,
    unplantedFlaggedSample: unplanted.slice(0, 10).map((u) => u.word),
    totalFlagged: unknown.length,
  };
}

async function checkFromColdWorker(engine, fixture, manifest) {
  const runs = [];
  let corr = null;
  for (let r = 0; r < CONFIG.sizeRuns; r++) {
    const { client } = await loadOnce(engine);
    const t0 = performance.now();
    const reply = await client.request({ type: "check", text: fixture.text });
    runs.push(performance.now() - t0);
    corr ??= correctness(fixture.text, reply.unknown, manifest);
    client.terminate();
  }
  log(`${engine} check ${fixture.size}: ${runs.map((x) => x.toFixed(0)).join(", ")} ms`);
  return { words: fixture.size, ms: stats(runs), runsMs: runs, correctness: corr };
}

async function memorySample(client) {
  const worker = client ? await client.control({ type: "__memory", uas: CONFIG.uasMemory }) : {};
  const page = performance.memory ? { jsHeapUsed: performance.memory.usedJSHeapSize, jsHeapTotal: performance.memory.totalJSHeapSize } : null;
  let uaSpecificBytes = null;
  let uaSpecificError = null;
  if (CONFIG.uasMemory) {
    if (typeof performance.measureUserAgentSpecificMemory !== "function") uaSpecificError = "measureUserAgentSpecificMemory is not available on the page";
    else if (!crossOriginIsolated) uaSpecificError = "page is not cross-origin isolated";
    else {
      try {
        uaSpecificBytes = (await performance.measureUserAgentSpecificMemory()).bytes;
      } catch (e) {
        uaSpecificError = String(e);
      }
    }
  }
  const { type, ctl, ...fromWorker } = worker;
  return { worker: fromWorker, page, pageUaSpecificBytes: uaSpecificBytes, pageUaSpecificError: uaSpecificError };
}

async function memoryAndRecheck(engine, big) {
  const beforeWorker = await memorySample(null);
  const { client } = await loadOnce(engine);
  const afterLoad = await memorySample(client);
  await client.request({ type: "check", text: big.text });
  const afterCheck = await memorySample(client);
  const paragraphs = big.text.split("\n\n");
  const mid = paragraphs[Math.floor(paragraphs.length / 2)];
  const times = [];
  let flagged = null;
  for (let r = 0; r < CONFIG.recheckRuns; r++) {
    const edited = `${mid} recieve${"q".repeat(r + 1)}`;
    const t0 = performance.now();
    const reply = await client.request({ type: "check", text: edited });
    times.push(performance.now() - t0);
    flagged ??= reply.unknown.length;
  }
  client.terminate();
  return {
    memory: { beforeWorker, afterLoad, afterCheck200k: afterCheck },
    recheck: { paragraphWords: mid.split(/\s+/).length, ms: stats(times), runsMs: times, flaggedInFirstEditedParagraph: flagged },
  };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} failed with status ${res.status}`);
  return res.text();
}

async function runEngine(engine, fixtures, manifest, suggestionWords) {
  const out = { engine, workerType: WORKER_TYPE[engine], errors: [] };
  const step = async (name, fn) => {
    try {
      return await fn();
    } catch (err) {
      out.errors.push({ step: name, message: err instanceof Error ? err.message : String(err) });
      log(`${engine} ${name} FAILED: ${out.errors.at(-1).message}`);
      return null;
    }
  };
  const seq = await step("load", () => loadSequence(engine));
  if (seq) {
    out.load = seq.result;
    out.suggestion = await step("suggest", () => suggestionTimes(seq.session, suggestionWords));
    seq.session.terminate();
  }
  out.checkFromColdWorker = [];
  for (const f of fixtures) {
    const r = await step(`check-${f.size}`, () => checkFromColdWorker(engine, f, manifest));
    if (r) out.checkFromColdWorker.push(r);
  }
  const big = fixtures.reduce((a, b) => (b.size > a.size ? b : a));
  const mem = await step("memory-recheck", () => memoryAndRecheck(engine, big));
  if (mem) Object.assign(out, mem);
  return out;
}

async function environment() {
  const ua = navigator.userAgent;
  const m = /Chrome\/(\d+)\.[\d.]+/.exec(ua);
  const brands = navigator.userAgentData ? navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`) : null;
  let server = null;
  try {
    server = JSON.parse(await fetchText("env.json"));
  } catch (err) {
    server = { error: String(err) };
  }
  return {
    server,
    browser: { userAgent: ua, brands, chromeMajor: m ? Number(m[1]) : null, platform: navigator.platform, crossOriginIsolated, hasPerformanceMemory: !!performance.memory },
    config: CONFIG,
  };
}

async function main() {
  const env = await environment();
  const manifest = JSON.parse(await fetchText("fixtures/manifest.json"));
  const fixtures = [];
  for (const size of CONFIG.sizes) {
    const entry = manifest.sizes.find((s) => s.size === size);
    if (!entry) throw new Error(`no fixture of ${size} words in the manifest`);
    fixtures.push({ size, text: await fetchText(`fixtures/${entry.file}`) });
  }
  const suggestionSource = manifest.sizes.find((s) => s.size === 50000) ?? manifest.sizes.at(-1);
  const sourceText = await fetchText(`fixtures/${suggestionSource.file}`);
  const suggestionWords = [...plantedOffsets(sourceText, manifest).misspellings.values()].slice(0, CONFIG.suggestionWords);
  const engines = [];
  for (const engine of CONFIG.engines) {
    if (!WORKER_FILE[engine]) throw new Error(`unknown engine ${engine}`);
    engines.push(await runEngine(engine, fixtures, manifest, suggestionWords));
  }
  const chrome = env.browser.chromeMajor;
  return {
    environment: env,
    lowestChromeVersionRun: { chromeMajor: chrome, note: "single browser per run; the lowest across runs is taken by the caller" },
    fixtureCounts: manifest.sizes.map((s) => ({ words: s.size, ...s.counts })),
    suggestionList: { source: suggestionSource.file, count: suggestionWords.length, first: suggestionWords.slice(0, 5) },
    engines,
  };
}

const timeout = new Promise((_, fail) => setTimeout(() => fail(new Error("driver timed out")), TIMEOUT_MS));
Promise.race([main(), timeout])
  .then((result) => publish(result))
  .catch((err) => publish({ driverError: err instanceof Error ? err.stack || err.message : String(err) }));

function publish(result) {
  const text = JSON.stringify(result, null, 2);
  document.getElementById("result").textContent = text;
  window.__spellResult = result;
  console.log(`SPELL_RESULT_JSON ${JSON.stringify(result)}`);
}
