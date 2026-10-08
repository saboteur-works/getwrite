/**
 * @module resource-initial-revision
 *
 * Root-taking writers for a text resource's initial canonical revision, shared
 * by blank creation, template creation, copy and duplicate. Imports only leaf
 * modules so `resource-templates.ts` can depend on it without an import cycle
 * through `resource-crud-core.ts`.
 */
import { loadProjectConfig } from "./project-config";
import { isLockedAccessError } from "./locked-access";
import { writeResourceToFile } from "./resource-persistence";
import { resolveInitialRevisionName } from "./resource-revision";
import { writeRevision } from "./revision";
import { plainTextToTipTapDocument } from "./tiptap-doc";
import type { AnyResource, TextResource, TipTapDocument } from "./types";

/**
 * Writes `v-1` as the canonical revision of `resourceId`, serialized as a
 * TipTap document (the editor only recognises a JSON payload when it loads a
 * revision; a plain-text one collapses to one paragraph).
 *
 * The revision name comes from the project's config. Only a locked-access
 * error from the config read propagates; any other failure (missing file,
 * bad JSON, schema failure) falls back to the default name.
 *
 * @throws A locked-access error when the project is locked or keyless.
 */
export async function writeInitialCanonicalRevision(
  projectRoot: string,
  resourceId: string,
  tiptapDocument: TipTapDocument,
): Promise<void> {
  let revisionName: string;
  try {
    revisionName = resolveInitialRevisionName(
      await loadProjectConfig(projectRoot),
    );
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    revisionName = resolveInitialRevisionName({ editorConfig: {} });
  }
  await writeRevision(
    projectRoot,
    resourceId,
    1,
    JSON.stringify(tiptapDocument),
    { isCanonical: true, metadata: { name: revisionName } },
  );
}

/**
 * Persists `resource` via {@link writeResourceToFile} and, for a text
 * resource, writes its initial canonical revision from its TipTap document
 * (or its plain text converted to one).
 */
export async function writeResourceWithInitialRevision(
  projectRoot: string,
  resource: AnyResource,
): Promise<AnyResource> {
  await writeResourceToFile(projectRoot, resource);
  if (resource.type === "text") {
    const text = resource as TextResource;
    await writeInitialCanonicalRevision(
      projectRoot,
      resource.id,
      text.tiptap ?? plainTextToTipTapDocument(text.plainText ?? ""),
    );
  }
  return resource;
}
