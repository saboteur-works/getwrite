"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
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
  PAIRED_DEVICE_ALREADY_GONE,
  PAIRED_DEVICE_CANCEL,
  PAIRED_DEVICE_NAME_CONTROL,
  PAIRED_DEVICE_NAME_EMPTY,
  PAIRED_DEVICE_NAME_LABEL,
  PAIRED_DEVICE_NAME_NOT_TEXT,
  PAIRED_DEVICE_NAME_TOO_LONG,
  PAIRED_DEVICE_RENAME,
  PAIRED_DEVICE_RENAME_ERROR,
  PAIRED_DEVICE_SAVE,
  pairedDeviceLocation,
  pairedDevicePairedOn,
  pairedDeviceRenameLabel,
  pairedDeviceRenameLabelWithDate,
  pairedDeviceRenamed,
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
 * Desktop-only list of paired devices with rename (Feature 76, FR-1, FR-2,
 * FR-6, FR-7, FR-16 to FR-18, FR-21, FR-22). Renders nothing without the
 * desktop bridge. Only `id`, `name` and `createdAt` are ever read or shown.
 *
 * After every rename attempt the list is re-read from the bridge and shown as
 * stored; the typed name is never displayed as if saved. The name field sets
 * no `maxLength`: the 64-character rule is enforced in the main process and
 * counts code points, while `maxLength` counts UTF-16 units and would refuse
 * names main accepts. Main's refusal reason is always shown.
 */
export default function PairedDevices(): JSX.Element | null {
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null);
  const [list, setList] = React.useState<ListPairedDevicesResult | null>(null);
  const [hasLoadFailed, setHasLoadFailed] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [invalidReason, setInvalidReason] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const headingId = React.useId();
  const fieldId = React.useId();
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const latestRead = React.useRef(0);
  // Where focus goes once the next render has settled: a device id (its
  // Rename button), "heading", or "field".
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
        if (token !== latestRead.current) return null;
        setList(result);
        setHasLoadFailed(false);
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
      const buttons = sectionRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-rename-for]",
      );
      const button = Array.from(buttons ?? []).find(
        (b) => b.dataset.renameFor === target,
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

      {list?.kind === "corrupt" ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-gw-secondary">
            {PAIRED_DEVICES_UNREADABLE}
          </p>
          <p className="break-all text-sm text-gw-secondary">
            {pairedDeviceLocation(list.storeDirectory)}
          </p>
        </div>
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
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p role="status" aria-live="polite" className="text-sm text-gw-secondary">
        {message}
      </p>
    </section>
  );
}
