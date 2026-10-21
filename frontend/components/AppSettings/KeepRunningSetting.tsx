"use client";

import React from "react";
import {
  getDesktopBridge,
  type DesktopBridge,
  type KeepRunningSetting as KeepRunningSettingValue,
} from "../../src/lib/desktop-bridge";

/**
 * App Settings switch: keep GetWrite running after its window is closed.
 *
 * Desktop on macOS only; it renders nothing on web, on native, or where the
 * desktop app reports the setting as unsupported (Windows and Linux, which
 * have no Dock icon to reopen the window from). Off by default: closing the
 * window quits. The change is saved at once and applies at the next close.
 */
export default function KeepRunningSetting(): JSX.Element | null {
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null);
  const [setting, setSetting] = React.useState<KeepRunningSettingValue | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const switchId = React.useId();

  React.useEffect(() => {
    // A bridge without these methods (a stub, or a preload from another
    // build) reads as no setting rather than throwing inside App Settings.
    const candidate = getDesktopBridge();
    setBridge(
      candidate && typeof candidate.getKeepRunningSetting === "function"
        ? candidate
        : null,
    );
  }, []);

  React.useEffect(() => {
    if (!bridge) return;
    let isActive = true;
    bridge
      .getKeepRunningSetting()
      .then((loaded) => {
        if (isActive) setSetting(loaded);
      })
      .catch(() => {
        if (isActive) setError("Could not load this setting.");
      });
    return () => {
      isActive = false;
    };
  }, [bridge]);

  if (!bridge) return null;
  if (setting && !setting.supported) return null;
  if (!setting && !error) return null;

  async function handleToggle(next: boolean): Promise<void> {
    if (!bridge || !setting) return;
    setError(null);
    setIsSaving(true);
    try {
      await bridge.setKeepRunningSetting(next);
      setSetting({ ...setting, enabled: next });
    } catch {
      setError("Could not save this setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby={`${switchId}-heading`}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h3
        id={`${switchId}-heading`}
        className="text-sm font-semibold text-gw-primary"
      >
        When the window closes
      </h3>

      {error ? (
        <p role="alert" className="text-sm text-gw-secondary">
          {error}
        </p>
      ) : null}

      {setting ? (
        <>
          <div className="flex items-center gap-3">
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              checked={setting.enabled}
              disabled={isSaving}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            <label htmlFor={switchId} className="text-sm text-gw-primary">
              Keep GetWrite running after its window is closed
            </label>
          </div>
          <p className="text-sm text-gw-secondary">
            Off: closing the window quits GetWrite. On: GetWrite stays in the
            Dock, and home-network sharing, if it is on, keeps serving paired
            devices. Click the Dock icon to reopen the window; Cmd+Q quits.
          </p>
        </>
      ) : null}
    </section>
  );
}
