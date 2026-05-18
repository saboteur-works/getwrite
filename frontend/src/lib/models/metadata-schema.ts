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
import type {
    Project,
    MetadataSchema,
    MetadataGroup,
    MetadataField,
    MetadataValue,
    UUID,
} from "./types";

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
    await fs.writeFile(p, JSON.stringify(project, null, 2), "utf8");
}

function getOrInitSchema(project: Project): MetadataSchema {
    if (!project.config) {
        project.config = { editorConfig: {} };
    }
    if (!project.config.metadataSchema) {
        project.config.metadataSchema = { groups: [] };
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
 * Returns the current metadata schema for a project, or `{ groups: [] }` if
 * none has been stored yet.
 */
export async function getSchema(projectRoot: string): Promise<MetadataSchema> {
    const project = await readProject(projectRoot);
    return project.config?.metadataSchema ?? { groups: [] };
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
        if (!entry.startsWith("resource-") || !entry.endsWith(".meta.json")) continue;
        const resourceId = entry.slice("resource-".length, -".meta.json".length) as UUID;
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
        if (field.locked) throw new Error(`Cannot rename key of locked field: "${fieldKey}"`);
        field.key = newKey;
        await writeProject(projectRoot, project);
        return schema;
    } finally {
        release();
    }
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
    const schema = await renameFieldKeyInSchema(projectRoot, groupId, fieldKey, newKey);
    await migrateFieldKeyInSidecars(projectRoot, fieldKey, newKey);
    return schema;
}

const metadataSchema = {
    getSchema,
    addField,
    removeField,
    reorderFields,
    renameField,
    updateFieldOptions,
    addGroup,
    removeGroup,
    reorderGroups,
    renameFieldKey,
};

export default metadataSchema;
