/**
 * @module claims-add-core
 *
 * Create a claim in one write (Feature 108, FR-7). Contract stub: replaced by
 * Task 11; the body throws until then.
 */
import type { Annotation } from "./types";

/**
 * Store a new claim annotation with `claim: { status: "unverified",
 * statusChangedAt }` in one `mutateSidecar` write.
 *
 * @param projectId  Server-validated project id.
 * @param resourceId Text resource id.
 * @param input      Unvalidated {@link import("./claim-types").NewClaimInput}.
 * @returns The stored annotation.
 */
export async function addClaimCore(
  projectId: string,
  resourceId: string,
  input: unknown,
): Promise<Annotation> {
  void projectId;
  void resourceId;
  void input;
  throw new Error("not implemented");
}
