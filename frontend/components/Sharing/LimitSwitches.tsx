"use client";

import React from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import Switch from "../common/UI/Switch";
import {
  getDesktopBridge,
  type DesktopBridge,
  type GetSharingLimitsResult,
  type ListPairedDevicesResult,
  type SetSharingLimitResult,
  type SharingLimitKey,
} from "../../src/lib/desktop-bridge";
import {
  LIMITS_CHANGE_FAILED,
  LIMITS_CHANGE_LOCK_BUSY,
  LIMITS_CHANGE_REFUSED_UNREADABLE,
  LIMITS_EXPLAINER,
  LIMITS_HEADING,
  LIMITS_LOAD_ERROR,
  LIMITS_UNLOCK_CONFIRM,
  LIMITS_UNLOCK_CONFIRM_TITLE,
  LIMITS_UNLOCK_KEEP,
  LIMITS_UNLOCK_WARNING_RECORDED,
  LIMITS_UNLOCK_WARNING_TYPED,
  LIMITS_UNLOCK_WARNING_UNENCRYPTED,
  LIMITS_UNREADABLE,
  LIMIT_LABEL_ENCRYPTION_CHANGES,
  LIMIT_LABEL_LOCKING,
  LIMIT_LABEL_PERMANENT_DELETION,
  LIMIT_LABEL_PROJECT_DELETION,
  LIMIT_LABEL_UNLOCKING,
  limitNowState,
  pairedDeviceLocation,
  type LimitsReadState,
} from "./sharing-copy";

const LIMIT_ROWS: ReadonlyArray<{ key: SharingLimitKey; label: string }> = [
  { key: "projectDeletion", label: LIMIT_LABEL_PROJECT_DELETION },
  { key: "unlocking", label: LIMIT_LABEL_UNLOCKING },
  { key: "locking", label: LIMIT_LABEL_LOCKING },
  { key: "encryptionChanges", label: LIMIT_LABEL_ENCRYPTION_CHANGES },
  { key: "permanentDeletion", label: LIMIT_LABEL_PERMANENT_DELETION },
];

function changeFailureText(result: SetSharingLimitResult): string {
  switch (result.kind) {
    case "unreadable":
      return LIMITS_CHANGE_REFUSED_UNREADABLE;
    case "lock-not-acquired":
      return LIMITS_CHANGE_LOCK_BUSY;
    case "write-failed":
    case "invalid-input":
      return LIMITS_CHANGE_FAILED;
    case "ok":
      return "";
  }
}

export interface LimitSwitchesProps {
  /** Sharing is enabled or in effect; otherwise shown only if devices exist. */
  isSharingActive: boolean;
  /**
   * Called with the latest read of the limits each time it changes, so a
   * summary elsewhere is built from the same state the switches show.
   */
  onLimitsRead?: (state: LimitsReadState) => void;
}

/**
 * Desktop-only switches for what a paired device may do (Feature 77, FR-27,
 * FR-29 to FR-31). Renders nothing without the desktop bridge. One switch per
 * limit; on means restricted. Every change applies at once with no Save
 * button, and after every attempt the state shown is re-read from the bridge,
 * never set from what was asked. Switching Limit unlocking off asks first.
 *
 * Shown under the paired-devices list's rule: sharing enabled or in effect, at
 * least one device paired, or a store unreadable. Once shown it stays shown
 * for this mount. A missing, invalid or unreadable limits file shows every
 * switch on (the effective state); an unreadable one is also said in text with
 * its folder, and a change to it is refused by the main process.
 */
export default function LimitSwitches({
  isSharingActive,
  onLimitsRead,
}: LimitSwitchesProps): JSX.Element | null {
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null);
  const [limits, setLimits] = React.useState<GetSharingLimitsResult | null>(
    null,
  );
  const [devices, setDevices] = React.useState<ListPairedDevicesResult | null>(
    null,
  );
  const [hasLoadFailed, setHasLoadFailed] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const headingId = React.useId();
  const warningId = React.useId();
  const unlockingRef = React.useRef<HTMLInputElement | null>(null);
  const latestRead = React.useRef(0);
  const hasBeenShown = React.useRef(false);

  React.useEffect(() => {
    setBridge(getDesktopBridge());
  }, []);

  /** Re-reads the limits; a later request always wins over an earlier one. */
  const refresh = React.useCallback(
    async (target: DesktopBridge): Promise<GetSharingLimitsResult | null> => {
      latestRead.current += 1;
      const token = latestRead.current;
      try {
        const result = await target.getSharingLimits();
        if (token === latestRead.current) {
          setLimits(result);
          setHasLoadFailed(false);
        }
        return result;
      } catch {
        if (token === latestRead.current) setHasLoadFailed(true);
        return null;
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!bridge) return;
    const target = bridge;
    void refresh(target);
    void (async () => {
      try {
        setDevices(await target.listPairedDevices());
      } catch {
        // PairedDevices reports its own read failure; here it only means the
        // "a device is paired" reason to show this section is not known.
        setDevices(null);
      }
    })();
  }, [bridge, refresh]);

  React.useEffect(() => {
    if (!onLimitsRead) return;
    if (hasLoadFailed) onLimitsRead({ status: "failed" });
    else if (limits) onLimitsRead({ status: "read", result: limits });
    else onLimitsRead({ status: "loading" });
  }, [limits, hasLoadFailed, onLimitsRead]);

  if (!bridge) return null;

  const hasDevices =
    devices !== null && devices.kind === "ok" && devices.devices.length > 0;
  const isShown =
    isSharingActive ||
    hasDevices ||
    devices?.kind === "corrupt" ||
    limits?.kind === "unreadable" ||
    hasLoadFailed ||
    hasBeenShown.current;
  if (!isShown) return null;
  hasBeenShown.current = true;

  async function apply(key: SharingLimitKey, value: boolean): Promise<void> {
    if (!bridge || isBusy) return;
    setIsBusy(true);
    setMessage("");
    let failure = "";
    try {
      failure = changeFailureText(await bridge.setSharingLimit(key, value));
    } catch {
      failure = LIMITS_CHANGE_FAILED;
    }
    const fresh = await refresh(bridge);
    if (failure) {
      setMessage(failure);
    } else if (fresh) {
      const row = LIMIT_ROWS.find((r) => r.key === key);
      setMessage(row ? limitNowState(row.label, fresh.limits[key]) : "");
    }
    setIsBusy(false);
  }

  function handleChange(key: SharingLimitKey, next: boolean): void {
    if (key === "unlocking" && !next) {
      setIsConfirmOpen(true);
      return;
    }
    void apply(key, next);
  }

  function closeConfirm(): void {
    setIsConfirmOpen(false);
    // The dialog has no trigger element, so Radix cannot return focus itself.
    requestAnimationFrame(() => unlockingRef.current?.focus());
  }

  function confirmUnlockingOff(): void {
    closeConfirm();
    void apply("unlocking", false);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h4 id={headingId} className="text-sm font-semibold text-gw-primary">
        {LIMITS_HEADING}
      </h4>

      {hasLoadFailed && limits === null ? (
        <p className="text-sm text-gw-secondary">{LIMITS_LOAD_ERROR}</p>
      ) : null}

      {limits ? (
        <>
          <p className="text-sm text-gw-secondary">{LIMITS_EXPLAINER}</p>
          <ul className="flex flex-col gap-3">
            {LIMIT_ROWS.map(({ key, label }) => {
              const inputId = `${headingId}-${key}`;
              const isUnlocking = key === "unlocking";
              return (
                <li key={key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={inputId}
                      ref={isUnlocking ? unlockingRef : undefined}
                      checked={limits.limits[key]}
                      disabled={isBusy}
                      aria-describedby={isUnlocking ? warningId : undefined}
                      onChange={(e) => handleChange(key, e.target.checked)}
                    />
                    <label
                      htmlFor={inputId}
                      className="text-sm text-gw-primary"
                    >
                      {label}
                    </label>
                  </div>
                  {isUnlocking ? (
                    <div id={warningId} className="flex flex-col gap-1">
                      <p className="text-sm text-gw-secondary">
                        {LIMITS_UNLOCK_WARNING_TYPED}
                      </p>
                      <p className="text-sm text-gw-secondary">
                        {LIMITS_UNLOCK_WARNING_UNENCRYPTED}
                      </p>
                      <p className="text-sm text-gw-secondary">
                        {LIMITS_UNLOCK_WARNING_RECORDED}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div role="status" aria-live="polite" className="flex flex-col gap-1">
        <p className="text-sm text-gw-secondary">{message}</p>
        {limits?.kind === "unreadable" ? (
          <>
            <p className="text-sm text-gw-secondary">{LIMITS_UNREADABLE}</p>
            <p className="break-all text-sm text-gw-secondary">
              {pairedDeviceLocation(limits.storeDirectory)}
            </p>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={LIMITS_UNLOCK_CONFIRM_TITLE}
        details={
          <div className="flex flex-col gap-2 text-sm text-gw-secondary">
            <p>{LIMITS_UNLOCK_WARNING_TYPED}</p>
            <p>{LIMITS_UNLOCK_WARNING_UNENCRYPTED}</p>
            <p>{LIMITS_UNLOCK_WARNING_RECORDED}</p>
          </div>
        }
        confirmLabel={LIMITS_UNLOCK_CONFIRM}
        cancelLabel={LIMITS_UNLOCK_KEEP}
        onConfirm={confirmUnlockingOff}
        onCancel={closeConfirm}
      />
    </section>
  );
}
