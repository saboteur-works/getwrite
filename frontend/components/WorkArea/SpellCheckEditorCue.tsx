"use client";

import React from "react";
import useAppSelector from "../../src/store/hooks";
import { selectSpellCheckEditorCue } from "../../src/store/spellCheckEditorCue";
import { useSpellcheckEnabled } from "../../src/hooks/useSpellcheckEnabled";
import { requestOpenAppSettings } from "../../src/lib/app-settings-open";

/**
 * Editor-footer cue about the spell checker (Feature 96, spec FR-24).
 * Paused for a failure: "Spell check paused" (the full reason is in the
 * status text for assistive technology and in the tooltip) and a "Spell check
 * settings" button that asks the shell to open App Settings. User words not
 * applied: a quieter "Your words aren't applied". Nothing when the checker is
 * active or loading, or the spelling switch is off. The `role="status"`
 * region is always rendered so a change is announced politely; no red.
 */
export default function SpellCheckEditorCue(): React.ReactElement {
  const [isSwitchOn] = useSpellcheckEnabled();
  const cue = useAppSelector(selectSpellCheckEditorCue);
  const shown = isSwitchOn ? cue : null;

  return (
    <div
      role="status"
      className="min-w-0 flex flex-wrap items-center gap-x-2 text-gw-small text-gw-secondary"
    >
      {shown?.kind === "paused" ? (
        <>
          <span title={shown.message}>Spell check paused</span>
          <span className="sr-only">{shown.message}</span>
          <button
            type="button"
            className="text-xs font-medium text-gw-primary underline hover:text-gw-secondary"
            onClick={requestOpenAppSettings}
          >
            Spell check settings
          </button>
        </>
      ) : null}
      {shown?.kind === "notApplied" ? (
        <span>Your words aren&apos;t applied</span>
      ) : null}
    </div>
  );
}
