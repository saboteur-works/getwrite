/**
 * @module organizer-arrangements-core
 *
 * Contract stub (Feature 109, Task 2). Task 25 replaces the bodies:
 * per-arrangement add, rename and delete, each a read-modify-write inside
 * `updateProjectJson`, plus the shared draft validation Task 35 reuses for
 * seeded arrangements. The signatures are what the route, transport, native
 * backend and seeding import.
 */
import type {
  OrganizerArrangementAddInput,
  OrganizerArrangementAddResult,
  OrganizerArrangementDeleteInput,
  OrganizerArrangementDeleteResult,
  OrganizerArrangementDraft,
  OrganizerArrangementRenameInput,
  OrganizerArrangementRenameResult,
} from "./organizer-grid-types";

/**
 * Validates a candidate arrangement (name, source, axes) without any lock.
 * Returns the trimmed, checked draft.
 *
 * @throws Always, until Task 25: `not implemented`.
 */
export function validateOrganizerArrangementDraft(
  _input: unknown,
): OrganizerArrangementDraft {
  throw new Error("not implemented");
}

/**
 * Adds an arrangement to the project named by `projectId`.
 *
 * @throws Always, until Task 25: `not implemented`.
 */
export async function addOrganizerArrangementCore(
  _projectId: string,
  _input: OrganizerArrangementAddInput,
): Promise<OrganizerArrangementAddResult> {
  throw new Error("not implemented");
}

/**
 * Renames an arrangement of the project named by `projectId`.
 *
 * @throws Always, until Task 25: `not implemented`.
 */
export async function renameOrganizerArrangementCore(
  _projectId: string,
  _input: OrganizerArrangementRenameInput,
): Promise<OrganizerArrangementRenameResult> {
  throw new Error("not implemented");
}

/**
 * Deletes an arrangement of the project named by `projectId`.
 *
 * @throws Always, until Task 25: `not implemented`.
 */
export async function deleteOrganizerArrangementCore(
  _projectId: string,
  _input: OrganizerArrangementDeleteInput,
): Promise<OrganizerArrangementDeleteResult> {
  throw new Error("not implemented");
}
