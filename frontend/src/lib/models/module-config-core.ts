/**
 * @module module-config-core
 *
 * Transport-agnostic core that switches a module on or off for one project by
 * writing `config.modules[moduleId]` (Feature 103, FR-5, FR-7, FR-30). Modelled
 * on `goal-filter-core.ts`: a read-modify-write of `project.json` inside
 * `withMetaLock` through `updateProjectJson`, touching only its own entry.
 *
 * - The request is validated before any lock or write, so a refusal carries the
 *   same text on the HTTP route and the native backend. A refusal never echoes
 *   client input.
 * - A module id is checked for format only. An id this build does not know is
 *   stored as given (a flag written by a newer build must survive), so no
 *   registry is read here.
 * - Only the one `config.modules` entry changes: no `updatedAt`, no
 *   `metadataRevision`, no other config key, and no module data is touched
 *   (switching a module off keeps its data).
 * - The project root comes from a validated `projectId`; no path argument.
 * - Locked-access errors are not caught and propagate unchanged.
 */
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig } from "./types";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";

export { InvalidProjectIdCoreError };

/** The refusal texts, shared by every transport. */
export const MODULE_SWITCH_MESSAGES = {
  shape: "The module switch request must be an object.",
  unknownKey: "The module switch request has a field that is not allowed.",
  moduleId:
    "moduleId must be 1 to 64 characters: a lowercase letter, then lowercase letters, digits or hyphens.",
  enabled: "enabled must be true or false.",
} as const;

/** A module id: lowercase letter first, then lowercase letters, digits, hyphens. */
const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "projectId",
  "moduleId",
  "enabled",
]);

/** The request was refused by validation. Map to HTTP 400. */
export class InvalidModuleSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModuleSwitchError";
  }
}

/** The project's stored module flags after a write. */
export interface ModuleSwitchResult {
  modules: Record<string, boolean>;
}

interface ValidRequest {
  projectRoot: string;
  moduleId: string;
  isEnabled: boolean;
}

function validate(input: unknown): ValidRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidModuleSwitchError(MODULE_SWITCH_MESSAGES.shape);
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new InvalidModuleSwitchError(MODULE_SWITCH_MESSAGES.unknownKey);
  }
  const { projectId, moduleId, enabled } = record;
  const projectRoot =
    typeof projectId === "string" ? resolveProjectRoot(projectId) : null;
  if (!projectRoot) throw new InvalidProjectIdCoreError(String(projectId));
  if (typeof moduleId !== "string" || !MODULE_ID_PATTERN.test(moduleId)) {
    throw new InvalidModuleSwitchError(MODULE_SWITCH_MESSAGES.moduleId);
  }
  if (typeof enabled !== "boolean") {
    throw new InvalidModuleSwitchError(MODULE_SWITCH_MESSAGES.enabled);
  }
  return { projectRoot, moduleId, isEnabled: enabled };
}

/**
 * Set `config.modules[moduleId]` to `enabled` in `project.json`, keeping every
 * other `config.modules` entry (known or not) and every other key. Returns the
 * stored map.
 *
 * @param input - `{ projectId, moduleId, enabled }`, validated here.
 * @throws InvalidModuleSwitchError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function setModuleEnabledCore(
  input: unknown,
): Promise<ModuleSwitchResult> {
  const { projectRoot, moduleId, isEnabled } = validate(input);
  return withMetaLock(projectRoot, () =>
    updateProjectJson(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        const existing = config.modules;
        const modules: Record<string, boolean> = {
          ...(typeof existing === "object" && existing !== null
            ? (existing as Record<string, boolean>)
            : {}),
          [moduleId]: isEnabled,
        };
        config.modules = modules;
        project.config = config as unknown as ProjectConfig;
        return { result: { modules } };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    ),
  );
}
