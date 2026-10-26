/**
 * @module worker-protocol
 *
 * The message protocol between the main thread and the spell-check worker
 * (FR-21, FR-23), and the worker-side handler that applies it to a
 * `SpellEngine`. Pure: no `Worker`, no engine package.
 *
 * Requests (main thread to worker):
 * - `init`: load the engine. Answered by `ready`, or `error` with no ids.
 * - `check { version, blocks }`: blocks of text to check, each with the
 *   caller's id. Answered by `checked` carrying the same `version`.
 * - `suggest { requestId, word }`: answered by `suggested` with the same
 *   `requestId`.
 *
 * Any failure is an `error` reply that carries the `version` or `requestId`
 * of the request it answers, so a failure is never read as an empty result.
 * Unknown words are reported as offsets into the block text; whether a word
 * is known from the project lists is decided on the main thread.
 */
import { MAX_SUGGESTIONS, type SpellEngine } from "./engine";
import { findWordsInText } from "./extract-words";

/** A block of text to check. */
export interface CheckBlock {
  /** The caller's id for the block, echoed in the result. */
  id: string;
  text: string;
}

/** A word the engine does not know, as offsets into its block's text. */
interface UnknownWord {
  word: string;
  start: number;
  end: number;
}

/** The unknown words of one block. */
export interface BlockResult {
  id: string;
  unknown: UnknownWord[];
}

export type WorkerRequest =
  | { type: "init" }
  | { type: "check"; version: number; blocks: CheckBlock[] }
  | { type: "suggest"; requestId: number; word: string };

export type WorkerReply =
  | { type: "ready" }
  | { type: "checked"; version: number; blocks: BlockResult[] }
  | { type: "suggested"; requestId: number; suggestions: string[] }
  | { type: "error"; message: string; version?: number; requestId?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlock(value: unknown): value is CheckBlock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string"
  );
}

/** Returns a reason when the request is invalid, or null. */
export function validateWorkerRequest(request: unknown): string | null {
  if (!isRecord(request)) return "request must be an object";
  if (request.type === "init") return null;
  if (request.type === "check") {
    if (typeof request.version !== "number")
      return "check needs a numeric version";
    if (!Array.isArray(request.blocks) || !request.blocks.every(isBlock)) {
      return "check needs blocks of { id, text }";
    }
    return null;
  }
  if (request.type === "suggest") {
    if (typeof request.requestId !== "number")
      return "suggest needs a numeric requestId";
    if (typeof request.word !== "string") return "suggest needs a string word";
    return null;
  }
  return `unknown request type ${String(request.type)}`;
}

/** Returns a reason when the reply is malformed, or null. */
export function validateWorkerReply(reply: unknown): string | null {
  if (!isRecord(reply)) return "reply must be an object";
  switch (reply.type) {
    case "ready":
      return null;
    case "checked":
      return typeof reply.version === "number" && Array.isArray(reply.blocks)
        ? null
        : "checked reply needs a version and blocks";
    case "suggested":
      return typeof reply.requestId === "number" &&
        Array.isArray(reply.suggestions)
        ? null
        : "suggested reply needs a requestId and suggestions";
    case "error":
      return typeof reply.message === "string"
        ? null
        : "error reply needs a message";
    default:
      return `unknown reply type ${String(reply.type)}`;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function unknownWordsOf(engine: SpellEngine, text: string): UnknownWord[] {
  const unknown: UnknownWord[] = [];
  for (const found of findWordsInText(text)) {
    if (engine.isCorrect(found.word)) continue;
    const hasKnownParts =
      found.parts.length > 0 &&
      found.parts.every((p) => engine.isCorrect(p.word));
    if (hasKnownParts) continue;
    unknown.push({ word: found.word, start: found.start, end: found.end });
  }
  return unknown;
}

/**
 * Worker-side handler: applies one request to the engine and returns the
 * reply. Never rejects; an engine failure becomes an `error` reply carrying
 * the request's `version` or `requestId`.
 */
export function createWorkerHandler(
  engine: SpellEngine,
): (request: unknown) => Promise<WorkerReply> {
  let isLoaded = false;
  return async (request) => {
    const invalid = validateWorkerRequest(request);
    if (invalid !== null) return { type: "error", message: invalid };
    const req = request as WorkerRequest;
    try {
      if (req.type === "init") {
        await engine.load();
        isLoaded = true;
        return { type: "ready" };
      }
      if (!isLoaded) {
        const ids =
          req.type === "check"
            ? { version: req.version }
            : { requestId: req.requestId };
        return {
          type: "error",
          message: "the spelling engine is not loaded",
          ...ids,
        };
      }
      if (req.type === "check") {
        const blocks = req.blocks.map((b) => ({
          id: b.id,
          unknown: unknownWordsOf(engine, b.text),
        }));
        return { type: "checked", version: req.version, blocks };
      }
      return {
        type: "suggested",
        requestId: req.requestId,
        suggestions: engine
          .suggest(req.word, MAX_SUGGESTIONS)
          .slice(0, MAX_SUGGESTIONS),
      };
    } catch (err) {
      const message = describe(err);
      if (req.type === "check")
        return { type: "error", message, version: req.version };
      if (req.type === "suggest")
        return { type: "error", message, requestId: req.requestId };
      return { type: "error", message };
    }
  };
}
