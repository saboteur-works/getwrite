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
import { describeUndoSplitAction, UNDO_SPLIT_LABEL } from "./splitUndoMessages";
import type { RootState } from "../../src/store/store";

/**
 * The editor menu's "Undo split" item (Feature 120, Task 32, FR-18). Rendered
 * inside the menu's content, after the menu has asked the host to read the
 * latest-operation record. Nothing is rendered for `unknown` or `none`, nor on
 * the native runtime. For a split it is an enabled item that names the
 * split-off document, says it goes to the Trash and that edits made since are
 * kept; for a failed read it is a disabled item carrying that message, so a
 * failed read never looks like no split. The accessible name stays "Undo split".
 */
export default function SplitUndoMenuItem(): JSX.Element | null {
  const availability = useSplitUndoAvailability();
  const reduxContext = React.useContext(ReactReduxContext);
  const descriptionId = React.useId();
  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") return null;
  if (availability.kind === "split") {
    const resources =
      (reduxContext?.store.getState() as Partial<RootState> | undefined)
        ?.resources?.resources ?? [];
    const description = describeUndoSplitAction(
      resolveSplitOffName(resources, availability.splitOffDocumentId),
    );
    return (
      <>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <ContextMenuItem
          className="resource-context-menu-item"
          aria-label={UNDO_SPLIT_LABEL}
          aria-describedby={descriptionId}
          onSelect={() => {
            requestSplitUndo();
          }}
        >
          <Undo2 size={14} className="resource-context-menu-item-icon" />
          <span>
            {UNDO_SPLIT_LABEL}
            <span
              id={descriptionId}
              className="block text-gw-label text-fg-tertiary font-normal"
            >
              {description}
            </span>
          </span>
        </ContextMenuItem>
      </>
    );
  }
  if (availability.kind === "read-failed") {
    return (
      <>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <ContextMenuItem
          className="resource-context-menu-item"
          aria-label={UNDO_SPLIT_LABEL}
          aria-describedby={descriptionId}
          disabled
        >
          <Undo2 size={14} className="resource-context-menu-item-icon" />
          <span>
            {UNDO_SPLIT_LABEL}
            <span
              id={descriptionId}
              className="block text-gw-label text-fg-tertiary font-normal"
            >
              {availability.message}
            </span>
          </span>
        </ContextMenuItem>
      </>
    );
  }
  return null;
}
