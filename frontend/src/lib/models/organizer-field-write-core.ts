/**
 * @module organizer-field-write-core
 *
 * Contract stub (Feature 109, Task 2). Task 10 replaces the body: set named
 * `userMetadata` keys and `resourceSubtype` for one resource inside
 * `mutateSidecar`, one write for many fields. The signature is what the
 * route, transport and native backend import.
 */
import type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteResult,
} from "./organizer-grid-types";

export type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteResult,
} from "./organizer-grid-types";

/**
 * Applies one field write to one resource of the project named by `projectId`.
 *
 * @throws Always, until Task 10: `not implemented`.
 */
export async function setOrganizerFieldsCore(
  _projectId: string,
  _input: OrganizerFieldWriteInput,
): Promise<OrganizerFieldWriteResult> {
  throw new Error("not implemented");
}
