// Last Updated: 2026-09-17

/**
 * Feature 54, Task 14 — regression coverage for `app/api/projects/route.ts`
 * (one of the nine routes confirmed 2026-09-17 to swallow ANY error,
 * including a locked-access error, into a fixed-shape response before it
 * could ever reach `withStorageContext`'s centralised 401/409 mapping,
 * Task 13).
 *
 * This file has two independently triggerable catch blocks — `getProjects`
 * (`GET`) and `createProject` (`POST`) — so both get their own test here,
 * per the task's done_when.
 *
 * `listProjectsCore`/`createProjectCore` are mocked so each test can force
 * the exact locked-access error it needs without a real encrypted project
 * or a real session keyring; `withStorageContext` itself (real, unmocked)
 * is what turns the rethrown error into the asserted status code.
 */
import { describe, it, expect, vi } from "vitest";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import { MissingProjectKeyError } from "../../src/lib/models/locked-access";

vi.mock("../../src/lib/models/project-crud-core", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/project-crud-core")
  >("../../src/lib/models/project-crud-core");
  return {
    ...actual,
    listProjectsCore: vi.fn(actual.listProjectsCore),
    createProjectCore: vi.fn(actual.createProjectCore),
  };
});

import {
  listProjectsCore,
  createProjectCore,
} from "../../src/lib/models/project-crud-core";

describe("GET /api/projects — locked-access rethrow (FR-14)", () => {
  it("maps a ProjectLockedError from listProjectsCore to 401 instead of the route's fixed 500 shape", async () => {
    vi.mocked(listProjectsCore).mockRejectedValueOnce(
      new ProjectLockedError("11111111-1111-4111-8111-111111111111"),
    );

    const { GET } = await import("../../app/api/projects/route");
    const response = await (GET as (req: Request) => Promise<Response>)(
      new Request("http://localhost/api/projects"),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).not.toMatch(/^Cannot read|internal/i);
  });
});

describe("POST /api/projects — locked-access rethrow (FR-14)", () => {
  it("maps a MissingProjectKeyError from createProjectCore to 409 instead of the route's fixed 500 shape", async () => {
    vi.mocked(createProjectCore).mockRejectedValueOnce(
      new MissingProjectKeyError("22222222-2222-4222-8222-222222222222"),
    );

    const { POST } = await import("../../app/api/projects/route");
    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Locked", projectType: "novel" }),
      }),
    );

    expect(response.status).toBe(409);
  });
});
