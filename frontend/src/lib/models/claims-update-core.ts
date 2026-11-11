/**
 * @module claims-update-core
 *
 * Change a claim's status, Source link and statement in one write (Feature
 * 108, FR-9, FR-10, FR-11). Contract stub: replaced by Task 12; the body
 * throws until then.
 */
import type { Annotation } from "./types";

/**
 * Apply an update to a stored claim inside one `mutateSidecar` write.
 *
 * @param projectId    Server-validated project id.
 * @param resourceId   Text resource id.
 * @param annotationId The claim's annotation id.
 * @param input        Unvalidated {@link import("./claim-types").UpdateClaimInput}.
 * @returns The stored annotation.
 */
export async function updateClaimCore(
  projectId: string,
  resourceId: string,
  annotationId: string,
  input: unknown,
): Promise<Annotation> {
  void projectId;
  void resourceId;
  void annotationId;
  void input;
  throw new Error("not implemented");
}
