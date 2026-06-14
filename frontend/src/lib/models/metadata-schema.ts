/**
 * @module metadata-schema
 *
 * CRUD operations for the dynamic metadata schema stored in `project.json`
 * under `config.metadataSchema`. All functions read the project file, mutate
 * the relevant config block, and write back atomically under a per-project lock.
 *
 * Follow the same pattern as `tags.ts`: no optimistic in-memory state, direct
 * filesystem reads/writes, file locking for concurrent-write safety.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { acquireLock } from "./locks";
import { PROJECT_FILENAME } from "./project-config";
import { readSidecar, writeSidecar } from "./sidecar";
import { canonicalValueKey } from "./field-values";
import { DEFAULT_METADATA_SCHEMA } from "./default-metadata-schema";
import type {
  Project,
  MetadataSchema,
  MetadataGroup,
  MetadataField,
  MetadataFieldType,
  MetadataValue,
  ProjectFeatureFlags,
  UUID,
} from "./types";

// ─── Type migration types ─────────────────────────────────────────────────────

export interface TypeMigrationEntry {
  action: "keep" | "clear" | "normalize";
  /** The replacement value when action is "normalize". */
  normalizedTo?: string;
}

export interface OptionsMigrationEntry {
  action: "keep" | "clear" | "normalize" | "add-to-options";
  /** The replacement value when action is "normalize". */
  normalizedTo?: string;
}

const SLUG_RE = /^[a-z0-9-]+$/;

async function readProject(projectRoot: string): Promise<Project> {
  const p = path.join(projectRoot, PROJECT_FILENAME);
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as Project;
}

async function writeProject(
  projectRoot: string,
  project: Project,
): Promise<void> {
  const p = path.join(projectRoot, PROJECT_FILENAME);
  if (!project.config) {
    project.config = { editorConfig: {} };
  }
  project.config.metadataRevision = (project.config.metadataRevision ?? 0) + 1;
  await fs.writeFile(p, JSON.stringify(project, null, 2), "utf8");
}

function getOrInitSchema(project: Project): MetadataSchema {
  if (!project.config) {
    project.config = { editorConfig: {} };
  }
  if (!project.config.metadataSchema) {
    // Deep-clone so mutations in this function don't corrupt the constant.
    project.config.metadataSchema = structuredClone(DEFAULT_METADATA_SCHEMA);
  }
  return project.config.metadataSchema;
}

function findGroup(schema: MetadataSchema, groupId: string): MetadataGroup {
  const group = schema.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`Group not found: "${groupId}"`);
  return group;
}

function allFieldKeys(schema: MetadataSchema): string[] {
  return schema.groups.flatMap((g) => g.fields.map((f) => f.key));
}

/**
 * Upgrades any `resource-ref` field with `multiple: true` to `multi-resource-ref`
 * and removes the now-redundant `multiple` property.
 *
 * Returns the (possibly mutated) schema and a `changed` flag. Safe to call on
 * already-migrated schemas — idempotent.
 */
function migrateMultipleToMultiRef(schema: MetadataSchema): {
  schema: MetadataSchema;
  changed: boolean;
} {
  let changed = false;
  const groups = schema.groups.map((group) => {
    const fields = group.fields.map((field) => {
      if (field.type === "resource-ref" && field.multiple === true) {
        changed = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { multiple: _removed, ...rest } = field;
        return { ...rest, type: "multi-resource-ref" as const };
      }
      return field;
    });
    return { ...group, fields };
  });
  return { schema: { ...schema, groups }, changed };
}

// ─── Locked-builtin / feature-flag migration ──────────────────────────────────

/**
 * Built-in field keys that older projects persisted with `locked: true` and that
 * the load-time migration unlocks. `status` is intentionally excluded — it stays
 * locked.
 */
const UNLOCK_BUILTIN_KEYS = new Set<string>([
  "synopsis",
  "notes",
  "pov",
  "storyDate",
  "storyDuration",
  "storyEndDate",
]);

const STORY_TIMELINE_GROUP_ID = "builtin-story-timeline";
const STORY_TIMELINE_GROUP_LABEL = "Timeline";

/**
 * Maps each feature toggle to the field keys whose stored presence seeds it on
 * during the one-time load migration.
 */
const FEATURE_FIELD_KEYS: Record<keyof ProjectFeatureFlags, readonly string[]> =
  {
    timeline: ["storyDate", "storyDuration", "storyEndDate"],
    pov: ["pov"],
    synopsis: ["synopsis"],
    notes: ["notes"],
  };

/**
 * Strips `locked` from the previously-locked built-in fields (everything except
 * `status`) and renames the story-timeline group's label to "Timeline". Safe to
 * call repeatedly — returns `changed: false` once the schema is already
 * migrated.
 */
function migrateLockedBuiltins(schema: MetadataSchema): {
  schema: MetadataSchema;
  changed: boolean;
} {
  let changed = false;
  const groups = schema.groups.map((group) => {
    let groupChanged = false;
    const fields = group.fields.map((field) => {
      if (field.locked && UNLOCK_BUILTIN_KEYS.has(field.key)) {
        groupChanged = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { locked: _removed, ...rest } = field;
        return rest;
      }
      return field;
    });
    const needsRename =
      group.id === STORY_TIMELINE_GROUP_ID &&
      group.label !== STORY_TIMELINE_GROUP_LABEL;
    if (needsRename) groupChanged = true;
    if (!groupChanged) return group;
    changed = true;
    return {
      ...group,
      ...(needsRename ? { label: STORY_TIMELINE_GROUP_LABEL } : {}),
      fields,
    };
  });
  return changed
    ? { schema: { ...schema, groups }, changed }
    : { schema, changed };
}

/**
 * Applies every idempotent schema migration in order: the legacy
 * `resource-ref { multiple: true }` upgrade, then the locked-builtin unlock and
 * group rename. Returns `changed: false` when the schema is already current.
 */
function applySchemaMigrations(schema: MetadataSchema): {
  schema: MetadataSchema;
  changed: boolean;
} {
  const multi = migrateMultipleToMultiRef(schema);
  const unlocked = migrateLockedBuiltins(multi.schema);
  return {
    schema: unlocked.schema,
    changed: multi.changed || unlocked.changed,
  };
}

/**
 * Treats `undefined`, `null`, blank strings, and empty arrays as "no value".
 * Numbers (including 0), booleans, ref objects, and non-empty collections count.
 */
function hasStoredValue(value: MetadataValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Reports whether a sidecar holds a meaningful value for `key`. Metadata field
 * values live under `userMetadata` (the query evaluator flattens them only at
 * read time), so detection deliberately ignores top-level keys — that avoids a
 * false positive from the unrelated top-level resource `notes` field.
 */
function userMetadataHasValue(
  sidecar: Record<string, MetadataValue>,
  key: string,
): boolean {
  const userMeta = sidecar.userMetadata;
  if (
    userMeta === null ||
    typeof userMeta !== "object" ||
    Array.isArray(userMeta)
  ) {
    return false;
  }
  return hasStoredValue((userMeta as Record<string, MetadataValue>)[key]);
}

/**
 * Scans every sidecar in `meta/` and returns which feature toggles should be
 * seeded on — a toggle is on when any sidecar holds a value for one of the
 * feature's field keys. Missing `meta/` yields an empty result.
 */
async function detectFeatureDataFromSidecars(
  projectRoot: string,
): Promise<ProjectFeatureFlags> {
  const detected: ProjectFeatureFlags = {};
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return detected;
  }
  const featureEntries = Object.entries(FEATURE_FIELD_KEYS) as [
    keyof ProjectFeatureFlags,
    readonly string[],
  ][];
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const resourceId = entry.slice(
      "resource-".length,
      -".meta.json".length,
    ) as UUID;
    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar) continue;
    for (const [feature, keys] of featureEntries) {
      if (detected[feature]) continue;
      if (keys.some((k) => userMetadataHasValue(sidecar, k))) {
        detected[feature] = true;
      }
    }
    if (featureEntries.every(([feature]) => detected[feature])) break;
  }
  return detected;
}

/**
 * One-time, idempotent migration run when a project is loaded from disk:
 *
 * 1. Unlocks the previously-locked built-in fields and renames the story-timeline
 *    group label to "Timeline" (when a schema is persisted; never materializes a
 *    default schema for projects that rely on `DEFAULT_METADATA_SCHEMA`).
 * 2. Seeds `config.features` exactly once — when it is absent — turning each
 *    toggle on for any feature whose field keys already hold stored values.
 *
 * Sidecar values are never modified. The project is written (bumping
 * `metadataRevision` a single time) only when something actually changed, so
 * repeat loads are no-ops. The write happens under the project lock.
 */
export async function migrateProjectOnLoad(
  projectRoot: string,
): Promise<Project> {
  const initial = await readProject(projectRoot);
  const needsSeed = initial.config?.features === undefined;
  // Scan outside the lock — sidecar reads are independent of the project file.
  const seeded = needsSeed
    ? await detectFeatureDataFromSidecars(projectRoot)
    : undefined;

  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    if (!project.config) project.config = { editorConfig: {} };
    let changed = false;

    if (project.config.metadataSchema) {
      const result = applySchemaMigrations(project.config.metadataSchema);
      if (result.changed) {
        project.config.metadataSchema = result.schema;
        changed = true;
      }
    }

    if (project.config.features === undefined && seeded !== undefined) {
      project.config.features = seeded;
      changed = true;
    }

    if (changed) {
      await writeProject(projectRoot, project);
    }
    return project;
  } finally {
    release();
  }
}

/**
 * Returns the current metadata schema for a project, or `{ groups: [] }` if
 * none has been stored yet.
 *
 * Automatically applies the idempotent schema migrations (legacy `resource-ref`
 * `multiple: true` → `multi-resource-ref`, plus the locked-builtin unlock and
 * group rename) and persists the change — under the project lock — so subsequent
 * reads see the canonical form.
 */
export async function getSchema(projectRoot: string): Promise<MetadataSchema> {
  const project = await readProject(projectRoot);
  const raw = project.config?.metadataSchema ?? { groups: [] };
  const first = applySchemaMigrations(raw);
  if (!first.changed) return first.schema;

  // A migration is needed — persist it under the project lock. Re-read inside
  // the lock so a concurrent writer is not clobbered, then re-apply.
  const release = await acquireLock(projectRoot);
  try {
    const fresh = await readProject(projectRoot);
    if (!fresh.config?.metadataSchema) return first.schema;
    const result = applySchemaMigrations(fresh.config.metadataSchema);
    if (result.changed) {
      fresh.config.metadataSchema = result.schema;
      await writeProject(projectRoot, fresh);
    }
    return result.schema;
  } finally {
    release();
  }
}

/**
 * Appends a new field to an existing group.
 *
 * Throws if:
 * - `field.key` is not a valid URL-safe slug (`/^[a-z0-9-]+$/`)
 * - `field.key` already exists anywhere in the schema
 * - the target group does not exist
 */
export async function addField(
  projectRoot: string,
  groupId: string,
  field: MetadataField,
): Promise<MetadataSchema> {
  if (!SLUG_RE.test(field.key)) {
    throw new Error(
      `Invalid field key: "${field.key}". Must match /^[a-z0-9-]+$/`,
    );
  }
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    if (allFieldKeys(schema).includes(field.key)) {
      throw new Error(`Field key already exists: "${field.key}"`);
    }
    const group = findGroup(schema, groupId);
    group.fields.push(field);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Removes an unlocked field from a group.
 *
 * Throws if:
 * - the group does not exist
 * - the field does not exist in the group
 * - the field has `locked: true`
 */
export async function removeField(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked) {
      throw new Error(`Cannot remove locked field: "${fieldKey}"`);
    }
    group.fields = group.fields.filter((f) => f.key !== fieldKey);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Marks a field as deprecated by setting `deprecated: true`.
 *
 * Deprecated fields are hidden from the metadata sidebar but remain queryable
 * in the chip UI (with a muted badge). Sidecar values are preserved untouched.
 *
 * Throws if:
 * - the group does not exist
 * - the field does not exist in the group
 * - the field has `locked: true`
 */
export async function deprecateField(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked) {
      throw new Error(`Cannot deprecate locked field: "${fieldKey}"`);
    }
    field.deprecated = true;
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

async function clearFieldFromSidecars(
  projectRoot: string,
  fieldKey: string,
): Promise<void> {
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const resourceId = entry.slice(
      "resource-".length,
      -".meta.json".length,
    ) as UUID;
    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar || !(fieldKey in sidecar)) continue;
    delete sidecar[fieldKey];
    await writeSidecar(projectRoot, resourceId, sidecar);
  }
}

/**
 * Removes a field from the schema and deletes its key from every sidecar
 * project-wide. The schema update runs under the project lock; sidecar
 * migration runs after the lock is released.
 *
 * This is a destructive, irreversible operation — all stored values for the
 * field key are permanently deleted.
 *
 * Throws if:
 * - the group does not exist
 * - the field does not exist in the group
 * - the field has `locked: true`
 */
export async function clearField(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const schema = await removeField(projectRoot, groupId, fieldKey);
  await clearFieldFromSidecars(projectRoot, fieldKey);
  return schema;
}

/**
 * Reorders the fields within a group to match `newKeyOrder`.
 *
 * `newKeyOrder` must contain exactly the same keys as the group's current
 * fields — no additions or omissions are permitted.
 *
 * Throws if the group does not exist or if `newKeyOrder` does not match the
 * existing field set.
 */
export async function reorderFields(
  projectRoot: string,
  groupId: string,
  newKeyOrder: string[],
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const fieldMap = new Map(group.fields.map((f) => [f.key, f]));
    if (
      newKeyOrder.length !== group.fields.length ||
      newKeyOrder.some((k) => !fieldMap.has(k))
    ) {
      throw new Error(
        "newKeyOrder must contain exactly the existing field keys",
      );
    }
    group.fields = newKeyOrder.map((k) => fieldMap.get(k)!);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Updates the display label of a field. The field key is immutable — use the
 * schema manager's rename-key flow (with orphan warning) for that operation.
 *
 * Throws if the group or field does not exist.
 */
export async function renameField(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newLabel: string,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    field.label = newLabel;
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Replaces the `options` array on a `select` or `multiselect` field.
 *
 * Throws if the group or field does not exist.
 */
export async function updateFieldOptions(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  options: string[],
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    field.options = options;
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Appends a new group to the schema.
 *
 * Throws if a group with the same `id` already exists. Initialises
 * `config.metadataSchema` if the project has none yet.
 */
export async function addGroup(
  projectRoot: string,
  group: MetadataGroup,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    if (schema.groups.some((g) => g.id === group.id)) {
      throw new Error(`Group ID already exists: "${group.id}"`);
    }
    schema.groups.push(group);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Removes a group by ID, along with all of its fields.
 *
 * Throws if the group does not exist.
 */
export async function removeGroup(
  projectRoot: string,
  groupId: string,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    if (!schema.groups.some((g) => g.id === groupId)) {
      throw new Error(`Group not found: "${groupId}"`);
    }
    schema.groups = schema.groups.filter((g) => g.id !== groupId);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Reorders the groups to match `newGroupIdOrder`.
 *
 * `newGroupIdOrder` must contain exactly the same IDs as the current groups —
 * no additions or omissions are permitted.
 *
 * Throws if any ID is unrecognised or the count differs.
 */
export async function reorderGroups(
  projectRoot: string,
  newGroupIdOrder: string[],
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const groupMap = new Map(schema.groups.map((g) => [g.id, g]));
    if (
      newGroupIdOrder.length !== schema.groups.length ||
      newGroupIdOrder.some((id) => !groupMap.has(id))
    ) {
      throw new Error(
        "newGroupIdOrder must contain exactly the existing group IDs",
      );
    }
    schema.groups = newGroupIdOrder.map((id) => groupMap.get(id)!);
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

async function migrateFieldKeyInSidecars(
  projectRoot: string,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const resourceId = entry.slice(
      "resource-".length,
      -".meta.json".length,
    ) as UUID;
    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar || !(oldKey in sidecar)) continue;
    sidecar[newKey] = sidecar[oldKey];
    delete sidecar[oldKey];
    await writeSidecar(projectRoot, resourceId, sidecar);
  }
}

async function renameFieldKeyInSchema(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newKey: string,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    if (allFieldKeys(schema).includes(newKey)) {
      throw new Error(`Field key already exists: "${newKey}"`);
    }
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked)
      throw new Error(`Cannot rename key of locked field: "${fieldKey}"`);
    field.key = newKey;
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Partial update bag for `updateRefProperties`. Each key is independently
 * optional:
 * - Omitting a key (or passing `undefined`) leaves the existing value unchanged.
 * - Passing `null` clears the property from the field.
 * - Passing a value sets the property to that value.
 */
export interface RefPropertyUpdates {
  /** Scopes autocomplete to a specific folder. `null` clears the scope. */
  refFolder?: string | null;
  /** Extends scope to descendant folders when `refFolder` is set. `null` clears. */
  includeSubfolders?: boolean | null;
  /** Maximum selections allowed; `null` makes the field unbounded again. */
  maxSelections?: number | null;
}

/**
 * Patches `refFolder`, `includeSubfolders`, and `maxSelections` on a
 * `multi-resource-ref` field. Each property is independently optional —
 * omitting it leaves the existing value unchanged; passing `null` clears it.
 *
 * Throws if the group or field does not exist, or if the field is locked.
 */
export async function updateRefProperties(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  updates: RefPropertyUpdates,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked) {
      throw new Error(
        `Cannot update ref properties of locked field: "${fieldKey}"`,
      );
    }
    if (updates.refFolder !== undefined) {
      if (updates.refFolder === null) delete field.refFolder;
      else field.refFolder = updates.refFolder;
    }
    if (updates.includeSubfolders !== undefined) {
      if (updates.includeSubfolders === null) delete field.includeSubfolders;
      else field.includeSubfolders = updates.includeSubfolders;
    }
    if (updates.maxSelections !== undefined) {
      if (updates.maxSelections === null) delete field.maxSelections;
      else field.maxSelections = updates.maxSelections;
    }
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

/**
 * Changes the type of a field. When switching away from `select`/`multiselect`,
 * the `options` array is preserved on disk so it can be recovered if the user
 * switches back.
 *
 * Throws if the group or field does not exist, or if the field is locked.
 */
export async function changeFieldType(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newType: MetadataFieldType,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  try {
    const project = await readProject(projectRoot);
    const schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked)
      throw new Error(`Cannot change type of locked field: "${fieldKey}"`);
    field.type = newType;
    await writeProject(projectRoot, project);
    return schema;
  } finally {
    release();
  }
}

async function migrateFieldTypeInSidecars(
  projectRoot: string,
  fieldKey: string,
  migrations: Record<string, TypeMigrationEntry>,
): Promise<void> {
  if (Object.keys(migrations).length === 0) return;
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const resourceId = entry.slice(
      "resource-".length,
      -".meta.json".length,
    ) as UUID;
    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar || !(fieldKey in sidecar) || sidecar[fieldKey] === null)
      continue;
    const key = canonicalValueKey(sidecar[fieldKey] as MetadataValue);
    const migration = migrations[key];
    if (!migration || migration.action === "keep") continue;
    if (migration.action === "clear") {
      delete sidecar[fieldKey];
    } else if (
      migration.action === "normalize" &&
      migration.normalizedTo !== undefined
    ) {
      sidecar[fieldKey] = migration.normalizedTo;
    }
    await writeSidecar(projectRoot, resourceId, sidecar);
  }
}

/**
 * Changes a field's type and atomically migrates sidecar values according to
 * the provided resolution map, then updates the schema under `acquireLock`.
 *
 * For `select` / `multiselect` types, `newOptions` replaces (or initialises)
 * `field.options`. For all other types, `field.options` is removed.
 *
 * Each entry in `migrations` is keyed by `canonicalValueKey(value)`:
 * - `"keep"` — leave the sidecar value unchanged
 * - `"clear"` — delete the field key from the sidecar
 * - `"normalize"` — replace the value with `entry.normalizedTo`
 *
 * Throws if the group or field does not exist, or if the field is locked.
 */
export async function changeFieldTypeWithMigration(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newType: MetadataFieldType,
  newOptions: string[],
  migrations: Record<string, TypeMigrationEntry>,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  let schema: MetadataSchema;
  try {
    const project = await readProject(projectRoot);
    schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.locked)
      throw new Error(`Cannot change type of locked field: "${fieldKey}"`);
    field.type = newType;
    if (newType === "select" || newType === "multiselect") {
      field.options = newOptions;
    } else {
      delete field.options;
    }
    await writeProject(projectRoot, project);
  } finally {
    release();
  }
  await migrateFieldTypeInSidecars(projectRoot, fieldKey, migrations);
  return schema;
}

/**
 * Renames the key of a field in the schema and migrates all sidecar values
 * that reference the old key to the new key project-wide.
 *
 * The schema update runs under the project lock. Sidecar migration runs after
 * the lock is released — if migration fails partially, existing sidecar values
 * remain under the old key (now orphaned).
 *
 * Throws if:
 * - `newKey` is not a valid URL-safe slug (`/^[a-z0-9-]+$/`)
 * - `newKey` already exists in the schema
 * - the group or field does not exist
 * - the field has `locked: true`
 */
export async function renameFieldKey(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newKey: string,
): Promise<MetadataSchema> {
  if (!SLUG_RE.test(newKey)) {
    throw new Error(
      `Invalid field key: "${newKey}". Must match /^[a-z0-9-]+$/`,
    );
  }
  const schema = await renameFieldKeyInSchema(
    projectRoot,
    groupId,
    fieldKey,
    newKey,
  );
  await migrateFieldKeyInSidecars(projectRoot, fieldKey, newKey);
  return schema;
}

async function migrateFieldOptionsInSidecars(
  projectRoot: string,
  fieldKey: string,
  migrations: Record<string, OptionsMigrationEntry>,
  fieldType: MetadataFieldType,
): Promise<void> {
  if (Object.keys(migrations).length === 0) return;
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json"))
      continue;
    const resourceId = entry.slice(
      "resource-".length,
      -".meta.json".length,
    ) as UUID;
    const sidecar = await readSidecar(projectRoot, resourceId);
    if (!sidecar || !(fieldKey in sidecar) || sidecar[fieldKey] === null)
      continue;

    if (fieldType === "multiselect" && Array.isArray(sidecar[fieldKey])) {
      const arr = sidecar[fieldKey] as string[];
      let changed = false;
      const newArr: string[] = [];
      for (const element of arr) {
        const migration = migrations[element];
        if (
          !migration ||
          migration.action === "keep" ||
          migration.action === "add-to-options"
        ) {
          newArr.push(element);
        } else if (
          migration.action === "normalize" &&
          migration.normalizedTo !== undefined
        ) {
          newArr.push(migration.normalizedTo);
          changed = true;
        } else if (migration.action === "clear") {
          changed = true;
        }
      }
      if (!changed) continue;
      if (newArr.length === 0) {
        delete sidecar[fieldKey];
      } else {
        sidecar[fieldKey] = newArr;
      }
      await writeSidecar(projectRoot, resourceId, sidecar);
    } else {
      const key = canonicalValueKey(sidecar[fieldKey] as MetadataValue);
      const migration = migrations[key];
      if (
        !migration ||
        migration.action === "keep" ||
        migration.action === "add-to-options"
      )
        continue;
      if (migration.action === "clear") {
        delete sidecar[fieldKey];
      } else if (
        migration.action === "normalize" &&
        migration.normalizedTo !== undefined
      ) {
        sidecar[fieldKey] = migration.normalizedTo;
      }
      await writeSidecar(projectRoot, resourceId, sidecar);
    }
  }
}

/**
 * Updates a `select` or `multiselect` field's options list and atomically
 * migrates sidecar values for any orphaned option values, then writes the
 * schema under `acquireLock`.
 *
 * Entries in `migrations` are keyed by orphaned option value string:
 * - `"keep"` — leave the sidecar value unchanged
 * - `"clear"` — for select: delete the field key; for multiselect: remove the element
 * - `"normalize"` — replace with `entry.normalizedTo`
 * - `"add-to-options"` — leave unchanged; the value is appended to `newOptions`
 *
 * Throws if the field does not exist or is not a select/multiselect type.
 */
export async function updateFieldOptionsWithMigration(
  projectRoot: string,
  groupId: string,
  fieldKey: string,
  newOptions: string[],
  migrations: Record<string, OptionsMigrationEntry>,
): Promise<MetadataSchema> {
  const release = await acquireLock(projectRoot);
  let schema: MetadataSchema;
  let fieldType: MetadataFieldType;
  try {
    const project = await readProject(projectRoot);
    schema = getOrInitSchema(project);
    const group = findGroup(schema, groupId);
    const field = group.fields.find((f) => f.key === fieldKey);
    if (!field) throw new Error(`Field not found: "${fieldKey}"`);
    if (field.type !== "select" && field.type !== "multiselect") {
      throw new Error(
        `Field "${fieldKey}" is not a select or multiselect field.`,
      );
    }
    fieldType = field.type;
    const addToOptionsValues = Object.entries(migrations)
      .filter(([, m]) => m.action === "add-to-options")
      .map(([v]) => v);
    field.options = [...newOptions, ...addToOptionsValues];
    await writeProject(projectRoot, project);
  } finally {
    release();
  }
  await migrateFieldOptionsInSidecars(
    projectRoot,
    fieldKey,
    migrations,
    fieldType,
  );
  return schema;
}

const metadataSchema = {
  getSchema,
  addField,
  removeField,
  deprecateField,
  clearField,
  reorderFields,
  renameField,
  updateFieldOptions,
  updateFieldOptionsWithMigration,
  updateRefProperties,
  changeFieldType,
  changeFieldTypeWithMigration,
  addGroup,
  removeGroup,
  reorderGroups,
  renameFieldKey,
};

export default metadataSchema;
