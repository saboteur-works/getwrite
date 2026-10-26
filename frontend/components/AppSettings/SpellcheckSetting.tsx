"use client";

import React from "react";
import Switch from "../common/UI/Switch";
import { useAppSelector } from "../../src/store/hooks";
import { useSpellcheckEnabled } from "../../src/hooks/useSpellcheckEnabled";
import { selectSpellCheckerState } from "../../src/store/spellingAvailabilitySlice";

/**
 * App Settings switch for spell-check (FR-36). Unlike `KeepRunningSetting` it
 * is shown on web, desktop and native alike. The switch is the app-wide value
 * from `useSpellcheckEnabled`; the editor follows it through that hook.
 *
 * While the switch is on and the checker is unavailable for a reason other
 * than still loading (FR-26), each reason is listed in a status line. The
 * line is hidden when the switch is off, since nothing is being checked.
 *
 * Needs a Redux `Provider` with the `spelling` and `spellingAvailability`
 * reducers.
 */
export default function SpellcheckSetting(): JSX.Element {
  const [isEnabled, setEnabled] = useSpellcheckEnabled();
  const checker = useAppSelector(selectSpellCheckerState);
  const switchId = React.useId();

  const reasons =
    checker.status === "paused"
      ? checker.reasons.filter((reason) => reason.kind !== "loading")
      : [];

  return (
    <section
      aria-labelledby={`${switchId}-heading`}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h3
        id={`${switchId}-heading`}
        className="text-sm font-semibold text-gw-primary"
      >
        Spell check
      </h3>
      <div className="flex items-center gap-3">
        <Switch
          id={switchId}
          checked={isEnabled}
          aria-describedby={`${switchId}-description`}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <label htmlFor={switchId} className="text-sm text-gw-primary">
          Check spelling while I write
        </label>
      </div>
      <p id={`${switchId}-description`} className="text-sm text-gw-secondary">
        Underlines misspelled words in the editor. This applies to every project
        on this device.
      </p>
      {isEnabled && reasons.length > 0 ? (
        <div role="status" className="text-sm text-gw-secondary">
          {reasons.map((reason) => (
            <p key={reason.kind}>{reason.message}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
