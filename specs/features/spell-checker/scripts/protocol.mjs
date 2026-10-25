// Spike message protocol shared by worker-nspell.mjs and worker-harper.mjs
// (Feature 95, Task 6; FR-3, FR-6). Spike code: not the Task 31 adapter.
// Imports no application module. Workers take no timings; the harness does.
//
// Requests (page to worker):
//   { type: "init", assets: { aff?: string, dic?: string } }   asset URLs; harper ignores them
//   { id: number, type: "check", text: string }
//   { id: number, type: "suggest", word: string }
// Replies (worker to page):
//   { type: "ready", engine: "nspell" | "harper" }              after init has loaded
//   { id, type: "checked", unknown: [{ word, start, end }] }    every occurrence, UTF-16 offsets
//   { id, type: "suggested", word, suggestions: string[] }
//   { id, type: "error", message: string }                      id is null when the request had none

export const REQUEST_TYPES = Object.freeze({ init: "init", check: "check", suggest: "suggest" });

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** Words of `text` with UTF-16 offsets; apostrophes inside a word stay, edge quotes do not. */
export function tokenize(text) {
  return [...text.matchAll(WORD)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

const isObject = (v) => typeof v === "object" && v !== null;

/** Returns an error string for an invalid request, or null. */
export function validateRequest(req) {
  if (!isObject(req)) return "request must be an object";
  if (req.type === REQUEST_TYPES.init) return isObject(req.assets) ? null : "init needs an assets object";
  if (req.type !== REQUEST_TYPES.check && req.type !== REQUEST_TYPES.suggest) return `unknown request type ${String(req.type)}`;
  if (typeof req.id !== "number") return "request needs a numeric id";
  if (req.type === REQUEST_TYPES.check && typeof req.text !== "string") return "check needs a string text";
  if (req.type === REQUEST_TYPES.suggest && typeof req.word !== "string") return "suggest needs a string word";
  return null;
}

/**
 * Installs the protocol on a worker global. `engine` is
 * { name, load(assets): Promise<void>, check(text): Promise<Array<{word,start,end}>>, suggest(word): Promise<string[]> }.
 */
export function installProtocol(scope, engine) {
  let loaded = false;
  const reply = (msg) => scope.postMessage(msg);
  const fail = (id, message) => reply({ id, type: "error", message });

  async function handle(req) {
    const invalid = validateRequest(req);
    if (invalid) return fail(isObject(req) && typeof req.id === "number" ? req.id : null, invalid);
    if (req.type === REQUEST_TYPES.init) {
      await engine.load(req.assets);
      loaded = true;
      return reply({ type: "ready", engine: engine.name });
    }
    if (!loaded) return fail(req.id, "send init and wait for ready first");
    if (req.type === REQUEST_TYPES.check) return reply({ id: req.id, type: "checked", unknown: await engine.check(req.text) });
    return reply({ id: req.id, type: "suggested", word: req.word, suggestions: await engine.suggest(req.word) });
  }

  scope.onmessage = (event) => {
    const req = event.data;
    handle(req).catch((err) => fail(isObject(req) && typeof req.id === "number" ? req.id : null, err instanceof Error ? err.message : String(err)));
  };
}
