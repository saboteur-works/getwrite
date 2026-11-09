"use client";

import { useCallback, useEffect, useState } from "react";
import { listProjects } from "../lib/api/projects";
import { getProjectDirectoryId } from "../store/projectsSlice";
import {
  chooseDefaultProjectId,
  readLastCapturedProjectId,
  readLastOpenedProjectId,
} from "../lib/capture-preferences";

/** A project the Capture box offers. A locked project carries no name. */
export type CaptureProjectOption =
  | { kind: "named"; id: string; label: string }
  | {
      kind: "locked";
      id: string;
      label: "Locked project";
      encryptedAt: string;
    };

/** Read state of the project choice. `empty` means the read succeeded and found nothing usable. */
type CaptureProjectChoiceStatus = "loading" | "ready" | "empty" | "failed";

/** What {@link useCaptureProjectChoice} returns. */
export interface CaptureProjectChoice {
  status: CaptureProjectChoiceStatus;
  options: CaptureProjectOption[];
  /** Default project id, or `null` unless `status` is `ready`. */
  defaultProjectId: string | null;
  /** Readable message, set only when `status` is `failed`. */
  errorMessage: string | null;
  /** Reads the list again. */
  retry: () => void;
}

/** Shown when the project list cannot be read. */
const CAPTURE_PROJECTS_FAILED_MESSAGE =
  "Could not load your projects. Check your connection and try again.";

type ListEntry = Awaited<ReturnType<typeof listProjects>>[number];

/**
 * The id every route expects: the project's on-disk directory basename.
 * A locked or unusable entry's `project.id` already is that name; a listed
 * project's `project.id` is the manifest id, which can differ, so it is taken
 * from `rootPath` (as `StartPage` does). Without a `rootPath` there is nothing
 * better to use, and `project.id` is the fallback.
 */
function directoryIdOf(entry: ListEntry): string {
  const rootPath = (entry.project as { rootPath?: string }).rootPath;
  const fromRoot = rootPath ? getProjectDirectoryId(rootPath) : "";
  return fromRoot || entry.project.id;
}

function toOption(entry: ListEntry): CaptureProjectOption | null {
  if ("isUnusable" in entry && entry.isUnusable) return null;
  if (entry.isLocked === true) {
    return {
      kind: "locked",
      id: directoryIdOf(entry),
      label: "Locked project",
      encryptedAt: entry.project.createdAt,
    };
  }
  const name = (entry.project as { name?: string }).name;
  return { kind: "named", id: directoryIdOf(entry), label: name ?? "Untitled" };
}

/**
 * Reads the project list each time the Capture box opens (tenant-scoped, via
 * `listProjects`; the store's list is never used) and picks the default:
 * the open project, else last-captured, else most recently opened, else the
 * first listed. Every id is the project's directory basename. A failed
 * read is `failed` with a retry, never an empty picker. Unusable projects are
 * not offered; locked ones are, without a name.
 *
 * @param isOpen - Whether the box is open; nothing is read while it is closed.
 * @param openProjectId - Directory id of the project open now, if any.
 */
export function useCaptureProjectChoice(
  isOpen: boolean,
  openProjectId: string | null = null,
): CaptureProjectChoice {
  const [status, setStatus] = useState<CaptureProjectChoiceStatus>("loading");
  const [options, setOptions] = useState<CaptureProjectOption[]>([]);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    setStatus("loading");
    listProjects()
      .then((entries) => {
        if (!isCurrent) return;
        const offered = entries
          .map(toOption)
          .filter((o): o is CaptureProjectOption => o !== null);
        setOptions(offered);
        if (offered.length === 0) {
          setDefaultProjectId(null);
          setStatus("empty");
          return;
        }
        setDefaultProjectId(
          chooseDefaultProjectId(
            offered.map((o) => o.id),
            readLastCapturedProjectId(),
            readLastOpenedProjectId(),
            openProjectId,
          ),
        );
        setStatus("ready");
      })
      .catch(() => {
        if (!isCurrent) return;
        setOptions([]);
        setDefaultProjectId(null);
        setStatus("failed");
      });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, attempt, openProjectId]);

  const retry = useCallback((): void => setAttempt((n) => n + 1), []);

  return {
    status,
    options,
    defaultProjectId,
    errorMessage: status === "failed" ? CAPTURE_PROJECTS_FAILED_MESSAGE : null,
    retry,
  };
}
