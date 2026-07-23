/**
 * Unit tests for `/api/auth/[...all]` — the better-auth catch-all route
 * handler (FR1, `specs/features/auth-provider.md`).
 *
 * `isHostedAuthActive`, `getAuthServer`, and `toNextJsHandler` are all
 * mocked: no real Postgres or better-auth instance is involved. The tests
 * assert (a) the inactive path never reaches `getAuthServer`/
 * `toNextJsHandler` and responds 404, and (b) the active path delegates to
 * `toNextJsHandler(getAuthServer())`'s corresponding method.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  isHostedAuthActiveMock,
  getAuthServerMock,
  toNextJsHandlerMock,
  mountedHandlers,
} = vi.hoisted(() => {
  const mountedHandlers = {
    GET: vi.fn(async () => new Response("get-ok")),
    POST: vi.fn(async () => new Response("post-ok")),
    PATCH: vi.fn(async () => new Response("patch-ok")),
    PUT: vi.fn(async () => new Response("put-ok")),
    DELETE: vi.fn(async () => new Response("delete-ok")),
  };
  return {
    isHostedAuthActiveMock: vi.fn(),
    getAuthServerMock: vi.fn(() => ({ __fakeAuthInstance: true })),
    toNextJsHandlerMock: vi.fn(() => mountedHandlers),
    mountedHandlers,
  };
});

vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));
vi.mock("../../src/lib/auth/auth-server", () => ({
  getAuthServer: getAuthServerMock,
}));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: toNextJsHandlerMock,
}));

import {
  GET,
  POST,
  PATCH,
  PUT,
  DELETE,
} from "../../app/api/auth/[...all]/route";

function req(method: string) {
  return new Request("https://getwrite.example.com/api/auth/sign-in", {
    method,
  });
}

beforeEach(() => {
  isHostedAuthActiveMock.mockReset();
  getAuthServerMock.mockClear();
  toNextJsHandlerMock.mockClear();
  for (const fn of Object.values(mountedHandlers)) fn.mockClear();
});

describe("when hosted auth is inactive", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(false);
  });

  it("GET returns 404 without calling getAuthServer/toNextJsHandler", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(404);
    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(toNextJsHandlerMock).not.toHaveBeenCalled();
  });

  it("POST returns 404 without calling getAuthServer/toNextJsHandler", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(404);
    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(toNextJsHandlerMock).not.toHaveBeenCalled();
  });

  it("PATCH/PUT/DELETE all return 404 without touching better-auth machinery", async () => {
    for (const [method, handler] of [
      ["PATCH", PATCH],
      ["PUT", PUT],
      ["DELETE", DELETE],
    ] as const) {
      const res = await handler(req(method));
      expect(res.status).toBe(404);
    }
    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(toNextJsHandlerMock).not.toHaveBeenCalled();
  });
});

describe("when hosted auth is active", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
  });

  it("GET delegates to toNextJsHandler(getAuthServer()).GET", async () => {
    const res = await GET(req("GET"));
    expect(getAuthServerMock).toHaveBeenCalledOnce();
    expect(toNextJsHandlerMock).toHaveBeenCalledWith({
      __fakeAuthInstance: true,
    });
    expect(mountedHandlers.GET).toHaveBeenCalledOnce();
    await expect(res.text()).resolves.toBe("get-ok");
  });

  it("POST delegates to toNextJsHandler(getAuthServer()).POST", async () => {
    const res = await POST(req("POST"));
    expect(mountedHandlers.POST).toHaveBeenCalledOnce();
    await expect(res.text()).resolves.toBe("post-ok");
  });

  it("PATCH/PUT/DELETE each delegate to the corresponding mounted method", async () => {
    await PATCH(req("PATCH"));
    await PUT(req("PUT"));
    await DELETE(req("DELETE"));
    expect(mountedHandlers.PATCH).toHaveBeenCalledOnce();
    expect(mountedHandlers.PUT).toHaveBeenCalledOnce();
    expect(mountedHandlers.DELETE).toHaveBeenCalledOnce();
  });
});
