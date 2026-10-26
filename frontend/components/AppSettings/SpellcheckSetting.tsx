"use client";

import React from "react";
import Switch from "../common/UI/Switch";
import Button from "../common/UI/Button";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { loadUserList } from "../../src/store/userWordListSlice";
import { useSpellcheckEnabled } from "../../src/hooks/useSpellcheckEnabled";
import {
  continueWithoutUserList,
  selectSpellCheckerState,
  selectUserWordsNotApplied,
} from "../../src/store/spellingAvailabilitySlice";

/**
 * App Settings switch for spell-check (FR-36). Unlike `KeepRunningSetting` it
 * is shown on web, desktop and native alike. The switch is the app-wide value
 * from `useSpellcheckEnabled`; the editor follows it through that hook.
 *
 * While the switch is on and the checker is unavailable for a reason other
 * than still loading (FR-26), each reason is listed in a status line. The
 * line is hidden when the switch is off, since nothing is being checked.
 *
 * Feature 96 (FR-5, FR-16): when the writer's own word list could not be read,
 * the same status line gives the reason with "Retry" and "Continue without my
 * dictionary". After that override a persistent notice (`role="status"`, not
 * a toast) says the writer's own words are not applied, until a successful
 * re-read or a reload. The line lives in this dialog, so it is seen when the
 * writer opens App Settings; the failure itself also raises a toast.
 *
 * Needs a Redux `Provider` with the `spelling` and `spellingAvailability`
 * reducers; the `userWordList` reducer is optional (absent means no list).
 */
export default function SpellcheckSetting(): JSX.Element {
  const [isEnabled, setEnabled] = useSpellcheckEnabled();
  const checker = useAppSelector(selectSpellCheckerState);
  const dispatch = useAppDispatch();
  const switchId = React.useId();
  const isNotApplied = useAppSelector(selectUserWordsNotApplied);
  const listStatus = useAppSelector(
    (state: { userWordList?: { status: string } }) =>
      state.userWordList?.status,
  );
  const [isRetrying, setIsRetrying] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (listStatus !== "loading") setIsRetrying(false);
  }, [listStatus]);

  const reasons =
    checker.status === "paused"
      ? checker.reasons.filter((reason) => reason.kind !== "loading")
      : [];
  const listReason = reasons.find((r) => r.kind === "user-list-failed");
  const otherReasons = reasons.filter((r) => r !== listReason);
  const shouldShowRecovery =
    isEnabled && (listReason !== undefined || isRetrying) && !isNotApplied;

  const onRetry = (): void => {
    if (isRetrying) return;
    setIsRetrying(true);
    // Retry after a failed read (FR-16): the same read; a success clears the
    // session override in `spellingAvailabilitySlice`.
    void dispatch(loadUserList());
  };

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
      {isEnabled && otherReasons.length > 0 ? (
        <div role="status" className="text-sm text-gw-secondary">
          {otherReasons.map((reason) => (
            <p key={reason.kind}>{reason.message}</p>
          ))}
        </div>
      ) : null}
      {shouldShowRecovery ? (
        <div
          role="status"
          className="flex flex-col gap-2 text-sm text-gw-secondary"
        >
          <p>
            {isRetrying ? "Retrying your dictionary…" : listReason?.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              aria-disabled={isRetrying}
              onClick={onRetry}
            >
              Retry
            </Button>
            <Button
              variant="secondary"
              aria-disabled={isRetrying}
              onClick={() => {
                if (!isRetrying) dispatch(continueWithoutUserList());
              }}
            >
              Continue without my dictionary
            </Button>
          </div>
        </div>
      ) : null}
      {isNotApplied ? (
        <div role="status" className="text-sm text-gw-secondary">
          <p>
            Your own words are not being applied. Spell check is using the
            project&rsquo;s lists only until your dictionary loads again or the
            app is reloaded.
          </p>
        </div>
      ) : null}
    </section>
  );
}
