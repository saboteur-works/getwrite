"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import ConfirmDialog from "../common/ConfirmDialog";
import Input from "../common/UI/Input/Input";
import {
  getDesktopBridge,
  type DesktopBridge,
  type ListPairedDevicesResult,
  type PairedDevice,
  type PairedDeviceMutationResult,
} from "../../src/lib/desktop-bridge";
import {
  PAIRED_DEVICES_EMPTY,
  PAIRED_DEVICES_HEADING,
  PAIRED_DEVICES_LOAD_ERROR,
  PAIRED_DEVICES_LOADING,
  PAIRED_DEVICES_UNREADABLE,
  PAIRED_DEVICES_UNREADABLE_SHARING_OFF,
  PAIRED_DEVICE_ALREADY_GONE,
  PAIRED_DEVICE_CANCEL,
  PAIRED_DEVICE_NAME_CONTROL,
  PAIRED_DEVICE_NAME_EMPTY,
  PAIRED_DEVICE_NAME_LABEL,
  PAIRED_DEVICE_NAME_NOT_TEXT,
  PAIRED_DEVICE_NAME_TOO_LONG,
  PAIRED_DEVICE_RENAME,
  PAIRED_DEVICE_RENAME_ERROR,
  PAIRED_DEVICE_REVOKE,
  PAIRED_DEVICE_REVOKE_ERROR,
  PAIRED_DEVICE_REVOKE_TITLE,
  PAIRED_DEVICE_SAVE,
  pairedDeviceLocation,
  pairedDevicePairedOn,
  pairedDeviceRenameLabel,
  pairedDeviceRenameLabelWithDate,
  pairedDeviceRenamed,
  pairedDeviceRevokeConfirm,
  pairedDeviceRevokeDescription,
  pairedDeviceRevokeKeep,
  pairedDeviceRevokeLabel,
  pairedDeviceRevokeLabelWithDate,
  pairedDeviceRevoked,
} from "./sharing-copy";

type InvalidNameResult = Extract<
  PairedDeviceMutationResult,
  { kind: "invalid-name" }
>;

/**
 * Formats a stored `createdAt` for the writer: the user's locale, medium date
 * plus short time (e.g. "Oct 1, 2026, 2:30 PM"). A value that does not parse
 * as a date is returned unchanged, never "Invalid Date".
 */
function formatPairedDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function invalidNameText(reason: InvalidNameResult["reason"]): string {
  switch (reason) {
    case "not-a-string":
      return PAIRED_DEVICE_NAME_NOT_TEXT;
    case "empty":
      return PAIRED_DEVICE_NAME_EMPTY;
    case "too-long":
      return PAIRED_DEVICE_NAME_TOO_LONG;
    case "control-character":
      return PAIRED_DEVICE_NAME_CONTROL;
  }
}

/**
 * How often the list is re-read from the main process, in milliseconds.
 * 5000: a code is only worth entering within minutes, so a device paired from
 * another room should appear within a few seconds without the writer acting,
 * while each tick reads one small file over IPC, so a longer period costs
 * nothing noticeable and a shorter one only adds reads. Ticks are skipped
 * while the document is hidden; becoming visible again triggers one read.
 */
export const PAIRED_DEVICES_POLL_INTERVAL_MS = 5000;

/** The device a revoke confirmation is open for (name captured at open). */
interface RevokeTarget {
  id: string;
  name: string;
}

export interface PairedDevicesProps {
  /** Sharing is enabled or in effect; otherwise shown only if devices exist. */
  isSharingActive: boolean;
}

/**
 * Desktop-only list of paired devices with rename and revoke (Feature 76,
 * FR-1, FR-2, FR-3, FR-6, FR-7, FR-13, FR-16 to FR-18, FR-21, FR-22). Renders nothing without the
 * desktop bridge. Only `id`, `name` and `createdAt` are ever read or shown.
 *
 * After every rename attempt the list is re-read from the bridge and shown as
 * stored; the typed name is never displayed as if saved. The name field sets
 * no `maxLength`: the 64-character rule is enforced in the main process and
 * counts code points, while `maxLength` counts UTF-16 units and would refuse
 * names main accepts. Main's refusal reason is always shown.
 *
 * Revoke opens a `ConfirmDialog`; Radix focuses its first button (Keep) on
 * open and returns focus to the previously focused Revoke button on close.
 * After a revoke the list is re-read and focus goes to the next device's
 * Rename button, else the previous one's, else the list heading.
 *
 * Shown when sharing is enabled or in effect, when the store holds at least
 * one device, or when the store is unreadable in any sharing state (FR-20,
 * OQ-17). With sharing off and a missing or empty store nothing is rendered.
 * The one unreadable-store message and the file's folder are in the polite
 * live region, with wording that depends on `isSharingActive` (nothing is
 * refused while sharing is off). Once shown it stays shown for this mount, so
 * revoking the last device does not remove its own confirmation message and a
 * list that becomes unreadable is replaced by the message, not by nothing. The list is
 * re-read on mount, after each action and every
 * `PAIRED_DEVICES_POLL_INTERVAL_MS`; a refresh replaces only the list, never
 * the rename field's text or an open revoke dialog.
 */
export default function PairedDevices({
  isSharingActive,
}: PairedDevicesProps): JSX.Element | null {
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null);
  const [list, setList] = React.useState<ListPairedDevicesResult | null>(null);
  const [hasLoadFailed, setHasLoadFailed] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [invalidReason, setInvalidReason] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [revokeTarget, setRevokeTarget] = React.useState<RevokeTarget | null>(
    null,
  );
  const [isRevoking, setIsRevoking] = React.useState(false);
  const headingId = React.useId();
  const fieldId = React.useId();
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const latestRead = React.useRef(0);
  const hasBeenShown = React.useRef(false);
  // Where focus goes once the next render has settled: a device id (its
  // Rename button), "revoke:<id>" (its Revoke button), "heading", or "field".
  const pendingFocus = React.useRef<string | null>(null);

  React.useEffect(() => {
    setBridge(getDesktopBridge());
  }, []);

  /** Re-reads the list; a later request always wins over an earlier one. */
  const refresh = React.useCallback(
    async (target: DesktopBridge): Promise<ListPairedDevicesResult | null> => {
      latestRead.current += 1;
      const token = latestRead.current;
      try {
        const result = await target.listPairedDevices();
        // A superseded read is still a valid read of the store taken after the
        // action that asked for it; only the newest may update the display.
        if (token === latestRead.current) {
          setList(result);
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
    if (bridge) void refresh(bridge);
  }, [bridge, refresh]);

  React.useEffect(() => {
    if (!bridge) return;
    const target = bridge;
    const tick = (): void => {
      if (!document.hidden) void refresh(target);
    };
    const timer = setInterval(tick, PAIRED_DEVICES_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [bridge, refresh]);

  const devices: PairedDevice[] =
    list && list.kind !== "corrupt" ? list.devices : [];
  const editing = devices.find((d) => d.id === editingId) ?? null;

  React.useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "field") {
      if (!inputRef.current) return;
      inputRef.current.focus();
    } else if (target === "heading") {
      headingRef.current?.focus();
    } else {
      const isRevoke = target.startsWith("revoke:");
      const id = isRevoke ? target.slice("revoke:".length) : target;
      const buttons = sectionRef.current?.querySelectorAll<HTMLButtonElement>(
        isRevoke ? "button[data-revoke-for]" : "button[data-rename-for]",
      );
      const button = Array.from(buttons ?? []).find(
        (b) => (isRevoke ? b.dataset.revokeFor : b.dataset.renameFor) === id,
      );
      if (!button) return;
      button.focus();
    }
    pendingFocus.current = null;
  });

  if (!bridge) return null;

  function openRename(device: PairedDevice): void {
    setMessage("");
    setInvalidReason(null);
    setDraft(device.name);
    setEditingId(device.id);
    pendingFocus.current = "field";
  }

  function cancelRename(deviceId: string): void {
    setEditingId(null);
    setInvalidReason(null);
    pendingFocus.current = deviceId;
  }

  async function finishRename(
    deviceId: string,
    result: PairedDeviceMutationResult,
    target: DesktopBridge,
  ): Promise<void> {
    if (result.kind === "invalid-name") {
      // No re-read: nothing was written. Field stays open and focused.
      setInvalidReason(invalidNameText(result.reason));
      pendingFocus.current = "field";
      return;
    }
    setInvalidReason(null);
    const fresh = await refresh(target);
    const stored =
      fresh && fresh.kind !== "corrupt"
        ? fresh.devices.find((d) => d.id === deviceId)
        : undefined;
    if (result.kind === "ok") {
      setMessage(
        stored ? pairedDeviceRenamed(stored.name) : PAIRED_DEVICE_ALREADY_GONE,
      );
      setEditingId(null);
      pendingFocus.current = stored ? deviceId : "heading";
    } else if (result.kind === "not-found") {
      setMessage(PAIRED_DEVICE_ALREADY_GONE);
      setEditingId(null);
      pendingFocus.current = stored ? deviceId : "heading";
    } else {
      setMessage(PAIRED_DEVICE_RENAME_ERROR);
    }
  }

  function openRevoke(device: PairedDevice): void {
    setMessage("");
    setRevokeTarget({ id: device.id, name: device.name });
  }

  function cancelRevoke(): void {
    // A revoke already in flight cannot be cancelled from here.
    if (isRevoking) return;
    // Radix returns focus only to a Trigger, and this dialog has none, so
    // focus is sent back to the device's Revoke button here.
    if (revokeTarget) pendingFocus.current = `revoke:${revokeTarget.id}`;
    setRevokeTarget(null);
  }

  /**
   * Where focus goes once `target` is gone: the next remaining device in the
   * order the writer saw, else the previous one, else the heading.
   */
  function focusAfterRemoval(
    seen: PairedDevice[],
    targetId: string,
    fresh: ListPairedDevicesResult | null,
  ): string {
    const remaining = new Set(
      fresh && fresh.kind !== "corrupt" ? fresh.devices.map((d) => d.id) : [],
    );
    if (remaining.has(targetId)) return `revoke:${targetId}`;
    const index = seen.findIndex((d) => d.id === targetId);
    const after = seen.slice(index + 1).find((d) => remaining.has(d.id));
    if (after) return after.id;
    const before = seen
      .slice(0, Math.max(index, 0))
      .reverse()
      .find((d) => remaining.has(d.id));
    return before ? before.id : "heading";
  }

  async function confirmRevoke(): Promise<void> {
    if (!bridge || !revokeTarget || isRevoking) return;
    const target = revokeTarget;
    const seen = devices;
    setIsRevoking(true);
    setMessage("");
    let outcome: "ok" | "not-found" | "failed" = "failed";
    try {
      const result = await bridge.revokePairedDevice(target.id);
      if (result.kind === "ok") outcome = "ok";
      else if (result.kind === "not-found") outcome = "not-found";
    } catch {
      outcome = "failed";
    }
    const fresh = await refresh(bridge);
    setMessage(
      outcome === "ok"
        ? pairedDeviceRevoked(target.name)
        : outcome === "not-found"
          ? PAIRED_DEVICE_ALREADY_GONE
          : PAIRED_DEVICE_REVOKE_ERROR,
    );
    pendingFocus.current = focusAfterRemoval(seen, target.id, fresh);
    setRevokeTarget(null);
    setIsRevoking(false);
  }

  async function submitRename(
    event: React.FormEvent,
    device: PairedDevice,
  ): Promise<void> {
    event.preventDefault();
    if (!bridge || isSaving) return;
    setIsSaving(true);
    setMessage("");
    try {
      const result = await bridge.renamePairedDevice(device.id, draft);
      await finishRename(device.id, result, bridge);
    } catch {
      setMessage(PAIRED_DEVICE_RENAME_ERROR);
      await refresh(bridge);
    } finally {
      setIsSaving(false);
    }
  }

  const isShown =
    isSharingActive ||
    devices.length > 0 ||
    list?.kind === "corrupt" ||
    (hasLoadFailed && list === null) ||
    hasBeenShown.current;
  if (!isShown) return null;
  hasBeenShown.current = true;

  const nameCounts = new Map<string, number>();
  for (const d of devices) {
    nameCounts.set(d.name, (nameCounts.get(d.name) ?? 0) + 1);
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className="mt-6 flex flex-col gap-3 border-t border-gw-border pt-4"
    >
      <h4
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-gw-primary outline-none"
      >
        {PAIRED_DEVICES_HEADING}
      </h4>

      {hasLoadFailed ? (
        <p className="text-sm text-gw-secondary">{PAIRED_DEVICES_LOAD_ERROR}</p>
      ) : null}

      {list === null && !hasLoadFailed ? (
        <p className="text-sm text-gw-secondary">{PAIRED_DEVICES_LOADING}</p>
      ) : null}

      {list && list.kind !== "corrupt" && devices.length === 0 ? (
        <p className="text-sm text-gw-secondary">{PAIRED_DEVICES_EMPTY}</p>
      ) : null}

      {devices.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {devices.map((device) => {
            const date = formatPairedDate(device.createdAt);
            const isDuplicate = (nameCounts.get(device.name) ?? 0) > 1;
            const renameLabel = isDuplicate
              ? pairedDeviceRenameLabelWithDate(device.name, date)
              : pairedDeviceRenameLabel(device.name);
            const revokeLabel = isDuplicate
              ? pairedDeviceRevokeLabelWithDate(device.name, date)
              : pairedDeviceRevokeLabel(device.name);
            const isEditing = editing?.id === device.id;
            return (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                {isEditing ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => void submitRename(e, device)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelRename(device.id);
                    }}
                  >
                    <label
                      htmlFor={fieldId}
                      className="text-sm text-gw-primary"
                    >
                      {PAIRED_DEVICE_NAME_LABEL}
                    </label>
                    <Input
                      id={fieldId}
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-invalid={invalidReason !== null}
                      aria-describedby={
                        invalidReason ? `${fieldId}-reason` : undefined
                      }
                      className="text-sm"
                    />
                    {invalidReason ? (
                      <p
                        id={`${fieldId}-reason`}
                        role="alert"
                        className="text-sm text-gw-secondary"
                      >
                        {invalidReason}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={isSaving}>
                        {PAIRED_DEVICE_SAVE}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => cancelRename(device.id)}
                      >
                        {PAIRED_DEVICE_CANCEL}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-col">
                      <span className="break-words text-sm text-gw-primary">
                        {device.name}
                      </span>
                      <span className="text-xs text-gw-secondary">
                        {pairedDevicePairedOn(date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        data-rename-for={device.id}
                        aria-label={renameLabel}
                        onClick={() => openRename(device)}
                      >
                        {PAIRED_DEVICE_RENAME}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        data-revoke-for={device.id}
                        aria-label={revokeLabel}
                        onClick={() => openRevoke(device)}
                      >
                        {PAIRED_DEVICE_REVOKE}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div role="status" aria-live="polite" className="flex flex-col gap-1">
        <p className="text-sm text-gw-secondary">{message}</p>
        {list?.kind === "corrupt" ? (
          <>
            <p className="text-sm text-gw-secondary">
              {isSharingActive
                ? PAIRED_DEVICES_UNREADABLE
                : PAIRED_DEVICES_UNREADABLE_SHARING_OFF}
            </p>
            <p className="break-all text-sm text-gw-secondary">
              {pairedDeviceLocation(list.storeDirectory)}
            </p>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        title={PAIRED_DEVICE_REVOKE_TITLE}
        description={
          revokeTarget ? pairedDeviceRevokeDescription(revokeTarget.name) : ""
        }
        confirmLabel={
          revokeTarget ? pairedDeviceRevokeConfirm(revokeTarget.name) : ""
        }
        cancelLabel={
          revokeTarget ? pairedDeviceRevokeKeep(revokeTarget.name) : ""
        }
        onConfirm={() => void confirmRevoke()}
        onCancel={cancelRevoke}
        isConfirmDisabled={isRevoking}
      />
    </section>
  );
}
