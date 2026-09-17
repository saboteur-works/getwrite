// Last Updated: 2026-09-17

/**
 * Feature 54, Task 14 — regression coverage for `app/api/project-types/route.ts`
 * (one of the nine routes confirmed 2026-09-17 to swallow ANY error,
 * including a locked-access error, into a fixed-shape response).
 *
 * **Finding (see the Task 14 report):** unlike the other eight routes in
 * scope for this task, this route's `GET` is NOT wrapped by
 * `withStorageContext` — it isn't in this file's imports at all — and it
 * reads a fixed template directory via `node:fs/promises` directly, never
 * going through the `StorageContext`-scoped adapter that is the only source
 * of a real `ProjectLockedError`/`MissingProjectKeyError`. So a rethrow
 * added here (done, for consistency with the other eight sites) cannot
 * currently resolve to a 401/409 the way it does on those other routes —
 * there is no wrapper positioned to map it. This test therefore only proves
 * the narrower claim the source fix actually makes: a locked-access-shaped
 * error is no longer swallowed into the route's fixed
 * `{ error: "Cannot read project types", ... }` 500 response — it now
 * propagates uncaught. It cannot assert a 401/409 response, because none is
 * produced without the wrapper this route lacks.
 */
import fs from "node:fs/promises";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: { ...actual, readdir: vi.fn(actual.readdir) },
    readdir: vi.fn(actual.readdir),
  };
});

describe("GET /api/project-types — locked-access rethrow (FR-14)", () => {
  afterEach(() => {
    vi.mocked(fs.readdir).mockRestore?.();
  });

  it("propagates a locked-access-shaped error instead of folding it into the fixed 500 shape", async () => {
    vi.mocked(fs.readdir).mockRejectedValueOnce(
      new ProjectLockedError("11111111-1111-4111-8111-111111111111"),
    );

    const { GET } = await import("../../app/api/project-types/route");

    // No withStorageContext wrapper sits above this handler, so there is no
    // 401/409 to observe here — only that the error is no longer swallowed
    // into the old fixed-shape 500 response.
    await expect(GET()).rejects.toBeInstanceOf(ProjectLockedError);
  });
});
