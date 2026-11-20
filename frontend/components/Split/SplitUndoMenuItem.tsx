"use client";

import React from "react";
import { ReactReduxContext } from "react-redux";
import { Undo2 } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "../common/UI/ContextMenu";
import { useSplitUndoAvailability, requestSplitUndo } from "./splitUndoRequest";
import { resolveSplitOffName } from "./splitUndoName";
import {
  describeUndoSplitAction,
  UNDO_SPLIT_LABEL,
} from "../../src/lib/models/split-messages";
import { describeUndoMergeAction } from "../../src/lib/models/merge-messages";
import {
  UNDO_MERGE_LABEL,
  UNDO_MERGE_READ_FAILED_MESSAGE,
} from "../../src/lib/models/merge-undo-messages";
import type { RootState } from "../../src/store/store";

interface UndoItemProps {
  label: string;
  description: string;
  isDisabled: boolean;
}

/** One Undo menu item: an enabled one sends Undo, a disabled one states why. */
function UndoItem({
  label,
  description,
  isDisabled,
}: UndoItemProps): JSX.Element {
  const descriptionId = React.useId();
  return (
    <ContextMenuItem
      className="resource-context-menu-item"
      aria-label={label}
      aria-describedby={descriptionId}
      disabled={isDisabled}
      onSelect={
        isDisabled
          ? undefined
          : () => {
              requestSplitUndo();
            }
      }
    >
      <Undo2 size={14} className="resource-context-menu-item-icon" />
      <span>
        {label}
        <span
          id={descriptionId}
          className="block text-gw-label text-fg-tertiary font-normal"
        >
          {description}
        </span>
      </span>
    </ContextMenuItem>
  );
}

/**
 * The editor menu's Undo item (Feature 120 Task 32, FR-18; "Undo merge" added
 * by Feature 121 Task 41, FR-22). Rendered inside the menu's content, after
 * the menu has asked the host to read the latest-operation record. Nothing is
 * rendered for `unknown` or `none`, nor on the native runtime. For a split it
 * is the enabled "Undo split" item naming the split-off document; for a merge
 * it is the enabled "Undo merge" item naming the target and the number of
 * documents merged into it. For a failed read there is a disabled item per
 * operation carrying its own message, so a failed read never looks like no
 * split and no merge. The accessible name stays the label.
 */
export default function SplitUndoMenuItem(): JSX.Element | null {
  const availability = useSplitUndoAvailability();
  const reduxContext = React.useContext(ReactReduxContext);
  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") return null;
  const resources =
    (reduxContext?.store.getState() as Partial<RootState> | undefined)
      ?.resources?.resources ?? [];
  if (availability.kind === "split") {
    return (
      <>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <UndoItem
          label={UNDO_SPLIT_LABEL}
          isDisabled={false}
          description={describeUndoSplitAction(
            resolveSplitOffName(resources, availability.splitOffDocumentId),
          )}
        />
      </>
    );
  }
  if (availability.kind === "merge") {
    return (
      <>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <UndoItem
          label={UNDO_MERGE_LABEL}
          isDisabled={false}
          description={describeUndoMergeAction(
            resolveSplitOffName(resources, availability.targetDocumentId),
            availability.absorbedCount,
          )}
        />
      </>
    );
  }
  if (availability.kind === "read-failed") {
    return (
      <>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <UndoItem
          label={UNDO_SPLIT_LABEL}
          isDisabled
          description={availability.message}
        />
        <UndoItem
          label={UNDO_MERGE_LABEL}
          isDisabled
          description={
            availability.mergeMessage ?? UNDO_MERGE_READ_FAILED_MESSAGE
          }
        />
      </>
    );
  }
  return null;
}
