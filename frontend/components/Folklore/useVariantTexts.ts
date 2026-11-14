"use client";

/**
 * @module useVariantTexts
 *
 * Data hook for the comparison (Feature 110, FR-13, FR-15, FR-16). Reads the
 * canonical-revision text of each variant it is given through the typed
 * client (`readVariantText`) and, for a variant whose body is empty, its
 * attachment list through the Sources client (`listAttachments`) to learn
 * whether it has audio. It never mounts `AttachmentMedia` (mounting starts the
 * byte read) and writes nothing.
 *
 * - Reads are settled per variant: a failed variant is returned with its
 *   reason and listed in `notRead`; the others still return.
 * - A locked project becomes the `locked` state carrying the locked-access
 *   error it met (a hook cannot rethrow into its caller's promise; the caller
 *   owns the unlock prompt). It is never "no text" and never an empty column.
 * - A failed attachment list read is `audio: { kind: "failed" }`, never
 *   `none` ("no audio"). Only audio attachments count; images are ignored.
 * - `enabled: false` (the phone case) starts no read.
 * - Only the ids passed in are read; the hook never widens the set.
 */
import { useEffect, useState } from "react";
import { readVariantText } from "../../src/lib/api/folklore";
import {
  listAttachments,
  type AttachmentEntryView,
} from "../../src/lib/api/source-attachments";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";
import {
  isLockedAccessError,
  ProjectLockedError,
  type MissingProjectKeyError,
} from "../../src/lib/models/locked-access";
import type { ColumnAudioState } from "./ComparisonColumn";

/** The reads the hook makes; injectable for tests. */
export interface VariantTextsDeps {
  readVariantText: (
    projectId: string,
    resourceId: string,
  ) => Promise<VariantTextResult>;
  listAttachments: (
    projectId: string,
    resourceId: string,
  ) => Promise<AttachmentEntryView[]>;
}

const LIVE_DEPS: VariantTextsDeps = { readVariantText, listAttachments };

/** One chosen variant's result, in the shape `ComparisonColumn` takes. */
export interface VariantTextEntry {
  id: string;
  content: VariantTextResult;
  audio: ColumnAudioState;
}

/** A chosen variant whose text or attachment list could not be read. */
export interface VariantNotRead {
  id: string;
  reason: string;
}

type LockedError = ProjectLockedError | MissingProjectKeyError;

export type VariantTextsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "locked"; error: LockedError }
  | {
      status: "ready";
      /** One entry per id passed in, in the order passed. */
      variants: VariantTextEntry[];
      /** Variants whose text or attachment list read failed. */
      notRead: VariantNotRead[];
    };

export interface UseVariantTextsOptions {
  /** The open project's directory id, or null when none is open. */
  projectId: string | null;
  /** The chosen variants' resource ids; only these are read. */
  variantIds: readonly string[];
  /** False starts no read (phone width). */
  enabled: boolean;
  deps?: VariantTextsDeps;
}

type Settled =
  | { kind: "locked"; key: string; error: LockedError }
  | { kind: "ready"; key: string; variants: VariantTextEntry[] };

const ID_SEPARATOR = "\u0000";
const NO_PROJECT_REASON = "No project is open, so the variant cannot be read.";
const READ_REASON = "The variant could not be read.";
const AUDIO_READ_REASON = "The attachment list could not be read.";

function reasonOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

async function readAudio(
  deps: VariantTextsDeps,
  projectId: string,
  id: string,
): Promise<ColumnAudioState> {
  try {
    const entries = await deps.listAttachments(projectId, id);
    const audio = entries
      .filter((entry) => entry.mime.toLowerCase().startsWith("audio/"))
      .map((entry) => ({ id: entry.id, name: entry.originalName }));
    return audio.length === 0
      ? { kind: "none" }
      : { kind: "available", attachments: audio };
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    return { kind: "failed", reason: reasonOf(error, AUDIO_READ_REASON) };
  }
}

async function readOne(
  deps: VariantTextsDeps,
  projectId: string,
  id: string,
): Promise<VariantTextEntry> {
  const content = await deps.readVariantText(projectId, id);
  if (content.kind === "locked") throw new ProjectLockedError(projectId);
  const audio: ColumnAudioState =
    content.kind === "none"
      ? await readAudio(deps, projectId, id)
      : { kind: "none" };
  return { id, content, audio };
}

function unreadableEntry(id: string, reason: string): VariantTextEntry {
  return {
    id,
    content: { kind: "unreadable", reason },
    audio: { kind: "none" },
  };
}

function notReadOf(variants: VariantTextEntry[]): VariantNotRead[] {
  const out: VariantNotRead[] = [];
  for (const v of variants) {
    if (v.content.kind === "unreadable") {
      out.push({ id: v.id, reason: v.content.reason });
    } else if (v.audio.kind === "failed") {
      out.push({ id: v.id, reason: v.audio.reason });
    }
  }
  return out;
}

/**
 * The chosen variants' texts and audio-attachment state for the comparison.
 *
 * @param options - Project, chosen ids, the `enabled` switch and test deps.
 */
export function useVariantTexts(
  options: UseVariantTextsOptions,
): VariantTextsState {
  const { projectId, variantIds } = options;
  const isEnabled = options.enabled;
  const deps = options.deps ?? LIVE_DEPS;
  const idsKey = variantIds.join(ID_SEPARATOR);
  const key = `${projectId ?? ""}|${idsKey}`;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!isEnabled || projectId === null || idsKey === "") return;
    let isCurrent = true;
    const ids = idsKey.split(ID_SEPARATOR);
    Promise.allSettled(ids.map((id) => readOne(deps, projectId, id))).then(
      (results) => {
        if (!isCurrent) return;
        for (const r of results) {
          if (r.status === "rejected" && isLockedAccessError(r.reason)) {
            setSettled({ kind: "locked", key, error: r.reason });
            return;
          }
        }
        setSettled({
          kind: "ready",
          key,
          variants: results.map((r, i) =>
            r.status === "fulfilled"
              ? r.value
              : unreadableEntry(ids[i], reasonOf(r.reason, READ_REASON)),
          ),
        });
      },
    );
    return () => {
      isCurrent = false;
    };
    // `deps` is a stable injection point; `key` carries project and ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isEnabled]);

  if (!isEnabled) return { status: "idle" };
  if (projectId === null) {
    return {
      status: "ready",
      variants: variantIds.map((id) => unreadableEntry(id, NO_PROJECT_REASON)),
      notRead: variantIds.map((id) => ({ id, reason: NO_PROJECT_REASON })),
    };
  }
  if (idsKey === "") return { status: "ready", variants: [], notRead: [] };
  if (settled === null || settled.key !== key) return { status: "loading" };
  if (settled.kind === "locked") {
    return { status: "locked", error: settled.error };
  }
  return {
    status: "ready",
    variants: settled.variants,
    notRead: notReadOf(settled.variants),
  };
}
