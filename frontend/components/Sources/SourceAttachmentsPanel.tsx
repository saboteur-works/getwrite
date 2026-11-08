"use client";

import React from "react";
import {
  addAttachment,
  removeAttachment,
  reorderAttachments,
  replaceAttachment,
  type AttachmentEntryView,
} from "../../src/lib/api/source-attachments";
import type { SourceResource } from "../../src/lib/models/types";
import Button from "../common/UI/Button/Button";
import AttachmentMedia from "./AttachmentMedia";
import { useSourceAttachments } from "./useSourceAttachments";

type Notice = { kind: "error" | "info"; text: string } | null;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The ids in the order they would have after moving `index` by `delta`. */
function movedIds(
  entries: readonly AttachmentEntryView[],
  index: number,
  delta: -1 | 1,
): string[] {
  const ids = entries.map((entry) => entry.id);
  const target = index + delta;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/** Only an image or audio entry is offered a preview. */
function isPreviewable(entry: AttachmentEntryView): boolean {
  return entry.mime.startsWith("image/") || entry.mime.startsWith("audio/");
}

interface RowProps {
  projectId: string;
  resourceId: string;
  entry: AttachmentEntryView;
  index: number;
  count: number;
  isBusy: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onReplace: (entry: AttachmentEntryView, file: File) => void;
  onRemove: (entry: AttachmentEntryView) => void;
}

function AttachmentRow({
  projectId,
  resourceId,
  entry,
  index,
  count,
  isBusy,
  onMove,
  onReplace,
  onRemove,
}: RowProps): JSX.Element {
  const name = entry.originalName;
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const isFirst = index === 0;
  const isLast = index === count - 1;
  // aria-disabled, not disabled: a disabled button drops keyboard focus, and
  // focus must stay on the control after a move.
  return (
    <li className="mb-3 border-b border-gw-border pb-3">
      <p className="text-sm text-gw-primary break-words">
        <span data-attachment-name>{name}</span>
        <span className="ml-2 text-gw-label text-gw-secondary">
          {formatSize(entry.size)}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="xs"
          aria-label={`Move ${name} up`}
          aria-disabled={isFirst || isBusy}
          onClick={() => {
            if (!isFirst && !isBusy) onMove(index, -1);
          }}
        >
          Up
        </Button>
        <Button
          variant="secondary"
          size="xs"
          aria-label={`Move ${name} down`}
          aria-disabled={isLast || isBusy}
          onClick={() => {
            if (!isLast && !isBusy) onMove(index, 1);
          }}
        >
          Down
        </Button>
        <Button
          variant="secondary"
          size="xs"
          aria-label={`Replace ${name}`}
          aria-disabled={isBusy}
          onClick={() => {
            if (!isBusy) fileInput.current?.click();
          }}
        >
          Replace
        </Button>
        <input
          ref={fileInput}
          type="file"
          hidden
          tabIndex={-1}
          aria-label={`Replace file for ${name}`}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen && !isBusy) onReplace(entry, chosen);
          }}
        />
        <Button
          variant="destructive"
          size="xs"
          aria-label={`Remove ${name}`}
          aria-disabled={isBusy}
          onClick={() => {
            if (!isBusy) onRemove(entry);
          }}
        >
          Remove
        </Button>
        {isPreviewable(entry) && (
          <Button
            variant="secondary"
            size="xs"
            aria-label={`${isPreviewing ? "Hide" : "Preview"} ${name}`}
            aria-expanded={isPreviewing}
            onClick={() => setIsPreviewing((open) => !open)}
          >
            {isPreviewing ? "Hide" : "Preview"}
          </Button>
        )}
      </div>
      {isPreviewing && (
        <AttachmentMedia
          projectId={projectId}
          resourceId={resourceId}
          attachmentId={entry.id}
          name={name}
        />
      )}
    </li>
  );
}

/**
 * A Source's attachments (Feature 102, FR-24, FR-30; Feature 103, FR-17):
 * add, replace, remove and reorder, as a list of names and sizes. Mounted by
 * the metadata sidebar and, through the registry's attachments slot, by the
 * Sources view; both read the one list through `useSourceAttachments`, so a
 * change in either shows in the other. Preview and playback are
 * `AttachmentMedia`.
 *
 * An image or audio row has a Preview button; the bytes are read only when it
 * is pressed (`AttachmentMedia`), so opening a Source reads none of them.
 * The byte read is read-only and not paired-device limited, so no limited
 * control is added.
 *
 * Every change goes through the Task 28 client and the list is updated only
 * from a resolved call, so a refusal (unsupported kind, the 501st attachment,
 * a missing Source or attachment) shows the server's message after "Error:"
 * and leaves the list as it was. A failed read shows an error with Retry,
 * never an empty list. Reorder is the Up and Down buttons, so it needs no
 * pointer. Remove sends the file to Trash; restoring it, and a refused
 * restore, are the Trash tab's (`TrashView`); a successful restore re-reads
 * the list through `useTrashRefresh`. Mount with `key={resource.id}`.
 */
export default function SourceAttachmentsPanel({
  resource,
}: {
  resource: SourceResource;
}): JSX.Element {
  const {
    projectId,
    state: load,
    retry,
    publish,
  } = useSourceAttachments(resource.id);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const addInput = React.useRef<HTMLInputElement | null>(null);

  if (!projectId) {
    return (
      <p role="alert" className="text-gw-label text-gw-primary">
        {"Error: no project is open, so the attachments can't be shown."}
      </p>
    );
  }
  if (load.status === "loading") {
    return (
      <p role="status" className="text-gw-label text-gw-secondary">
        Loading attachments…
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div>
        <p role="alert" className="text-gw-label text-gw-primary mb-2">
          {`Error: couldn't load the attachments. ${load.message}`}
        </p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }

  const { entries } = load;

  const run = async (
    work: () => Promise<{ entries: AttachmentEntryView[]; info: string }>,
    failure: string,
  ): Promise<void> => {
    setIsBusy(true);
    setNotice(null);
    try {
      const result = await work();
      publish(result.entries);
      setNotice({ kind: "info", text: result.info });
    } catch (error: unknown) {
      setNotice({ kind: "error", text: errorText(error, failure) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdd = (file: File): void => {
    void run(async () => {
      const added = await addAttachment(projectId, resource.id, file);
      return {
        entries: [...entries, added],
        info: `Added ${added.originalName}.`,
      };
    }, "The attachment could not be added.");
  };

  const handleReplace = (target: AttachmentEntryView, file: File): void => {
    void run(async () => {
      const { entry } = await replaceAttachment(
        projectId,
        resource.id,
        target.id,
        file,
      );
      return {
        entries: entries.map((e) => (e.id === target.id ? entry : e)),
        info: `Replaced ${target.originalName} with ${entry.originalName}. The old file is in Trash.`,
      };
    }, "The attachment could not be replaced.");
  };

  const handleRemove = (target: AttachmentEntryView): void => {
    void run(async () => {
      await removeAttachment(projectId, resource.id, target.id);
      return {
        entries: entries.filter((e) => e.id !== target.id),
        info: `Removed ${target.originalName}. Restore it from the Trash tab.`,
      };
    }, "The attachment could not be removed.");
  };

  const handleMove = (index: number, delta: -1 | 1): void => {
    const moved = entries[index];
    void run(async () => {
      const ordered = await reorderAttachments(
        projectId,
        resource.id,
        movedIds(entries, index, delta),
      );
      const position = ordered.findIndex((e) => e.id === moved.id) + 1;
      return {
        entries: ordered,
        info: `Moved ${moved.originalName} to position ${position} of ${ordered.length}.`,
      };
    }, "The attachments could not be reordered.");
  };

  return (
    <div>
      <div className="mb-3">
        <Button
          variant="secondary"
          size="sm"
          aria-disabled={isBusy}
          onClick={() => {
            if (!isBusy) addInput.current?.click();
          }}
        >
          Add attachment
        </Button>
        <input
          ref={addInput}
          type="file"
          hidden
          tabIndex={-1}
          aria-label="Add attachment file"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen && !isBusy) handleAdd(chosen);
          }}
        />
      </div>
      {notice?.kind === "error" && (
        <p role="alert" className="mb-3 text-gw-label text-gw-primary">
          {`Error: ${notice.text}`}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="mb-3 text-gw-label text-gw-secondary">No attachments.</p>
      ) : (
        <ul aria-label="Attachments" aria-busy={isBusy}>
          {entries.map((entry, index) => (
            <AttachmentRow
              key={entry.id}
              projectId={projectId}
              resourceId={resource.id}
              entry={entry}
              index={index}
              count={entries.length}
              isBusy={isBusy}
              onMove={handleMove}
              onReplace={handleReplace}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
      <p role="status" className="text-gw-label text-gw-secondary">
        {notice?.kind === "info" ? notice.text : ""}
      </p>
    </div>
  );
}
