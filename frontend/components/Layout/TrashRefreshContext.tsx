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
 * @module TrashRefreshContext
 *
 * A narrow, write-signalling sibling to
 * `components/Sidebar/EntityRelationshipsRefreshContext.tsx`. Like that
 * context, this one owns no data of its own — it only shares a
 * monotonically-incrementing token so that a mutation happening in
 * `TrashView.tsx` (a successful restore) can tell `app/(app)/page.tsx`'s
 * `Home` component that its local `selectedProject`/`projects` `useState` —
 * hydrated once via `handleOpen` and never otherwise kept in sync with
 * `TrashView`'s own Redux-only refetch — is stale and should be re-read.
 *
 * This fixes a measured defect: `TrashView`'s post-restore refetch
 * (`frontend/components/WorkArea/Views/TrashView/TrashView.tsx`) dispatches
 * only to Redux (`loadResources`/`setFolders`). `page.tsx`'s folder-vs-
 * resource delete routing (`selectedProject.folders.find(...)`) reads its
 * own local state instead, so a folder restored from Trash and then deleted
 * again — with no reload in between — fell through to the resource-delete
 * path and silently no-op'd on disk.
 *
 * `Home` (`app/(app)/page.tsx`) is the component that both provides no
 * ancestor of its own and needs to *read* the token, so this provider is
 * rendered above it — in the root layout (`app/layout.tsx`) — rather than
 * by `Home` itself; a component cannot consume a context it renders as its
 * own child. `Home` and `TrashView` (nested under `AppShell`, itself
 * rendered by `Home`) are both descendants of that single provider.
 *
 * Provider is deliberately not the fetcher: re-fetching stays with `Home`'s
 * existing `handleOpen` path (reused, not duplicated) and `TrashView`'s
 * existing Redux dispatches (kept, not replaced). Bumping `refreshToken`
 * here is only ever a trigger, never a data source.
 */

export interface TrashRefreshContextValue {
  /** Increments on every call to {@link notifyTrashRestored}. */
  refreshToken: number;
  /**
   * Signals that a Trash restore succeeded and any local project state
   * mirroring the on-disk resource/folder tree should be re-read.
   */
  notifyTrashRestored: () => void;
}

const TrashRefreshContext = createContext<TrashRefreshContextValue | null>(
  null,
);

/**
 * Reads the shared Trash-restore refresh signal. Throws when used outside
 * {@link TrashRefreshProvider}, mirroring
 * `EntityRelationshipsRefreshContext.tsx`'s
 * `useEntityRelationshipsRefresh` error-on-missing-provider convention.
 */
export function useTrashRefresh(): TrashRefreshContextValue {
  const value = useContext(TrashRefreshContext);
  if (!value) {
    throw new Error(
      "useTrashRefresh must be used within a TrashRefreshProvider",
    );
  }
  return value;
}

export default function TrashRefreshProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [refreshToken, setRefreshToken] = useState(0);

  const notifyTrashRestored = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const value = useMemo<TrashRefreshContextValue>(
    () => ({ refreshToken, notifyTrashRestored }),
    [refreshToken, notifyTrashRestored],
  );

  return (
    <TrashRefreshContext.Provider value={value}>
      {children}
    </TrashRefreshContext.Provider>
  );
}
