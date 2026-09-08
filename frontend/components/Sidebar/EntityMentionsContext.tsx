"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { getEntityMentionedIn } from "../../src/lib/api/mentions";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";

/**
 * @module EntityMentionsContext
 *
 * Owns the selected entity's `getEntityMentionedIn` fetch — the merged
 * "resources associated with this entity" set (explicit `linkedFrom`
 * backlinks plus detected prose mentions, merged server-side in
 * `mentions-core.ts`) — and shares one result with every consumer.
 *
 * This exists because two sibling surfaces need the same rows while
 * rendering in different places in `MetadataSidebar.tsx`:
 *
 * - `EntityMentionsSection` renders the rows themselves, inside the
 *   collapsible "Entity Mentions" section.
 * - `EntityCompileSection` renders the entity-scoped compile trigger,
 *   deliberately *outside* that collapsible, so collapsing the mentions
 *   list does not hide the compile action.
 *
 * Both previously lived in one component, so one fetch served both. Sharing
 * through this provider keeps that single fetch after the split; having each
 * component fetch for itself would repeat the same read, which loads each
 * associated resource's content to build snippets.
 *
 * The provider is the only fetcher: `useEntityMentions` throws outside it
 * rather than silently falling back to its own request, so a consumer added
 * later cannot reintroduce the duplicate read by accident.
 */

export interface EntityMentionsContextValue {
  /**
   * Resources associated with the selected entity, exactly as
   * `getEntityMentionedIn` returned them — both `isLinked` and `isMentioned`
   * rows, unfiltered. Empty when the selected resource is not an entity.
   */
  rows: EntityMentionedIn[];
  /** True while the fetch above is in flight. */
  isLoading: boolean;
  /**
   * True when the selected resource is a declared entity (has `entityKind`)
   * inside a loaded project — i.e. when the entity surfaces should render at
   * all.
   */
  isEntitySelected: boolean;
}

const EntityMentionsContext = createContext<EntityMentionsContextValue | null>(
  null,
);

/**
 * Reads the shared entity-mentions fetch. Throws when used outside
 * {@link EntityMentionsProvider}, which is deliberate — see the module doc
 * comment.
 */
export function useEntityMentions(): EntityMentionsContextValue {
  const value = useContext(EntityMentionsContext);
  if (!value) {
    throw new Error(
      "useEntityMentions must be used within an EntityMentionsProvider",
    );
  }
  return value;
}

export default function EntityMentionsProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const [rows, setRows] = useState<EntityMentionedIn[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const resourceId = resource?.id;
  const entityKind = resource?.entityKind;
  const isEntitySelected = Boolean(projectId && resourceId && entityKind);

  useEffect(() => {
    if (!projectId || !resourceId || !entityKind) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    void getEntityMentionedIn(projectId, resourceId).then((result) => {
      if (isCancelled) return;
      setRows(result);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [projectId, resourceId, entityKind]);

  const value = useMemo<EntityMentionsContextValue>(
    () => ({ rows, isLoading, isEntitySelected }),
    [rows, isLoading, isEntitySelected],
  );

  return (
    <EntityMentionsContext.Provider value={value}>
      {children}
    </EntityMentionsContext.Provider>
  );
}
