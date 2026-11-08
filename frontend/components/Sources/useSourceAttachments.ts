"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  listAttachments,
  type AttachmentEntryView,
} from "../../src/lib/api/source-attachments";
import { useTrashRefresh } from "../Layout/TrashRefreshContext";

type SourceAttachmentsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: AttachmentEntryView[] };

export interface SourceAttachmentsResult {
  /** The open project's directory id, or null when no project is open. */
  projectId: string | null;
  state: SourceAttachmentsState;
  /** Reads the list again after a failed read. */
  retry: () => void;
  /**
   * Publishes a list a resolved write returned, to every panel showing this
   * Source. Called only from a resolved call, never optimistically.
   */
  publish: (entries: AttachmentEntryView[]) => void;
}

const LOADING: SourceAttachmentsState = { status: "loading" };

interface Channel {
  projectId: string;
  sourceId: string;
  state: SourceAttachmentsState;
  listeners: Set<() => void>;
}

/** Called with the new count whenever a Source's list becomes known. */
export type AttachmentCountListener = (
  projectId: string,
  sourceId: string,
  count: number,
) => void;

const countListeners = new Set<AttachmentCountListener>();

/**
 * Subscribes to the attachment count of every Source a panel reads or
 * changes, so a list that shows counts (the Sources view rows) follows an add
 * or a remove made in a panel without reading again (Feature 103, FR-17).
 * Returns the unsubscribe function.
 */
export function subscribeAttachmentCounts(
  listener: AttachmentCountListener,
): () => void {
  countListeners.add(listener);
  return () => {
    countListeners.delete(listener);
  };
}

/**
 * One channel per project and Source, held only while a panel is subscribed.
 * It carries no data across an unmount: every mount reads the list again, and
 * the channel exists so that panels mounted at the same time (the Sources view
 * and the sidebar) show a change made in either without reselecting.
 */
const channels = new Map<string, Channel>();

function channelKey(projectId: string, sourceId: string): string {
  return `${projectId}\u0000${sourceId}`;
}

function ensureChannel(
  key: string,
  projectId: string,
  sourceId: string,
): Channel {
  let channel = channels.get(key);
  if (!channel) {
    channel = { projectId, sourceId, state: LOADING, listeners: new Set() };
    channels.set(key, channel);
  }
  return channel;
}

function setChannelState(
  key: string,
  projectId: string,
  sourceId: string,
  state: SourceAttachmentsState,
): void {
  const channel = ensureChannel(key, projectId, sourceId);
  channel.state = state;
  channel.listeners.forEach((listener) => listener());
  if (state.status === "ready") {
    countListeners.forEach((listener) =>
      listener(projectId, sourceId, state.entries.length),
    );
  }
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The attachments could not be read.";
}

/**
 * The one reader of a Source's attachment list (Feature 103, FR-17), used by
 * the panel in the Sources view and in the sidebar. It reads through the
 * existing `listAttachments` client, re-reads after a Trash restore, and
 * keeps panels showing the same Source in step. A failed read is an error
 * state, never an empty list (`docs/standards/failure-visibility.md`).
 */
export function useSourceAttachments(
  sourceId: string,
): SourceAttachmentsResult {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const { refreshToken } = useTrashRefresh();
  const key = projectId === null ? null : channelKey(projectId, sourceId);
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      if (key === null || projectId === null) return () => undefined;
      const channel = ensureChannel(key, projectId, sourceId);
      channel.listeners.add(listener);
      return () => {
        channel.listeners.delete(listener);
        if (channel.listeners.size === 0 && channels.get(key) === channel) {
          channels.delete(key);
        }
      };
    },
    [key, projectId, sourceId],
  );
  const getSnapshot = useCallback(
    (): SourceAttachmentsState =>
      key === null ? LOADING : (channels.get(key)?.state ?? LOADING),
    [key],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, () => LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (projectId === null || key === null) return;
    let isCurrent = true;
    if (ensureChannel(key, projectId, sourceId).state.status !== "ready") {
      setChannelState(key, projectId, sourceId, LOADING);
    }
    listAttachments(projectId, sourceId).then(
      (entries) => {
        if (isCurrent)
          setChannelState(key, projectId, sourceId, {
            status: "ready",
            entries,
          });
      },
      (error: unknown) => {
        if (isCurrent) {
          setChannelState(key, projectId, sourceId, {
            status: "error",
            message: errorText(error),
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, sourceId, key, attempt, refreshToken]);

  const retry = useCallback(() => setAttempt((n) => n + 1), [setAttempt]);
  const publish = useCallback(
    (entries: AttachmentEntryView[]) => {
      if (key !== null && projectId !== null) {
        setChannelState(key, projectId, sourceId, { status: "ready", entries });
      }
    },
    [key, projectId, sourceId],
  );
  return { projectId, state, retry, publish };
}
