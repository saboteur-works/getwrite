"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * @module EntityRelationshipsRefreshContext
 *
 * A narrow, write-signalling sibling to `EntityMentionsContext.tsx`. Where
 * that context owns a fetch and shares its *result*, this context owns no
 * data at all — it only shares a monotonically-incrementing token so that a
 * mutation happening elsewhere in the sidebar (e.g. an entity removal that
 * should invalidate a stale relationship list, FR-16) can tell
 * `EntityRelationshipsSection.tsx` to re-run its existing
 * `listEntityRelationships` fetch without a remount or a `projectId` change.
 *
 * This provider is deliberately not the fetcher: `EntityRelationshipsSection`
 * keeps its own independent fetch/state lifecycle (see that component's own
 * doc comment on why it does not join `EntityMentionsContext`). Bumping
 * `refreshToken` here is only ever a trigger, never a data source.
 *
 * No caller wires `notifyRelationshipsChanged` yet — that lands in a later
 * task. This module only establishes the seam.
 */

export interface EntityRelationshipsRefreshContextValue {
  /** Increments on every call to {@link notifyRelationshipsChanged}. */
  refreshToken: number;
  /** Signals that a consumer should re-fetch relationship edges. */
  notifyRelationshipsChanged: () => void;
}

const EntityRelationshipsRefreshContext =
  createContext<EntityRelationshipsRefreshContextValue | null>(null);

/**
 * Reads the shared relationships-refresh signal. Throws when used outside
 * {@link EntityRelationshipsRefreshProvider}, mirroring
 * `EntityMentionsContext.tsx`'s `useEntityMentions` error-on-missing-provider
 * convention.
 */
export function useEntityRelationshipsRefresh(): EntityRelationshipsRefreshContextValue {
  const value = useContext(EntityRelationshipsRefreshContext);
  if (!value) {
    throw new Error(
      "useEntityRelationshipsRefresh must be used within an EntityRelationshipsRefreshProvider",
    );
  }
  return value;
}

export default function EntityRelationshipsRefreshProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [refreshToken, setRefreshToken] = useState(0);

  const notifyRelationshipsChanged = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const value = useMemo<EntityRelationshipsRefreshContextValue>(
    () => ({ refreshToken, notifyRelationshipsChanged }),
    [refreshToken, notifyRelationshipsChanged],
  );

  return (
    <EntityRelationshipsRefreshContext.Provider value={value}>
      {children}
    </EntityRelationshipsRefreshContext.Provider>
  );
}
