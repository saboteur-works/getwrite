/**
 * @module entity-graph-settings-core
 *
 * Transport-agnostic core for a project's entity-graph settings (Feature 68
 * Task 6, FR-7/FR-8/FR-21): `config.entityGraphConnectionTypes` and
 * `config.entityGraphFocalHopRadius`. Mirrors `word-count-goal-core.ts`
 * exactly: reads `project.json` directly, does a read-modify-write inside
 * `withMetaLock`, and uses `atomicWriteFile` with the same options.
 * Locked/keyless-project errors are NOT caught here — they propagate up
 * unchanged from whatever throws inside (`readFile`/`atomicWriteFile` going
 * through `io.ts`).
 *
 * Unlike `word-count-goal-core.ts`'s single-field goal, this core has two
 * reasons to exist alongside a plain sidecar write: (1) it reads back the
 * *effective* settings (defaults filled in when either field is absent, per
 * Task 1's `DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES` and the hop-radius
 * default of `1`), not just the raw persisted config, and (2) a write always
 * runs the requested connection-type list through
 * `filterToKnownConnectionTypes` before persisting (FR-2) — an unrecognized
 * key is silently dropped, never thrown on, consistent with Task 1's
 * "ignored... rather than erroring" contract.
 */
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { PROJECT_FILENAME } from "./project-config";
import {
  DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
  filterToKnownConnectionTypes,
} from "./entity-graph-connection-types";

export { InvalidProjectIdCoreError };

/** The default hop radius (FR-21) when a project has none persisted. */
export const DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS = 1;

/** A project's effective entity-graph settings. */
export interface EntityGraphSettings {
  entityGraphConnectionTypes: string[];
  entityGraphFocalHopRadius: number;
}

/** The requested hop radius is not a non-negative integer. Map to HTTP 400. */
export class InvalidEntityGraphFocalHopRadiusError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid entityGraphFocalHopRadius: ${String(value)} (must be a non-negative integer)`,
    );
    this.name = "InvalidEntityGraphFocalHopRadiusError";
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

async function readProjectConfig(
  file: string,
): Promise<Record<string, unknown>> {
  const raw = await readFile(file, "utf8");
  const project = JSON.parse(raw) as { config?: Record<string, unknown> };
  return project.config ?? {};
}

/**
 * Reads the project's effective entity-graph settings — the Task 1 defaults
 * fill in whichever field has nothing persisted.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function getEntityGraphSettingsCore(
  projectId: string,
): Promise<EntityGraphSettings> {
  const projectRoot = requireProjectRoot(projectId);
  const file = path.join(projectRoot, PROJECT_FILENAME);
  const config = await readProjectConfig(file);

  const storedTypes = Array.isArray(config.entityGraphConnectionTypes)
    ? (config.entityGraphConnectionTypes as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : undefined;
  const storedRadius =
    typeof config.entityGraphFocalHopRadius === "number"
      ? config.entityGraphFocalHopRadius
      : undefined;

  return {
    entityGraphConnectionTypes:
      storedTypes !== undefined
        ? filterToKnownConnectionTypes(storedTypes)
        : [...DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES],
    entityGraphFocalHopRadius:
      storedRadius ?? DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS,
  };
}

/**
 * Sets `config.entityGraphConnectionTypes` and
 * `config.entityGraphFocalHopRadius` in `project.json`, touching no other
 * config key. `connectionTypes` is filtered through
 * `filterToKnownConnectionTypes` before persisting (FR-2) — an unrecognized
 * key is dropped, never thrown on. Returns the settings actually stored
 * (the filtered list, not the raw request).
 *
 * @throws InvalidEntityGraphFocalHopRadiusError, InvalidProjectIdCoreError;
 *   locked-access errors are rethrown unchanged.
 */
export async function setEntityGraphSettingsCore(
  projectId: string,
  connectionTypes: string[],
  hopRadius: number,
): Promise<EntityGraphSettings> {
  const projectRoot = requireProjectRoot(projectId);
  if (!Number.isInteger(hopRadius) || hopRadius < 0) {
    throw new InvalidEntityGraphFocalHopRadiusError(hopRadius);
  }
  const filteredTypes = filterToKnownConnectionTypes(connectionTypes);
  const file = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const raw = await readFile(file, "utf8");
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    config.entityGraphConnectionTypes = filteredTypes;
    config.entityGraphFocalHopRadius = hopRadius;
    await atomicWriteFile(
      file,
      JSON.stringify({ ...project, config }, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return {
      entityGraphConnectionTypes: filteredTypes,
      entityGraphFocalHopRadius: hopRadius,
    };
  });
}
