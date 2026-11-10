/**
 * Feature 107 Task 9 (FR-4 cancel and no write before choice, FR-11 refusal,
 * queue, count and discard on decline, FR-13 no project): the pure share
 * session reducer. Project ids here are on-disk DIRECTORY ids (as
 * `useCaptureProjectChoice` produces), deliberately unlike any `project.id`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_SHARE_SESSION,
  shareSessionReducer,
  type ShareSessionAction,
  type ShareSessionState,
} from "../../src/lib/share-session";
import type {
  ShareReceivedEvent,
  ShareResult,
} from "../../src/lib/api/share-capture-types";

const DIR_ID = "9f1c2e7a-dir-0001";

function share(id: string): ShareReceivedEvent {
  return { shareId: id, items: [{ kind: "text", text: `text ${id}` }] };
}

function run(
  actions: ShareSessionAction[],
  from: ShareSessionState = INITIAL_SHARE_SESSION,
): ShareSessionState {
  return actions.reduce(shareSessionReducer, from);
}

const received = (id: string): ShareSessionAction => ({
  type: "received",
  share: share(id),
});

function resultFor(id: string): ShareResult {
  return {
    shareId: id,
    items: [
      {
        status: "captured",
        index: 0,
        kind: "text",
        resourceId: "r1",
        inboxFolderId: "i",
      },
    ],
    capturedCount: 1,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("receiving", () => {
  it("makes a share received with nothing in progress the current share awaiting a project choice", () => {
    const s = run([received("a")]);
    expect(s.phase).toBe("choosing");
    expect(s.current?.shareId).toBe("a");
    expect(s.queue).toEqual([]);
  });

  it("queues a share received while a project choice is pending, in order", () => {
    const s = run([received("a"), received("b"), received("c")]);
    expect(s.current?.shareId).toBe("a");
    expect(s.queue.map((q) => q.shareId)).toEqual(["b", "c"]);
  });

  it("queues behind an open unlock prompt with the count visible in the state", () => {
    const s = run([
      received("a"),
      { type: "unlockRequired", projectId: DIR_ID },
      received("b"),
      received("c"),
    ]);
    expect(s.phase).toBe("unlocking");
    expect(s.current?.shareId).toBe("a");
    expect(s.queue.map((q) => q.shareId)).toEqual(["b", "c"]);
    expect(s.queuedCount).toBe(2);
  });

  it("keeps queuedCount equal to the queue length through every change", () => {
    let s = run([received("a"), received("b")]);
    expect(s.queuedCount).toBe(1);
    s = run([{ type: "cancel" }], s);
    expect(s.queuedCount).toBe(0);
    expect(s.queue).toEqual([]);
  });
});

describe("a project is needed (FR-13)", () => {
  it("goes to needs-project with an empty project list, keeping nothing as captured", () => {
    const s = run([received("a"), { type: "projectsLoaded", projectIds: [] }]);
    expect(s.phase).toBe("needs-project");
    expect(s.current?.shareId).toBe("a");
    expect(s.outcome).toBeNull();
    expect(s.finishedShareIds).toEqual([]);
  });

  it("returns to choosing when a project later appears", () => {
    const s = run([
      received("a"),
      { type: "projectsLoaded", projectIds: [] },
      { type: "projectsLoaded", projectIds: [DIR_ID] },
    ]);
    expect(s.phase).toBe("choosing");
  });

  it("stays choosing with a non-empty list", () => {
    const s = run([
      received("a"),
      { type: "projectsLoaded", projectIds: [DIR_ID] },
    ]);
    expect(s.phase).toBe("choosing");
  });

  it("cancel from needs-project discards the share and offers the queue", () => {
    const s = run([
      received("a"),
      received("b"),
      { type: "projectsLoaded", projectIds: [] },
      { type: "cancel" },
    ]);
    expect(s.current?.shareId).toBe("b");
    expect(s.phase).toBe("choosing");
  });
});

describe("choosing, running and finishing", () => {
  it("runs the current share on the chosen directory id", () => {
    const s = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
    ]);
    expect(s.phase).toBe("running");
    expect(s.projectId).toBe(DIR_ID);
  });

  it("ignores a choice when there is no current share or it is not choosing", () => {
    expect(run([{ type: "projectChosen", projectId: DIR_ID }])).toEqual(
      INITIAL_SHARE_SESSION,
    );
    const running = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
    ]);
    expect(
      run([{ type: "projectChosen", projectId: "other" }], running),
    ).toEqual(running);
  });

  it("ends with the result, records the id as finished and keeps the queue", () => {
    const s = run([
      received("a"),
      received("b"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "finished", result: resultFor("a") },
    ]);
    expect(s.phase).toBe("ended");
    expect(s.current).toBeNull();
    expect(s.outcome).toEqual({ kind: "result", result: resultFor("a") });
    expect(s.finishedShareIds).toEqual(["a"]);
    expect(s.queue.map((q) => q.shareId)).toEqual(["b"]);
  });

  it("ignores a result for a share that is not running", () => {
    const s = run([
      received("a"),
      { type: "finished", result: resultFor("a") },
    ]);
    expect(s.phase).toBe("choosing");
    const r = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "finished", result: resultFor("zzz") },
    ]);
    expect(r.phase).toBe("running");
  });

  it("dismiss offers the next queued share, or returns to idle", () => {
    const ended = run([
      received("a"),
      received("b"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "finished", result: resultFor("a") },
    ]);
    const next = run([{ type: "dismiss" }], ended);
    expect(next.phase).toBe("choosing");
    expect(next.current?.shareId).toBe("b");
    expect(next.outcome).toBeNull();
    expect(next.projectId).toBeNull();
    const idle = run(
      [
        { type: "projectChosen", projectId: DIR_ID },
        { type: "finished", result: resultFor("b") },
        { type: "dismiss" },
      ],
      next,
    );
    expect(idle.phase).toBe("idle");
    expect(idle.current).toBeNull();
  });

  it("a share arriving while a result is shown is queued behind it", () => {
    const s = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "finished", result: resultFor("a") },
      received("b"),
    ]);
    expect(s.phase).toBe("ended");
    expect(s.queue.map((q) => q.shareId)).toEqual(["b"]);
    expect(run([{ type: "dismiss" }], s).current?.shareId).toBe("b");
  });
});

describe("whole-share refusal (FR-11)", () => {
  it("ends the current share with a message that nothing was captured and why, leaving the queue", () => {
    const s = run([
      received("a"),
      received("b"),
      {
        type: "refused",
        reason:
          "This project is encrypted and cannot be captured into on this device.",
      },
    ]);
    expect(s.phase).toBe("ended");
    expect(s.current).toBeNull();
    expect(s.outcome?.kind).toBe("refused");
    const message = s.outcome?.kind === "refused" ? s.outcome.message : "";
    expect(message).toMatch(/nothing was captured/i);
    expect(message).toContain("encrypted");
    expect(s.finishedShareIds).toEqual(["a"]);
    expect(s.queue.map((q) => q.shareId)).toEqual(["b"]);
    expect(run([{ type: "dismiss" }], s).current?.shareId).toBe("b");
  });

  it("is ignored with no current share", () => {
    expect(run([{ type: "refused", reason: "x" }])).toEqual(
      INITIAL_SHARE_SESSION,
    );
  });
});

describe("cancel (FR-4)", () => {
  it("discards the current share and offers the queue, writing nothing", () => {
    const s = run([received("a"), received("b"), { type: "cancel" }]);
    expect(s.current?.shareId).toBe("b");
    expect(s.phase).toBe("choosing");
    expect(s.outcome).toBeNull();
    expect(s.finishedShareIds).toEqual(["a"]);
  });

  it("with an empty queue returns to idle", () => {
    expect(run([received("a"), { type: "cancel" }]).phase).toBe("idle");
  });

  it("does not cancel a share already running", () => {
    const s = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "cancel" },
    ]);
    expect(s.phase).toBe("running");
    expect(s.current?.shareId).toBe("a");
  });
});

describe("unlock", () => {
  const unlocking = (): ShareSessionState =>
    run([
      received("a"),
      received("b"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "unlockRequired", projectId: DIR_ID },
    ]);

  it("holds the share while the prompt is open", () => {
    const s = unlocking();
    expect(s.phase).toBe("unlocking");
    expect(s.current?.shareId).toBe("a");
    expect(s.projectId).toBe(DIR_ID);
  });

  it.each(["declined", "limited"] as const)(
    "an unlock that is %s discards the current share and every queued share with a nothing-captured message",
    (reason) => {
      const s = run([{ type: "unlockDeclined", reason }], unlocking());
      expect(s.current).toBeNull();
      expect(s.queue).toEqual([]);
      expect(s.queuedCount).toBe(0);
      expect(s.phase).toBe("ended");
      const message = s.outcome?.kind === "discarded" ? s.outcome.message : "";
      expect(message).toMatch(/nothing was captured/i);
      expect(s.finishedShareIds).toEqual(["a", "b"]);
      expect(run([{ type: "dismiss" }], s).phase).toBe("idle");
    },
  );

  it("says why for a limited unlock differently from a declined one", () => {
    const limited = run(
      [{ type: "unlockDeclined", reason: "limited" }],
      unlocking(),
    );
    const declined = run(
      [{ type: "unlockDeclined", reason: "declined" }],
      unlocking(),
    );
    expect(limited.outcome).not.toEqual(declined.outcome);
  });

  it("a successful unlock retries the held share once", () => {
    const s = run([{ type: "unlockSucceeded" }], unlocking());
    expect(s.phase).toBe("running");
    expect(s.current?.shareId).toBe("a");
    expect(s.projectId).toBe(DIR_ID);
    expect(s.unlockRetried).toBe(true);
    // a stray second success does not retry again
    expect(run([{ type: "unlockSucceeded" }], s)).toEqual(s);
    // a second lock after the retry discards everything instead of looping
    const again = run([{ type: "unlockRequired", projectId: DIR_ID }], s);
    expect(again.phase).toBe("ended");
    expect(again.outcome?.kind).toBe("discarded");
    expect(again.queue).toEqual([]);
  });

  it("ignores unlock actions when no unlock prompt is open", () => {
    const s = run([received("a")]);
    expect(run([{ type: "unlockSucceeded" }], s)).toEqual(s);
    expect(run([{ type: "unlockDeclined", reason: "declined" }], s)).toEqual(s);
  });

  it("resets the retry flag when the next share is offered", () => {
    const s = run(
      [
        { type: "unlockSucceeded" },
        { type: "finished", result: resultFor("a") },
        { type: "dismiss" },
      ],
      unlocking(),
    );
    expect(s.current?.shareId).toBe("b");
    expect(s.unlockRetried).toBe(false);
  });
});

describe("duplicate delivery (in memory only)", () => {
  it("ignores a shareId already current, queued or finished", () => {
    const base = run([received("a"), received("b")]);
    expect(run([received("a")], base)).toBe(base);
    expect(run([received("b")], base)).toBe(base);
    const finished = run([
      received("a"),
      { type: "projectChosen", projectId: DIR_ID },
      { type: "finished", result: resultFor("a") },
      { type: "dismiss" },
    ]);
    expect(run([received("a")], finished)).toBe(finished);
    const cancelled = run([received("c"), { type: "cancel" }]);
    expect(run([received("c")], cancelled)).toBe(cancelled);
  });
});

describe("memory-only state (FR-14 is the native consume, not this guard)", () => {
  it("makes no localStorage call through a whole flow and the state survives a JSON round trip", () => {
    const calls: string[] = [];
    const spyStorage = {
      getItem: (): null => (calls.push("getItem"), null),
      setItem: (): void => void calls.push("setItem"),
      removeItem: (): void => void calls.push("removeItem"),
      clear: (): void => void calls.push("clear"),
      key: (): null => (calls.push("key"), null),
      length: 0,
    };
    vi.stubGlobal("localStorage", spyStorage);
    const s = run([
      received("a"),
      received("b"),
      { type: "projectsLoaded", projectIds: [DIR_ID] },
      { type: "projectChosen", projectId: DIR_ID },
      { type: "unlockRequired", projectId: DIR_ID },
      { type: "unlockSucceeded" },
      { type: "finished", result: resultFor("a") },
      received("a"),
      { type: "dismiss" },
      { type: "refused", reason: "why" },
    ]);
    expect(calls).toEqual([]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("is pure: the input state is not mutated and an unknown action returns it", () => {
    const base = run([received("a"), received("b")]);
    const frozen = JSON.stringify(base);
    run([{ type: "cancel" }], base);
    expect(JSON.stringify(base)).toBe(frozen);
    expect(
      shareSessionReducer(base, {
        type: "nope",
      } as unknown as ShareSessionAction),
    ).toBe(base);
  });

  it("imports only the types module: no React, node:*, storage or Capacitor", () => {
    const file = path.resolve(__dirname, "../../src/lib/share-session.ts");
    const source = readFileSync(file, "utf8");
    const specs = [
      ...source.matchAll(
        /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s+["']([^"']+)["']/g,
      ),
    ].map((m) => m[1]);
    expect(specs).toEqual(["./api/share-capture-types"]);
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/localStorage|sessionStorage|node:|require\(/);
  });
});
