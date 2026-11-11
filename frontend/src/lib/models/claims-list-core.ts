/**
 * @module claims-list-core
 *
 * Project-wide claim list (Feature 108, FR-17). Contract stub: replaced by
 * Task 13; the body throws until then.
 */
import type { ClaimListResult } from "./claim-types";

/**
 * List every claim in the project, plus the resources whose annotations could
 * not be read.
 *
 * @param projectId Server-validated project id.
 */
export async function listClaimsCore(
  projectId: string,
): Promise<ClaimListResult> {
  void projectId;
  throw new Error("not implemented");
}
