/**
 * @module sharing-status
 *
 * The status object the desktop window receives over IPC. Pure; it carries no
 * window secret, credential or hash.
 */
import { candidateAddresses, type NetworkInterfaces } from "./addresses";
import type { CredentialStoreStatus } from "./store-status";
import { resolveSharingMode } from "./sharing-mode";

/** What the renderer is told about sharing. */
export interface SharingStatus {
  /** The recorded setting. */
  enabled: boolean;
  /** Whether sharing is actually in effect (follows `resolveSharingMode`). */
  effective: boolean;
  /** Enabled, but excluded because hosted auth is configured. */
  blockedByHostedAuth: boolean;
  /** URLs other devices open; filled whenever sharing is effective. */
  addresses: string[];
  /** State of the paired-device store. */
  credentialStore: CredentialStoreStatus;
  /** The shared server port. */
  port: number;
}

/** Inputs to {@link buildSharingStatus}. */
export interface SharingStatusInput {
  enabled: boolean;
  env: Readonly<Record<string, string | undefined>>;
  interfaces: NetworkInterfaces;
  port: number;
  credentialStore: CredentialStoreStatus;
}

/**
 * Assembles the status object.
 *
 * @param input - See {@link SharingStatusInput}.
 * @returns The status for the renderer.
 */
export function buildSharingStatus(input: SharingStatusInput): SharingStatus {
  const mode = resolveSharingMode({ enabled: input.enabled, env: input.env });
  return {
    enabled: input.enabled,
    effective: mode.effective,
    blockedByHostedAuth: mode.blockedByHostedAuth,
    addresses: mode.effective
      ? candidateAddresses(input.interfaces, input.port)
      : [],
    credentialStore: input.credentialStore,
    port: input.port,
  };
}
