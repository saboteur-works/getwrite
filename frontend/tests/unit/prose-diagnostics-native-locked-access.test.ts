/**
 * Feature 62, Task 8: locked/keyless fail-closed coverage for the native
 * prose-diagnostics transport.
 *
 * `native-prose-diagnostics-backend.ts` mirrors the HTTP transport's
 * "degrade gracefully to an empty/zeroed default" contract for ordinary
 * failures (network, malformed body, invalid `projectId`) — but a genuine
 * locked-access failure (`isLockedAccessError`) is a distinct case that must
 * not be swallowed into that same degrade path, matching the model layer's
 * own `loadDiagnosticsIndex` (`diagnostics-index.ts`) and
 * `loadPersistedPlainText` (`indexer-queue.ts`), both of which already
 * rethrow rather than degrade on lock.
 *
 * Mirrors `native-revision-backend.test.ts`'s "surfaces a locked project as
 * a locked-access error, not a degraded value" pattern: every
 * `CapacitorFilesystemLike` method on the injected fake rejects with
 * `ProjectLockedError`, via a `Proxy` over `createFakeCapacitorFilesystem()`.
 */
import { describe, expect, it } from "vitest";
import {
  isLockedAccessError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { createNativeProseDiagnosticsTransport } from "../../src/store/transport/native-prose-diagnostics-backend";
import {
  EMPTY_PROSE_DIAGNOSTICS,
  EMPTY_PROSE_DIAGNOSTICS_DETAIL,
} from "../../src/lib/api/prose-diagnostics";

const PROJECTS_DIR = "/projects";

function lockedFilesystem(
  projectId: string,
): ReturnType<typeof createFakeCapacitorFilesystem> {
  return new Proxy(createFakeCapacitorFilesystem(), {
    get: () => () => Promise.reject(new ProjectLockedError(projectId)),
  });
}

describe("native prose-diagnostics transport — locked-access fail-closed", () => {
  it("getProseDiagnostics rejects with a locked-access error rather than degrading to EMPTY_PROSE_DIAGNOSTICS", async () => {
    const projectId = generateUUID();
    const transport = createNativeProseDiagnosticsTransport({
      fs: lockedFilesystem(projectId),
      projectsDir: PROJECTS_DIR,
    });

    const outcome = await transport
      .getProseDiagnostics(projectId, generateUUID())
      .then(
        (value) => ({ rejected: false as const, value }),
        (error: unknown) => ({ rejected: true as const, error }),
      );

    expect(outcome.rejected).toBe(true);
    if (outcome.rejected) {
      expect(isLockedAccessError(outcome.error)).toBe(true);
    }
  });

  it("getProseDiagnosticsDetail rejects with a locked-access error rather than degrading to EMPTY_PROSE_DIAGNOSTICS_DETAIL", async () => {
    const projectId = generateUUID();
    const transport = createNativeProseDiagnosticsTransport({
      fs: lockedFilesystem(projectId),
      projectsDir: PROJECTS_DIR,
    });

    const outcome = await transport
      .getProseDiagnosticsDetail(projectId, generateUUID())
      .then(
        (value) => ({ rejected: false as const, value }),
        (error: unknown) => ({ rejected: true as const, error }),
      );

    expect(outcome.rejected).toBe(true);
    if (outcome.rejected) {
      expect(isLockedAccessError(outcome.error)).toBe(true);
    }
  });

  it("distinguishes locked access from an ordinary failure: an invalid projectId still degrades to the empty defaults, not a rejection", async () => {
    // No lock involved at all here — `resolveProjectRoot` returns `null` for
    // a malformed id, which both methods treat as an ordinary "nothing to
    // read" case (their documented degrade-gracefully default), never a
    // rejection. This is the contrast case: locked access rejects (above),
    // an invalid projectId does not.
    const transport = createNativeProseDiagnosticsTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.getProseDiagnostics("not-a-uuid", generateUUID()),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS);
    await expect(
      transport.getProseDiagnosticsDetail("not-a-uuid", generateUUID()),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS_DETAIL);
  });
});
