"use client";

/**
 * @module MarkExcerptControl
 *
 * "Mark as excerpt" for the open Source (Feature 103, FR-21, FR-6 (d)). Placed
 * by the Sources module through the citation-control slot, so
 * `CitationControlSlot` shows it only while the module is on. It renders
 * nothing unless the open resource is a Source. Activating it stores the
 * editor selection as an annotation whose `target` is the Source itself, the
 * record the Sources view lists as an excerpt.
 *
 * The result and a failure are text in a status region, never colour alone.
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import useAppSelector from "../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../src/store/projectsSlice";
import { selectResources } from "../../../src/store/resourcesSlice";
import Button from "../../common/UI/Button/Button";
import LocatorField, {
  EMPTY_LOCATOR_DRAFT,
  locatorFromDraft,
  type LocatorDraft,
} from "../../Sources/LocatorField";
import { markTextExcerpt } from "../../Sources/mark-text-excerpt";

export interface MarkExcerptControlProps {
  editor: Editor;
  /** The resource being edited; the control shows only when it is a Source. */
  resourceId: string;
  /** Called after an excerpt was stored, so the host can re-read its list. */
  onStored?: () => void;
}

export default function MarkExcerptControl({
  editor,
  resourceId,
  onStored,
}: MarkExcerptControlProps): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const source = useAppSelector((s) =>
    selectResources(s.resources).find(
      (r) => r.id === resourceId && r.type === "source",
    ),
  );
  const [draft, setDraft] = React.useState<LocatorDraft>(EMPTY_LOCATOR_DRAFT);
  const [status, setStatus] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const ids = React.useId();
  if (!source) return null;

  const mark = async (): Promise<void> => {
    const locator = locatorFromDraft(draft);
    if (!locator.ok) {
      setStatus(locator.message);
      return;
    }
    if (projectId === null) {
      setStatus("No project is open, so the excerpt can't be saved.");
      return;
    }
    setIsBusy(true);
    setStatus("Saving the excerpt.");
    try {
      const outcome = await markTextExcerpt({
        editor,
        projectId,
        source: { id: source.id, name: source.name },
        ...(locator.locator ? { locator: locator.locator } : {}),
      });
      setStatus(outcome.message);
      if (outcome.isOk) setDraft(EMPTY_LOCATOR_DRAFT);
      if (outcome.annotation) onStored?.();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Mark an excerpt of this Source"
      className="flex flex-wrap items-end gap-3 border-t border-gw-border p-3"
    >
      <LocatorField
        idPrefix={`${ids}-excerpt`}
        legend="Excerpt locator"
        draft={draft}
        onChange={setDraft}
        disabled={isBusy}
      />
      <Button
        type="button"
        variant="secondary"
        aria-disabled={isBusy}
        onClick={() => {
          if (!isBusy) void mark();
        }}
      >
        Mark as excerpt
      </Button>
      <p role="status" className="basis-full text-gw-small text-gw-primary">
        {status}
      </p>
    </div>
  );
}
