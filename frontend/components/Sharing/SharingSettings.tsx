"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import {
  getDesktopBridge,
  type DesktopBridge,
  type PairingCodeInfo,
  type SharingStatus,
} from "../../src/lib/desktop-bridge";
import {
  INTERIM_EXPOSURE_NOTE,
  NO_NETWORK_ADDRESS,
  PAIRING_CODE_ANNOUNCE_EXPIRED,
  PAIRING_CODE_ANNOUNCE_GENERATED,
  PAIRING_CODE_EXPIRED,
  PAIRING_CODE_EXPIRES_IN,
  PAIRING_CODE_GENERATE,
  PAIRING_CODE_GENERATE_NEW,
  PAIRING_CODE_HEADING,
  SHARING_ADDRESSES_HEADING,
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_CHANGE_ERROR,
  SHARING_CODE_ERROR,
  SHARING_HEADING,
  SHARING_IS_OFF,
  SHARING_IS_ON,
  SHARING_RESTARTING,
  SHARING_RESTART_BUTTON,
  SHARING_RESTART_ERROR,
  SHARING_RESTART_TO_APPLY,
  SHARING_STATEMENT_AVAILABILITY,
  SHARING_STATEMENT_UNENCRYPTED,
  SHARING_STATUS_ERROR,
  SHARING_STORE_CORRUPT,
  SHARING_SWITCH_LABEL,
  SHARING_WRONG_STATE,
} from "./sharing-copy";

/** Formats a non-negative millisecond span as m:ss. */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Resolves after the browser has had a chance to paint. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Desktop-only sharing controls for App Settings (Feature 75, FR-2, FR-4,
 * FR-6, FR-7, FR-13, FR-14, FR-22, FR-24, FR-27, FR-30).
 *
 * Renders nothing without the desktop bridge. A sharing change is recorded
 * immediately and takes effect on restart; the restart is user-triggered and
 * shared with a pending workspace-folder change (both are already recorded,
 * so one `restart()` applies both). The pairing code is shown in this window
 * only and is never logged.
 */
export default function SharingSettings(): JSX.Element | null {
  // Detected after mount, like WorkspaceLocationSettings, to avoid a
  // hydration mismatch between server HTML (no bridge) and the client.
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null);
  const [status, setStatus] = React.useState<SharingStatus | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isRestarting, setIsRestarting] = React.useState(false);
  const [code, setCode] = React.useState<PairingCodeInfo | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [announcement, setAnnouncement] = React.useState("");
  const switchId = React.useId();

  React.useEffect(() => {
    setBridge(getDesktopBridge());
  }, []);

  React.useEffect(() => {
    if (!bridge) return;
    let isActive = true;
    void (async () => {
      try {
        const loaded = await bridge.getSharingStatus();
        if (!isActive) return;
        setStatus(loaded);
        setStatusError(null);
        if (loaded.effective) {
          const existing = await bridge.getPairingCode();
          if (isActive) setCode(existing);
        }
      } catch {
        if (isActive) {
          setStatus(null);
          setStatusError(SHARING_STATUS_ERROR);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [bridge]);

  React.useEffect(() => {
    if (!code) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);

  const isExpired = code !== null && now >= code.expiresAt;
  React.useEffect(() => {
    if (isExpired) setAnnouncement(PAIRING_CODE_ANNOUNCE_EXPIRED);
  }, [isExpired]);

  if (!bridge) return null;

  async function handleToggle(next: boolean): Promise<void> {
    if (!bridge || !status) return;
    setActionError(null);
    try {
      await bridge.setSharingEnabled(next);
      setStatus({ ...status, enabled: next });
    } catch {
      setActionError(SHARING_CHANGE_ERROR);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!bridge) return;
    setActionError(null);
    try {
      const info = await bridge.generatePairingCode();
      setCode(info);
      setNow(Date.now());
      setAnnouncement(PAIRING_CODE_ANNOUNCE_GENERATED);
    } catch {
      setCode(null);
      setAnnouncement("");
      setActionError(SHARING_CODE_ERROR);
    }
  }

  async function handleRestart(): Promise<void> {
    if (!bridge) return;
    setActionError(null);
    // The message must be in the DOM before the relaunch call: no window
    // exists after the app quits (FR-4).
    setIsRestarting(true);
    await afterPaint();
    try {
      await bridge.restart();
    } catch {
      setIsRestarting(false);
      setActionError(SHARING_RESTART_ERROR);
    }
  }

  const isBlocked = status?.blockedByHostedAuth === true;
  const isEnabled = status?.enabled === true;
  const isEffective = status?.effective === true;
  const isRestartDue =
    status !== null && !isBlocked && isEnabled !== isEffective;
  const shouldShowStatements = !isBlocked && (isEnabled || isEffective);
  const remaining = code ? code.expiresAt - now : 0;

  return (
    <section
      aria-labelledby={`${switchId}-heading`}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h3
        id={`${switchId}-heading`}
        className="text-sm font-semibold text-gw-primary"
      >
        {SHARING_HEADING}
      </h3>

      {statusError ? (
        <p role="alert" className="text-sm text-gw-secondary">
          {statusError}
        </p>
      ) : null}

      {status ? (
        <>
          <div className="flex items-center gap-3">
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              checked={isEnabled}
              disabled={isRestarting}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            <label htmlFor={switchId} className="text-sm text-gw-primary">
              {SHARING_SWITCH_LABEL}
            </label>
          </div>

          <p className="text-sm font-semibold text-gw-primary">
            {isEffective ? SHARING_IS_ON : SHARING_IS_OFF}
          </p>

          {isBlocked ? (
            <p className="text-sm text-gw-secondary">
              {SHARING_BLOCKED_BY_HOSTED_AUTH}
            </p>
          ) : null}

          {shouldShowStatements ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gw-secondary">
                {SHARING_STATEMENT_UNENCRYPTED}
              </p>
              <p className="text-sm text-gw-secondary">
                {SHARING_STATEMENT_AVAILABILITY}
              </p>
              <p className="text-sm text-gw-secondary">
                {INTERIM_EXPOSURE_NOTE}
              </p>
            </div>
          ) : null}

          {(isEnabled || isEffective) &&
          status.credentialStore === "corrupt" ? (
            <p className="text-sm text-gw-secondary">{SHARING_STORE_CORRUPT}</p>
          ) : null}

          {isEffective ? (
            <div>
              <h4 className="text-sm font-semibold text-gw-primary">
                {SHARING_ADDRESSES_HEADING}
              </h4>
              {status.addresses.length === 0 ? (
                <p className="text-sm text-gw-secondary">
                  {NO_NETWORK_ADDRESS}
                </p>
              ) : (
                <ul className="mt-1 list-disc pl-5">
                  {status.addresses.map((address) => (
                    <li
                      key={address}
                      className="break-all font-mono text-[11px] text-gw-primary"
                    >
                      {address}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {isRestartDue ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-gw-primary">
                {isRestarting ? SHARING_RESTARTING : SHARING_RESTART_TO_APPLY}
              </p>
              {!isRestarting ? (
                <Button variant="outline" onClick={() => void handleRestart()}>
                  {SHARING_RESTART_BUTTON}
                </Button>
              ) : null}
            </div>
          ) : null}

          {isEnabled && !isEffective && !isBlocked ? (
            <p className="text-sm text-gw-secondary">{SHARING_WRONG_STATE}</p>
          ) : null}

          {isEffective ? (
            <div className="flex flex-col items-start gap-2">
              <h4 className="text-sm font-semibold text-gw-primary">
                {PAIRING_CODE_HEADING}
              </h4>
              {code ? (
                <>
                  <p
                    className={`font-mono text-lg text-gw-primary ${
                      isExpired ? "line-through" : ""
                    }`}
                  >
                    {code.code}
                  </p>
                  <p className="text-sm text-gw-secondary">
                    {isExpired
                      ? PAIRING_CODE_EXPIRED
                      : `${PAIRING_CODE_EXPIRES_IN} ${formatRemaining(remaining)}`}
                  </p>
                </>
              ) : null}
              <Button variant="secondary" onClick={() => void handleGenerate()}>
                {code ? PAIRING_CODE_GENERATE_NEW : PAIRING_CODE_GENERATE}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-gw-secondary">
          {actionError}
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
