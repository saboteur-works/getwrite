"use client";

import React from "react";
import {
  getDesktopBridge,
  type SharingStatus as SharingStatusInfo,
} from "../../src/lib/desktop-bridge";
import {
  INTERIM_EXPOSURE_NOTE,
  NO_NETWORK_ADDRESS,
  SHARING_BLOCKED_BY_HOSTED_AUTH,
  SHARING_IS_ON,
  SHARING_STATEMENT_AVAILABILITY,
  SHARING_STATEMENT_UNENCRYPTED,
  SHARING_STATUS_ERROR,
} from "./sharing-copy";

/**
 * Read-only "Sharing is on" indicator for the desktop window's main views
 * (Feature 75, FR-6, FR-7, FR-24, FR-30).
 *
 * Renders nothing without the desktop bridge or while sharing is not in
 * effect. When hosted auth blocks sharing it shows the hosted-auth message
 * instead. A bridge failure renders an explicit error line, never nothing.
 * State is conveyed by text only; no colour carries meaning.
 */
export default function SharingStatus(): JSX.Element | null {
  // Detected after mount to avoid a hydration mismatch (no bridge on the server).
  const [hasBridge, setHasBridge] = React.useState(false);
  const [status, setStatus] = React.useState<SharingStatusInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setHasBridge(true);
    let isActive = true;
    void (async () => {
      try {
        const loaded = await bridge.getSharingStatus();
        if (!isActive) return;
        setStatus(loaded);
        setError(null);
      } catch {
        if (!isActive) return;
        setStatus(null);
        setError(SHARING_STATUS_ERROR);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  if (!hasBridge) return null;

  if (error) {
    return (
      <p role="alert" className="text-sm text-gw-secondary">
        {error}
      </p>
    );
  }

  if (!status) return null;

  if (status.blockedByHostedAuth) {
    return (
      <p className="text-sm text-gw-secondary">
        {SHARING_BLOCKED_BY_HOSTED_AUTH}
      </p>
    );
  }

  if (!status.effective) return null;

  return (
    <section
      aria-label={SHARING_IS_ON}
      className="flex flex-col gap-2 border-hairline border-gw-border px-3 py-2"
    >
      <p role="status" className="text-sm font-semibold text-gw-primary">
        {SHARING_IS_ON}
      </p>
      {status.addresses.length === 0 ? (
        <p className="text-sm text-gw-secondary">{NO_NETWORK_ADDRESS}</p>
      ) : (
        <ul className="list-disc pl-5">
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
      <p className="text-sm text-gw-secondary">
        {SHARING_STATEMENT_UNENCRYPTED}
      </p>
      <p className="text-sm text-gw-secondary">
        {SHARING_STATEMENT_AVAILABILITY}
      </p>
      <p className="text-sm text-gw-secondary">{INTERIM_EXPOSURE_NOTE}</p>
    </section>
  );
}
