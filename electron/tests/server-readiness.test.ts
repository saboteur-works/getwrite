/**
 * Feature 80, Task 9 (FR-10, FR-11 b to d): the readiness check accepts only
 * the server the app forked (a challenge only that server can answer), sends
 * no secret of any kind, stops when the forked server exits, and gives every
 * poll its own timeout. Fake clock throughout; no sockets here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READINESS_PATH,
  computeReadinessProof,
} from "../src/sharing/readiness-identity";
import {
  ServerExitedError,
  ServerNotReadyError,
  waitForServer,
  type ReadinessGet,
  type ReadinessReply,
} from "../src/sharing/server-readiness";

const ORIGIN = "http://localhost:41234";
const KEY = "k".repeat(64);

let counter = 0;
/** Distinct, deterministic "random" bytes per call. */
function randomBytes(size: number): Buffer {
  counter += 1;
  return Buffer.alloc(size, counter);
}

function challengeOf(url: string): string {
  return new URL(url).searchParams.get("challenge") ?? "";
}

/** A reply the forked server would give. */
function genuine(url: string): ReadinessReply {
  return {
    statusCode: 200,
    body: JSON.stringify({
      proof: computeReadinessProof(KEY, challengeOf(url)),
    }),
  };
}

interface Exit {
  watchExit: (listener: (code: number | null) => void) => void;
  fire: (code: number | null) => void;
}

function exitHarness(alreadyExited?: number | null): Exit {
  const listeners: Array<(code: number | null) => void> = [];
  let exited: { code: number | null } | undefined =
    alreadyExited === undefined ? undefined : { code: alreadyExited };
  return {
    watchExit: (listener) => {
      if (exited) listener(exited.code);
      else listeners.push(listener);
    },
    fire: (code) => {
      exited = { code };
      for (const l of listeners) l(code);
    },
  };
}

function start(
  get: ReadinessGet,
  exit: Exit = exitHarness(),
  extra: { timeoutMs?: number; retryMs?: number; pollTimeoutMs?: number } = {},
): Promise<void> {
  return waitForServer({
    origin: ORIGIN,
    key: KEY,
    get,
    randomBytes,
    watchExit: exit.watchExit,
    ...extra,
  });
}

/** Attaches a handler at once so a later rejection is never unhandled. */
function settle(promise: Promise<void>): {
  state: () => "pending" | "resolved" | "rejected";
  error: () => unknown;
} {
  let state: "pending" | "resolved" | "rejected" = "pending";
  let error: unknown;
  promise.then(
    () => {
      state = "resolved";
    },
    (e: unknown) => {
      state = "rejected";
      error = e;
    },
  );
  return { state: () => state, error: () => error };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("what the poll sends", () => {
  it("asks the route on the given origin with a fresh challenge and nothing else", async () => {
    const get = vi.fn<ReadinessGet>(async (url) => genuine(url));
    await start(get);
    expect(get).toHaveBeenCalledTimes(1);
    const args = get.mock.calls[0];
    // A url and an abort signal: there is no place to put a header.
    expect(args).toHaveLength(2);
    expect(args[1]).toBeInstanceOf(AbortSignal);
    const url = new URL(args[0]);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe(READINESS_PATH);
    expect(challengeOf(args[0])).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.size).toBe(1);
  });

  it("uses a new challenge on every poll", async () => {
    const seen: string[] = [];
    const get: ReadinessGet = async (url) => {
      seen.push(challengeOf(url));
      return { statusCode: 503, body: "" };
    };
    const outcome = settle(start(get, exitHarness(), { retryMs: 10 }));
    await vi.advanceTimersByTimeAsync(35);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(outcome.state()).toBe("pending");
  });

  it("the module has no window-secret, header, log or console", () => {
    const src = readFileSync(
      path.join(__dirname, "../src/sharing/server-readiness.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/window-secret|WINDOW_HEADER|x-getwrite-window/);
    expect(src).not.toMatch(/headers/i);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/\blog\(/);
  });
});

describe("what makes it ready", () => {
  it("resolves when the forked server answers with the proof of the challenge", async () => {
    await expect(start(async (url) => genuine(url))).resolves.toBeUndefined();
  });

  it.each([200, 401, 404, 500])(
    "a listener that answers %i without the proof never makes it ready, and it finally times out distinctly",
    async (statusCode) => {
      const get: ReadinessGet = async () => ({
        statusCode,
        body: "<html>some other program</html>",
      });
      const outcome = settle(start(get, exitHarness(), { timeoutMs: 2_000 }));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(outcome.state()).toBe("rejected");
      expect(outcome.error()).toBeInstanceOf(ServerNotReadyError);
      expect((outcome.error() as Error).message).toBe(
        "Server did not start in time",
      );
    },
  );

  it("does not accept a proof of another challenge, the key itself, or a malformed body", async () => {
    const bodies = [
      JSON.stringify({ proof: computeReadinessProof(KEY, "ab".repeat(32)) }),
      JSON.stringify({ proof: KEY }),
      JSON.stringify({ proof: 5 }),
      JSON.stringify({}),
      "not json",
      "",
      "null",
    ];
    for (const body of bodies) {
      const outcome = settle(
        start(async () => ({ statusCode: 200, body }), exitHarness(), {
          timeoutMs: 100,
        }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(outcome.state()).toBe("rejected");
      expect(outcome.error()).toBeInstanceOf(ServerNotReadyError);
    }
  });

  it("does not accept the right proof under a non-200 status", async () => {
    const get: ReadinessGet = async (url) => ({
      statusCode: 500,
      body: genuine(url).body,
    });
    const outcome = settle(start(get, exitHarness(), { timeoutMs: 100 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(outcome.state()).toBe("rejected");
  });

  it("does not accept a proof replayed from an earlier poll", async () => {
    let first: string | undefined;
    const get: ReadinessGet = async (url) => {
      const reply = genuine(url);
      if (first === undefined) {
        first = reply.body;
        return { statusCode: 503, body: "" };
      }
      return { statusCode: 200, body: first };
    };
    const outcome = settle(start(get, exitHarness(), { timeoutMs: 100 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(outcome.state()).toBe("rejected");
  });

  it("retries after an error and a 503, then resolves", async () => {
    let n = 0;
    const get: ReadinessGet = async (url) => {
      n += 1;
      if (n === 1) throw new Error("ECONNREFUSED");
      if (n === 2) return { statusCode: 503, body: "" };
      return genuine(url);
    };
    const outcome = settle(start(get, exitHarness(), { retryMs: 10 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.state()).toBe("resolved");
    expect(n).toBe(3);
  });
});

describe("the real server's timing is unchanged (30 s, every 500 ms)", () => {
  it("polls every 500 ms and resolves as soon as the server answers", async () => {
    const times: number[] = [];
    const t0 = Date.now();
    const get: ReadinessGet = async (url) => {
      times.push(Date.now() - t0);
      return times.length < 4 ? { statusCode: 503, body: "" } : genuine(url);
    };
    const outcome = settle(start(get));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(outcome.state()).toBe("resolved");
    expect(times).toEqual([0, 500, 1000, 1500]);
  });

  it("keeps waiting for just under 30 s and gives up just after it", async () => {
    const get: ReadinessGet = async () => ({ statusCode: 503, body: "" });
    const outcome = settle(start(get));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(outcome.state()).toBe("pending");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(outcome.state()).toBe("rejected");
    expect(outcome.error()).toBeInstanceOf(ServerNotReadyError);
  });
});

describe("each poll has its own timeout", () => {
  it("a listener that accepts and stays silent cannot hold a poll open", async () => {
    const signals: AbortSignal[] = [];
    // Ignores its signal and never settles, like a peer that never answers.
    const get: ReadinessGet = (_url, signal) => {
      signals.push(signal);
      return new Promise<ReadinessReply>(() => undefined);
    };
    const outcome = settle(
      start(get, exitHarness(), {
        pollTimeoutMs: 100,
        retryMs: 10,
        timeoutMs: 1_000,
      }),
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(signals.length).toBeGreaterThan(2);
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(outcome.state()).toBe("rejected");
    expect(outcome.error()).toBeInstanceOf(ServerNotReadyError);
  });

  it("a late reply to a timed-out poll is ignored", async () => {
    let release: ((reply: ReadinessReply) => void) | undefined;
    let n = 0;
    const get: ReadinessGet = (url) => {
      n += 1;
      if (n === 1) {
        return new Promise<ReadinessReply>((resolve) => {
          release = () => resolve(genuine(url));
        });
      }
      return Promise.resolve({ statusCode: 503, body: "" });
    };
    const outcome = settle(
      start(get, exitHarness(), {
        pollTimeoutMs: 50,
        retryMs: 10,
        timeoutMs: 120,
      }),
    );
    await vi.advanceTimersByTimeAsync(60);
    release?.({ statusCode: 200, body: "" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(outcome.state()).toBe("rejected");
  });
});

describe("the forked server exits", () => {
  it.each([7, 1, 0, null])(
    "stops polling at once on exit code %s and reports it distinctly",
    async (code) => {
      const signals: AbortSignal[] = [];
      let calls = 0;
      const get: ReadinessGet = (_url, signal) => {
        calls += 1;
        signals.push(signal);
        return new Promise<ReadinessReply>(() => undefined);
      };
      const exit = exitHarness();
      const outcome = settle(start(get, exit, { retryMs: 10 }));
      await vi.advanceTimersByTimeAsync(5);
      exit.fire(code);
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome.state()).toBe("rejected");
      const error = outcome.error();
      expect(error).toBeInstanceOf(ServerExitedError);
      expect(error).not.toBeInstanceOf(ServerNotReadyError);
      expect((error as ServerExitedError).code).toBe(code);
      expect(signals[0].aborted).toBe(true);
      const callsAtExit = calls;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(calls).toBe(callsAtExit);
    },
  );

  it("does not poll at all when the server had already exited", async () => {
    const get = vi.fn<ReadinessGet>(async (url) => genuine(url));
    const outcome = settle(start(get, exitHarness(1)));
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.state()).toBe("rejected");
    expect(outcome.error()).toBeInstanceOf(ServerExitedError);
    expect(get).not.toHaveBeenCalled();
  });

  it("an exit after confirmation changes nothing", async () => {
    const exit = exitHarness();
    await start(async (url) => genuine(url), exit);
    expect(() => exit.fire(1)).not.toThrow();
  });
});
