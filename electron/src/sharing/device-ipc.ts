/**
 * IPC handlers for listing, renaming and revoking paired devices
 * (Feature 76, FR-3, FR-4, FR-5(a)-(c)).
 *
 * Plain module (no Electron import) so it is testable. Every handler's first
 * statement is the sender check; the renderer's payload is validated before
 * any operation runs, and a refusal never echoes the payload.
 */
import {
  listDevices,
  renameDevice,
  revokeDevice,
  type ListDevicesResult,
  type MutationResult,
} from "./device-management";

/** The part of an Electron IPC event the sender check reads. */
interface SenderEvent {
  senderFrame?: { url?: string | null } | null;
}

/** The store operations; injectable so tests can spy on them. */
interface DeviceOperations {
  listDevices(dir: string): ListDevicesResult;
  renameDevice(dir: string, id: string, name: unknown): Promise<MutationResult>;
  revokeDevice(dir: string, id: string): Promise<MutationResult>;
}

interface DeviceHandlerDeps {
  /** `app.getPath("userData")`: holds the store and is shown when it is corrupt. */
  userDataDir: string;
  /** True only for a sender URL on the local origin. */
  isTrustedSender: (url: string | null | undefined) => boolean;
  /** Test seam; defaults to the real operations. */
  operations?: DeviceOperations;
}

interface DeviceHandlers {
  list(event: SenderEvent): Promise<ListDevicesResult>;
  rename(
    event: SenderEvent,
    id: unknown,
    name: unknown,
  ): Promise<MutationResult>;
  revoke(event: SenderEvent, id: unknown): Promise<MutationResult>;
}

/**
 * Builds the three device handlers.
 *
 * @param deps - Directory, sender check and optional operation seam.
 * @returns `list`, `rename` and `revoke` handlers taking the IPC event first.
 */
export function createDeviceHandlers(deps: DeviceHandlerDeps): DeviceHandlers {
  const operations: DeviceOperations = deps.operations ?? {
    listDevices,
    renameDevice,
    revokeDevice,
  };
  const assertTrusted = (event: SenderEvent): void => {
    if (!deps.isTrustedSender(event.senderFrame?.url)) {
      throw new Error("Refused: untrusted sender");
    }
  };
  const requireId = (id: unknown): string => {
    if (typeof id !== "string" || id === "") {
      throw new Error("Invalid device request");
    }
    return id;
  };

  return {
    async list(event) {
      assertTrusted(event);
      return operations.listDevices(deps.userDataDir);
    },
    async rename(event, id, name) {
      assertTrusted(event);
      const deviceId = requireId(id);
      return operations.renameDevice(deps.userDataDir, deviceId, name);
    },
    async revoke(event, id) {
      assertTrusted(event);
      const deviceId = requireId(id);
      return operations.revokeDevice(deps.userDataDir, deviceId);
    },
  };
}
