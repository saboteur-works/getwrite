"use client";

import React from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
  selectActiveProjectDirectoryId,
  selectSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  encryptProject,
  exportPlaintextCopy,
  isSerializedLimitRefusal,
  lockWorkspace,
} from "../../src/store/cryptoSlice";
import { useSharingLimits } from "../Sharing/SharingLimitsContext";
import { resolveRuntime } from "../../src/store/transport/runtime";
import EncryptionSettings, {
  type EncryptionSettingsProps,
} from "./EncryptionSettings";

type RefusalAwareProps = Omit<EncryptionSettingsProps, "onLockWorkspace"> & {
  /** Runs the lock; the returned promise rejects with the serialised thunk error. */
  onLockWorkspace?: () => Promise<unknown>;
};

/**
 * {@link EncryptionSettings} with a lock handler that re-reads the paired-device
 * limits when the server refuses the lock. The slice already holds the
 * refusal's message; a refusal also means the limits on screen may be stale.
 * Split out so the limits hook is called only when the settings are rendered.
 */
function RefusalAwareEncryptionSettings({
  onLockWorkspace,
  ...rest
}: RefusalAwareProps): JSX.Element {
  const { refresh: refreshLimits } = useSharingLimits();
  return (
    <EncryptionSettings
      {...rest}
      onLockWorkspace={
        onLockWorkspace
          ? () => {
              onLockWorkspace().catch((error: unknown) => {
                if (isSerializedLimitRefusal(error)) void refreshLimits();
              });
            }
          : undefined
      }
    />
  );
}

/**
 * Connects {@link EncryptionSettings} to the store and the encryption API.
 *
 * Kept separate from the presentational panel so that component stays
 * prop-driven and testable. This is the only place the encryption UI is mounted,
 * which is what makes "encryption is reachable by one explicit action and
 * nothing else" (FR2) checkable by inspection.
 *
 * Renders nothing until lock state is known, when the deployment cannot offer
 * encryption (FR23), or when no project is open — there is nothing to encrypt in
 * any of those cases.
 *
 * Also renders nothing on the native runtime, deliberately. Before this gate,
 * the panel's absence there was an accident of two other things: the native
 * build strips `/api/encryption`, so `checkWorkspaceLock`'s fetch always
 * rejects, and `cryptoSlice.ts` has no `.rejected` case for that thunk, so
 * `lockStatus` stayed stuck at its initial `"unknown"` — which happens to also
 * be one of this panel's own null-render states. Native has no encrypting
 * storage adapter wired in anywhere (`native-bootstrap.ts` binds the raw
 * `capacitorFsAdapter`, no native transport backend implements an encryption
 * path, and `lib/api/encryption.ts` does not go through `createTransport`).
 * If that native storage support is ever wired up, this gate must be
 * reconsidered as part of that work — not simply deleted — since removing it
 * without native encrypt/decrypt support in place would let a user encrypt a
 * project on-device with no way to unlock or recover it.
 */
export default function ProjectEncryptionPanel(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const projectId = useAppSelector(selectSelectedProjectId);
  // The on-disk directory basename, which is what the model layer keys on.
  const directoryId = useAppSelector(selectActiveProjectDirectoryId);
  const projectName = useAppSelector((state) =>
    projectId ? (state.projects.projects[projectId]?.name ?? "") : "",
  );

  // Tolerates a store without this slice: the panel is a leaf mounted inside a
  // shared settings surface, and must never break the screen hosting it.
  const lockStatus = useAppSelector(
    (state) => state.crypto?.status ?? "unknown",
  );
  const encryptedProjectIds = useAppSelector(
    (state) => state.crypto?.encryptedProjectIds,
  );
  const isConverting = useAppSelector(
    (state) => state.crypto?.isConverting ?? false,
  );
  const isExporting = useAppSelector(
    (state) => state.crypto?.isExporting ?? false,
  );
  const errorMessage = useAppSelector((state) => state.crypto?.errorMessage);

  // Deliberately does not fetch: the page bootstraps lock state once on mount.
  // A second fetch here would fire on every settings render, and would make this
  // panel a network dependency of every screen that hosts it.
  if (resolveRuntime() === "native") return null;

  // A failed status check leaves the state unknown. Say so rather than render
  // nothing, which would be indistinguishable from "no encryption here".
  if (lockStatus === "unknown" && errorMessage) {
    return (
      <p className="font-mono text-[10px] text-gw-secondary">{errorMessage}</p>
    );
  }

  if (
    lockStatus === "unknown" ||
    lockStatus === "unavailable" ||
    !directoryId
  ) {
    return null;
  }

  return (
    <RefusalAwareEncryptionSettings
      projectName={projectName || "this project"}
      isEncrypted={(encryptedProjectIds ?? []).includes(directoryId)}
      // A passphrase is created only for the first encrypted project; after
      // that one workspace passphrase covers them all.
      needsPassphrase={lockStatus === "absent"}
      isWorkspaceLocked={lockStatus === "locked"}
      isBusy={isConverting}
      isExporting={isExporting}
      onExportPlaintextCopy={
        lockStatus === "unlocked"
          ? () => void dispatch(exportPlaintextCopy(directoryId))
          : undefined
      }
      onLockWorkspace={
        lockStatus === "unlocked"
          ? () => dispatch(lockWorkspace()).unwrap()
          : undefined
      }
      errorMessage={errorMessage}
      onEnableEncryption={(passphrase) => {
        void dispatch(
          encryptProject({
            projectId: directoryId,
            projectName: projectName || directoryId,
            passphrase,
          }),
        );
      }}
    />
  );
}
