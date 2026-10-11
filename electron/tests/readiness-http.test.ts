/**
 * Feature 80, Task 9: the Node `http` sender for the readiness poll, against
 * real loopback sockets on port 0 (never 3000 or 7340), and the whole check
 * end to end against a stand-in "forked server" and a foreign listener.
 */
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  READINESS_PATH,
  computeReadinessProof,
} from "../src/sharing/readiness-identity";
import {
  MAX_READINESS_BODY_BYTES,
  httpReadinessGet,
} from "../src/sharing/readiness-http";
import {
  ServerNotReadyError,
  waitForServer,
} from "../src/sharing/server-readiness";
import { randomBytes } from "node:crypto";

const KEY = "k".repeat(64);
const servers: http.Server[] = [];
const sockets = new Set<import("node:net").Socket>();

async function listen(
  handler: http.RequestListener,
): Promise<{ origin: string; server: http.Server }> {
  const server = http.createServer(handler);
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

afterEach(async () => {
  for (const s of sockets) s.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("httpReadinessGet", () => {
  it("sends no window header, cookie or credential, and returns status and body", async () => {
    let seen: http.IncomingHttpHeaders = {};
    const { origin } = await listen((req, res) => {
      seen = req.headers;
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"proof":"x"}');
    });
    const reply = await httpReadinessGet(
      `${origin}${READINESS_PATH}?challenge=ab`,
      new AbortController().signal,
    );
    expect(reply).toEqual({ statusCode: 200, body: '{"proof":"x"}' });
    expect(Object.keys(seen)).not.toContain("x-getwrite-window");
    expect(Object.keys(seen)).not.toContain("cookie");
    expect(Object.keys(seen)).not.toContain("authorization");
  });

  it("rejects when the signal aborts a peer that never answers", async () => {
    const { origin } = await listen(() => undefined);
    const controller = new AbortController();
    const pending = httpReadinessGet(`${origin}/`, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toBeDefined();
  });

  it("rejects when nothing listens", async () => {
    const { origin, server } = await listen(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(
      httpReadinessGet(`${origin}/`, new AbortController().signal),
    ).rejects.toBeDefined();
  });

  it("does not read more than the cap of a body", async () => {
    const { origin } = await listen((_req, res) => {
      res.writeHead(200);
      res.end("a".repeat(MAX_READINESS_BODY_BYTES * 20));
    });
    const reply = await httpReadinessGet(
      `${origin}/`,
      new AbortController().signal,
    );
    expect(reply.body.length).toBeLessThanOrEqual(MAX_READINESS_BODY_BYTES);
  });

  it("does not follow a redirect", async () => {
    const { origin } = await listen((_req, res) => {
      res.writeHead(302, { location: "http://127.0.0.1:1/" });
      res.end();
    });
    const reply = await httpReadinessGet(
      `${origin}/`,
      new AbortController().signal,
    );
    expect(reply.statusCode).toBe(302);
  });
});

const FAST = { timeoutMs: 400, retryMs: 20, pollTimeoutMs: 100 };
const never = { watchExit: () => undefined };

describe("end to end with real sockets", () => {
  it("resolves against a server that holds the key", async () => {
    const { origin } = await listen((req, res) => {
      const challenge =
        new URL(req.url ?? "/", origin).searchParams.get("challenge") ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ proof: computeReadinessProof(KEY, challenge) }));
    });
    await expect(
      waitForServer({
        origin,
        key: KEY,
        get: httpReadinessGet,
        randomBytes,
        ...never,
        ...FAST,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([200, 401, 404, 500])(
    "a foreign listener answering %i never makes it ready, and it receives no secret",
    async (statusCode) => {
      const headersSeen: string[] = [];
      const { origin } = await listen((req, res) => {
        headersSeen.push(...Object.keys(req.headers));
        res.writeHead(statusCode, { "content-type": "text/html" });
        res.end("<html>another program</html>");
      });
      await expect(
        waitForServer({
          origin,
          key: KEY,
          get: httpReadinessGet,
          randomBytes,
          ...never,
          ...FAST,
        }),
      ).rejects.toBeInstanceOf(ServerNotReadyError);
      expect(headersSeen.length).toBeGreaterThan(0);
      expect(headersSeen).not.toContain("x-getwrite-window");
    },
  );

  it("a foreign listener that accepts and stays silent does not hold the check open", async () => {
    const { origin } = await listen(() => undefined);
    await expect(
      waitForServer({
        origin,
        key: KEY,
        get: httpReadinessGet,
        randomBytes,
        ...never,
        ...FAST,
      }),
    ).rejects.toBeInstanceOf(ServerNotReadyError);
  });
});
