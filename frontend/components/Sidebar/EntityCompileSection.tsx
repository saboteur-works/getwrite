"use client";

import { useMemo, useState } from "react";
import useAppSelector from "../../src/store/hooks";
import {
  selectFoldersAndResources,
  selectResources,
} from "../../src/store/resourcesSlice";
import {
  selectProject,
  selectActiveProjectDirectoryId,
  selectSelectedProjectId,
} from "../../src/store/projectsSlice";
import { useEntityMentions } from "./EntityMentionsContext";
import { orderResourceIdsByTreePosition } from "../common/compileSelection";
import CompilePreviewModal, {
  type EntityCompileEntry,
  type CompileOptions,
} from "../common/CompilePreviewModal";
import { runCompileAndDownload } from "../../src/lib/compile/run-compile-and-download";
import type { CompileBody } from "../../src/lib/api/compile";
import { toastService } from "../../src/lib/toast-service";
import Button from "../common/UI/Button/Button";

/**
 * The entity-scoped compile trigger (FR-1/FR-2/FR-3/FR-6/FR-7/FR-9 of
 * `specs/features/entity-scoped-compile.md`): compiles every resource
 * associated with the selected entity into one ordered document.
 *
 * Split out of `EntityMentionsSection` so it can render *outside* the
 * collapsible "Entity Mentions" section in `MetadataSidebar.tsx`. Collapsing
 * that section previously hid the compile action along with the list, since
 * both were rendered by the same component inside the same collapsible.
 *
 * FR-2's resource set is unchanged by the move: it is still every row
 * `getEntityMentionedIn` returned, both `isLinked` and `isMentioned`, with no
 * additional filtering — now read from the shared
 * {@link useEntityMentions} fetch rather than from local state. This is the
 * merged Mention+Backlinks set, deliberately, and is not the same set the
 * "Also appears with" co-occurrence line is derived from.
 */
export default function EntityCompileSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const projectResources = useAppSelector((state) =>
    selectResources(state.resources),
  );
  // FR-3 needs the *folders* as well as the resources: `buildResourceTree`
  // resolves each resource's `folderId` against folder entries in the same
  // array, and silently re-parents to root anything whose parent is absent.
  // Passing resources alone therefore flattens the tree and degrades the
  // depth-first walk into a global `orderIndex` sort. `AppShell.tsx` builds
  // its compile tree from `[...resources, ...folders]` for the same reason.
  const projectTreeItems = useAppSelector((state) =>
    selectFoldersAndResources(state.resources),
  );
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const project = useAppSelector((state) =>
    selectedProjectId ? selectProject(state, selectedProjectId) : null,
  );

  const { rows, isLoading, isEntitySelected } = useEntityMentions();
  const [isCompileModalOpen, setIsCompileModalOpen] = useState(false);

  // FR-2: the merged resource set is every row the shared fetch returned,
  // both `isLinked` and `isMentioned`, exactly as returned — no additional
  // filtering here.
  const mergedResourceIds = useMemo(
    () => rows.map((row) => row.resourceId),
    [rows],
  );

  // FR-3: ordered against the project's full resource tree. Ids not present
  // in the tree (e.g. a stale backlink to a deleted resource) are dropped by
  // `orderResourceIdsByTreePosition` itself.
  const orderedResourceIds = useMemo(
    () => orderResourceIdsByTreePosition(projectTreeItems, mergedResourceIds),
    [projectTreeItems, mergedResourceIds],
  );

  const compileEntries: EntityCompileEntry[] = useMemo(
    () =>
      orderedResourceIds.map((id) => {
        const full = projectResources.find((r) => r.id === id);
        return {
          resourceId: id,
          name: full?.name ?? id,
          resourceType: full?.type ?? "text",
        };
      }),
    [orderedResourceIds, projectResources],
  );

  if (!isEntitySelected) return null;

  // Nothing is rendered mid-fetch. `rows` is empty until it resolves, so
  // rendering here would show "No associated resources to compile." for an
  // entity that in fact has some, then replace it — a claim the component
  // cannot yet support.
  if (isLoading) return null;

  const hasCompilableResources = orderedResourceIds.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={() => setIsCompileModalOpen(true)}
        disabled={!hasCompilableResources}
        aria-disabled={!hasCompilableResources}
      >
        Compile this entity&apos;s resources
      </Button>
      {!hasCompilableResources && (
        <p className="text-gw-nano text-gw-secondary">
          No associated resources to compile.
        </p>
      )}

      {projectId && (
        <CompilePreviewModal
          isOpen={isCompileModalOpen}
          projectId={projectId}
          resources={projectResources}
          onClose={() => setIsCompileModalOpen(false)}
          entityMode={{ entries: compileEntries, orderedResourceIds }}
          onConfirmCompile={async (
            selectedIds: string[],
            options: CompileOptions,
          ) => {
            const compileBody: CompileBody = {
              projectId,
              resourceIds: selectedIds,
              resources: projectResources.map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
              })),
              includeHeaders: options.includeHeaders,
              projectName: project?.name ?? "project",
            };
            try {
              await runCompileAndDownload(compileBody, {
                format: options.format,
                compilationName: options.compilationName,
              });
            } catch (err) {
              toastService.error(
                "Compile failed",
                err instanceof Error ? err.message : String(err),
              );
            }
          }}
        />
      )}
    </div>
  );
}
