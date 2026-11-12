/**
 * @module organizer-field-write-core
 *
 * Field-write core for the Organizer grid (Feature 109, FR-7, FR-8, FR-13;
 * OQ-6, OQ-19). Sets named `userMetadata` keys and `resourceSubtype` for one
 * resource inside one `mutateSidecar` write, so a two-field drop is one write
 * and the merge is computed from the sidecar read inside the lock (no wholesale
 * replacement of `userMetadata`).
 *
 * - Validation of the payload shape and of every value against the project's
 *   status list, subtype list and metadata schema happens before any lock.
 *   Only `config` is read (no lock) to do so.
 * - A refusal is a result (`ok: false`) whose message is fixed text and echoes
 *   no client input. A gone resource throws {@link ResourceGoneError}; a
 *   locked-access error and every other failure propagate unchanged.
 * - Only the named keys change. `orderIndex`, `folderId`, `entityKind`,
 *   `aliases`, `wordCountGoal` and every unnamed `userMetadata` key are kept.
 * - The project root comes from a validated `projectId`; no path is accepted.
 *
 * No React, JSX, JSON import or `node:*`: reachable from the CLI and workers.
 */
import {
  isFieldVisibleForSubtype,
  isLabelInList,
  normalizeSubtypeLabel,
} from "./field-subtype-scope";
import { DEFAULT_METADATA_SCHEMA } from "./default-metadata-schema";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { PROJECT_FILENAME } from "./project-config";
import { readFile } from "./io";
import { resolveProjectRoot } from "./project-root-resolver";
import { isResourceId } from "./resource-id";
import { ResourceGoneError } from "./resource-gone-error";
import {
  MetadataSchemaSchema,
  MetadataValue as MetadataValueSchema,
} from "./schemas";
import {
  SIDECAR_UNCHANGED,
  mutateSidecar,
  type SidecarMutation,
} from "./sidecar";
import type {
  OrganizerFieldChange,
  OrganizerFieldTarget,
  OrganizerFieldWriteInput,
  OrganizerFieldWriteRefusalReason,
  OrganizerFieldWriteResult,
} from "./organizer-grid-types";
import type { MetadataField, MetadataSchema, MetadataValue } from "./types";

export type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteResult,
} from "./organizer-grid-types";

/** Most changes one write may carry (one per axis plus headroom). */
export const ORGANIZER_FIELD_WRITE_MAX_CHANGES = 10;

/** Longest field key accepted. */
const MAX_FIELD_KEY_LENGTH = 200;

const RESERVED_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

/** Fixed refusal texts: none carries any part of the input. */
const MESSAGES: Record<OrganizerFieldWriteRefusalReason, string> = {
  "invalid-input": "The change is not valid.",
  "unknown-field": "That field is not available for this project.",
  "value-not-in-list": "That value is not one of the field's choices.",
  "subtype-not-in-list": "That subtype is not in the project's subtype list.",
  "field-out-of-subtype-scope":
    "That field does not apply to this document's subtype.",
  "field-locked": "That field cannot be edited here.",
  "max-selections-exceeded": "That is more selections than the field allows.",
};

/** The slice of `project.json` `config` the write is validated against. */
interface WriteConfig {
  statuses: string[];
  subtypes: string[];
  schema: MetadataSchema;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Reads the status list, subtype list and metadata schema from `project.json`
 * without a lock. `normalizeProjectConfig` drops `metadataSchema`, so the raw
 * file is read; a project with no stored schema uses the built-in one, as the
 * sidebar does. A read failure (locked access included) propagates.
 */
async function readWriteConfig(projectRoot: string): Promise<WriteConfig> {
  const raw = await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  const parsed = JSON.parse(raw) as { config?: Record<string, unknown> };
  const config = parsed.config ?? {};
  const schema = MetadataSchemaSchema.safeParse(config.metadataSchema);
  return {
    statuses: stringList(config.statuses),
    subtypes: stringList(config.subtypes),
    schema: schema.success
      ? (schema.data as MetadataSchema)
      : DEFAULT_METADATA_SCHEMA,
  };
}

/** Keys of the built-in fields; their legacy `locked` flag is not a refusal. */
const BUILT_IN_KEYS: ReadonlySet<string> = new Set(
  DEFAULT_METADATA_SCHEMA.groups.flatMap((g) => g.fields.map((f) => f.key)),
);

/** A refusal raised from inside the sidecar write; nothing has been written. */
class OrganizerFieldRefusal extends Error {
  constructor(readonly reason: OrganizerFieldWriteRefusalReason) {
    super(MESSAGES[reason]);
    this.name = "OrganizerFieldRefusal";
  }
}

function refuse(
  reason: OrganizerFieldWriteRefusalReason,
): Extract<OrganizerFieldWriteResult, { ok: false }> {
  return { ok: false, reason, message: MESSAGES[reason] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseTarget(raw: unknown): OrganizerFieldTarget | null {
  if (!isPlainObject(raw)) return null;
  if (raw.kind === "status" || raw.kind === "subtype") {
    return hasOnlyKeys(raw, ["kind"]) ? { kind: raw.kind } : null;
  }
  if (raw.kind !== "field" || !hasOnlyKeys(raw, ["kind", "key"])) return null;
  const key = raw.key;
  if (
    typeof key !== "string" ||
    key.trim() === "" ||
    key.length > MAX_FIELD_KEY_LENGTH ||
    key === "status" ||
    RESERVED_KEYS.includes(key)
  ) {
    return null;
  }
  return { kind: "field", key };
}

function parseChange(raw: unknown): OrganizerFieldChange | null {
  if (!isPlainObject(raw) || !hasOnlyKeys(raw, ["target", "op", "value"])) {
    return null;
  }
  const target = parseTarget(raw.target);
  if (target === null) return null;
  if (raw.op === "clear") {
    return "value" in raw ? null : { target, op: "clear" };
  }
  if (raw.op !== "set" || !("value" in raw)) return null;
  const parsed = MetadataValueSchema.safeParse(raw.value);
  if (!parsed.success) return null;
  return { target, op: "set", value: parsed.data as MetadataValue };
}

function targetId(target: OrganizerFieldTarget): string {
  return target.kind === "field" ? `field:${target.key}` : target.kind;
}

/** Shape check of the whole payload; `null` when it is malformed. */
function parseInput(payload: unknown): OrganizerFieldWriteInput | null {
  if (
    !isPlainObject(payload) ||
    !hasOnlyKeys(payload, ["resourceId", "changes"])
  ) {
    return null;
  }
  const { resourceId, changes } = payload;
  if (!isResourceId(resourceId) || !Array.isArray(changes)) return null;
  if (
    changes.length < 1 ||
    changes.length > ORGANIZER_FIELD_WRITE_MAX_CHANGES
  ) {
    return null;
  }
  const parsed: OrganizerFieldChange[] = [];
  const seen = new Set<string>();
  for (const raw of changes) {
    const change = parseChange(raw);
    if (change === null) return null;
    const id = targetId(change.target);
    if (seen.has(id)) return null;
    seen.add(id);
    parsed.push(change);
  }
  return { resourceId, changes: parsed };
}

function isRef(value: unknown): value is { id: string; name: string } {
  return (
    isPlainObject(value) &&
    hasOnlyKeys(value, ["id", "name"]) &&
    typeof value.id === "string" &&
    value.id !== "" &&
    typeof value.name === "string"
  );
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** A select/multiselect value against the field's own options. */
function checkOptionValue(
  field: MetadataField,
  value: MetadataValue,
): OrganizerFieldWriteRefusalReason | null {
  const options = field.options ?? [];
  if (field.type === "select") {
    if (typeof value !== "string") return "invalid-input";
    return options.includes(value) ? null : "value-not-in-list";
  }
  if (!isStringList(value)) return "invalid-input";
  if (new Set(value).size !== value.length) return "invalid-input";
  return value.every((v) => options.includes(v)) ? null : "value-not-in-list";
}

/** A reference field's value shape and selection limit. */
function checkRefValue(
  field: MetadataField,
  value: MetadataValue,
): OrganizerFieldWriteRefusalReason | null {
  const isList = field.type === "multi-resource-ref" || field.multiple === true;
  if (!isList) return isRef(value) ? null : "invalid-input";
  if (!Array.isArray(value) || !(value as unknown[]).every(isRef)) {
    return "invalid-input";
  }
  const max = field.maxSelections;
  if (max !== undefined && value.length > max) return "max-selections-exceeded";
  return null;
}

/** A set value against the field's type, as the sidebar's control would allow. */
function checkFieldValue(
  field: MetadataField,
  value: MetadataValue,
): OrganizerFieldWriteRefusalReason | null {
  switch (field.type) {
    case "text":
    case "date":
      return typeof value === "string" ? null : "invalid-input";
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : "invalid-input";
    case "boolean":
      return typeof value === "boolean" ? null : "invalid-input";
    case "select":
    case "multiselect":
      return checkOptionValue(field, value);
    case "resource-ref":
    case "multi-resource-ref":
      return checkRefValue(field, value);
    default:
      return "invalid-input";
  }
}

function findField(
  config: WriteConfig,
  key: string,
): MetadataField | undefined {
  for (const group of config.schema.groups) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

/** A validated change with the value to store resolved (subtype spelling). */
type ResolvedChange =
  | { target: OrganizerFieldTarget; op: "clear"; field?: MetadataField }
  | {
      target: OrganizerFieldTarget;
      op: "set";
      value: MetadataValue;
      field?: MetadataField;
    };

function resolveSet(
  config: WriteConfig,
  target: OrganizerFieldTarget,
  value: MetadataValue,
): ResolvedChange | OrganizerFieldWriteRefusalReason {
  if (target.kind === "status") {
    if (typeof value !== "string") return "invalid-input";
    return config.statuses.includes(value)
      ? { target, op: "set", value }
      : "value-not-in-list";
  }
  if (target.kind === "subtype") {
    if (typeof value !== "string" || value.trim() === "")
      return "invalid-input";
    const list = config.subtypes;
    if (!isLabelInList(value, list)) return "subtype-not-in-list";
    const key = normalizeSubtypeLabel(value);
    const spelled = list.find(
      (s) => normalizeSubtypeLabel(s) === key,
    ) as string;
    return { target, op: "set", value: spelled };
  }
  return "invalid-input";
}

function resolveFieldChange(
  config: WriteConfig,
  change: OrganizerFieldChange,
): ResolvedChange | OrganizerFieldWriteRefusalReason {
  const { target } = change;
  if (target.kind !== "field") {
    return change.op === "clear"
      ? { target, op: "clear" }
      : resolveSet(config, target, change.value);
  }
  const field = findField(config, target.key);
  if (!field || field.deprecated === true) return "unknown-field";
  if (field.locked === true && !BUILT_IN_KEYS.has(target.key))
    return "field-locked";
  if (change.op === "clear") return { target, op: "clear", field };
  const refusal = checkFieldValue(field, change.value);
  return refusal ?? { target, op: "set", value: change.value, field };
}

/** Validates every change against the project config; the first refusal wins. */
function resolveChanges(
  config: WriteConfig,
  changes: OrganizerFieldChange[],
): ResolvedChange[] | OrganizerFieldWriteRefusalReason {
  const resolved: ResolvedChange[] = [];
  for (const change of changes) {
    const result = resolveFieldChange(config, change);
    if (typeof result === "string") return result;
    resolved.push(result);
  }
  return resolved;
}

/** The subtype the document will have once the write lands. */
function effectiveSubtype(
  stored: Record<string, MetadataValue>,
  changes: ResolvedChange[],
): string | undefined {
  const change = changes.find((c) => c.target.kind === "subtype");
  if (change) return change.op === "set" ? (change.value as string) : undefined;
  return typeof stored.resourceSubtype === "string"
    ? stored.resourceSubtype
    : undefined;
}

function applyChanges(
  stored: Record<string, MetadataValue>,
  changes: ResolvedChange[],
): Record<string, MetadataValue> {
  const subtype = effectiveSubtype(stored, changes);
  const rawMeta = stored.userMetadata;
  if (rawMeta !== undefined && !isPlainObject(rawMeta)) {
    throw new Error("Stored userMetadata is not an object");
  }
  const userMetadata: Record<string, MetadataValue> = {
    ...((rawMeta as Record<string, MetadataValue> | undefined) ?? {}),
  };
  const next: Record<string, MetadataValue> = { ...stored };
  for (const change of changes) {
    const { target } = change;
    if (target.kind === "subtype") {
      if (change.op === "set") next.resourceSubtype = change.value;
      else delete next.resourceSubtype;
      continue;
    }
    const key = target.kind === "status" ? "status" : target.key;
    if (change.op === "clear") {
      delete userMetadata[key];
      continue;
    }
    if (
      change.field &&
      !isFieldVisibleForSubtype(key, change.field.appliesTo, subtype)
    ) {
      throw new OrganizerFieldRefusal("field-out-of-subtype-scope");
    }
    userMetadata[key] = change.value;
  }
  if (rawMeta !== undefined || Object.keys(userMetadata).length > 0) {
    next.userMetadata = userMetadata;
  }
  return next;
}

/**
 * Applies one field write to one resource of the project named by `projectId`.
 *
 * Returns a refusal result for a malformed payload or an invalid value, with
 * nothing written. One `mutateSidecar` write carries every change; when the
 * result equals what is stored, nothing is written.
 *
 * @throws InvalidProjectIdCoreError for a malformed project id.
 * @throws ResourceGoneError when the resource has no live sidecar.
 * @throws Locked-access errors and any read or write failure, unchanged.
 */
export async function setOrganizerFieldsCore(
  projectId: string,
  input: OrganizerFieldWriteInput,
): Promise<OrganizerFieldWriteResult> {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  const parsed = parseInput(input);
  if (parsed === null) return refuse("invalid-input");
  const config = await readWriteConfig(projectRoot);
  const resolved = resolveChanges(config, parsed.changes);
  if (typeof resolved === "string") return refuse(resolved);
  try {
    await mutateSidecar(
      projectRoot,
      parsed.resourceId,
      (stored): SidecarMutation => {
        if (stored === null) throw new ResourceGoneError(parsed.resourceId);
        const next = applyChanges(stored, resolved);
        return JSON.stringify(next) === JSON.stringify(stored)
          ? SIDECAR_UNCHANGED
          : next;
      },
    );
  } catch (err) {
    if (err instanceof OrganizerFieldRefusal) return refuse(err.reason);
    throw err;
  }
  return { ok: true, resourceId: parsed.resourceId };
}
