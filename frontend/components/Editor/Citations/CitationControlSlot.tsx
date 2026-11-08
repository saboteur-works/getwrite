"use client";

/**
 * @module CitationControlSlot
 *
 * The editor's host for the citation-control slot (Feature 103, FR-3, FR-24):
 * renders the control of every registered module that has one, and only while
 * that module is on (`useModuleEnabled`). With the Sources module off nothing
 * is rendered. The editor schema is not involved: `AnnotationMark` stays
 * registered unconditionally (FR-11).
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import { useModuleEnabled } from "../../Modules/useModuleEnabled";
import {
  uiModuleRegistry,
  type UiCitationControlSlot,
} from "../../Modules/uiRegistry";

export interface CitationControlSlotProps {
  editor: Editor;
  /** The text resource being edited. */
  resourceId: string;
  /** Called after a citation was stored (the annotations list re-reads). */
  onStored?: () => void;
}

function Gate({
  moduleId,
  slot,
  editor,
  resourceId,
  onStored,
}: CitationControlSlotProps & {
  moduleId: string;
  slot: UiCitationControlSlot;
}): JSX.Element | null {
  const isEnabled = useModuleEnabled(moduleId);
  if (!isEnabled) return null;
  return <>{slot.render({ editor, resourceId, onStored })}</>;
}

export default function CitationControlSlot(
  props: CitationControlSlotProps,
): JSX.Element {
  return (
    <>
      {uiModuleRegistry.modules.map((entry) =>
        entry.citationControl ? (
          <Gate
            key={entry.id}
            moduleId={entry.id}
            slot={entry.citationControl}
            {...props}
          />
        ) : null,
      )}
    </>
  );
}
