/**
 * @module organizer-arrangements-core
 *
 * Per-arrangement add, rename and delete for the Organizer grid (Feature 109,
 * FR-14, FR-20; OQ-2, OQ-3). Each operation is one read-modify-write of
 * `project.json` inside `withMetaLock` plus `updateProjectJson`, so the list
 * is re-read under the lock and two interleaved calls both persist. Only
 * `config.organizerArrangements` is touched.
 *
 * - Input is validated before any lock or write by
 *   {@link validateOrganizerArrangementDraft} (also reused for seeded
 *   arrangements). Objects are strict: an unknown key is refused. A refusal is
 *   a result (`ok: false`) whose message is fixed text and echoes no client
 *   input; nothing is truncated or rewritten.
 * - Rows refuse `order` (Columns only). The stored Zod schema accepts it on
 *   both because the contract has one axis type, so this is the one check.
 * - An arrangement whose folder, query or field no longer exists is stored as
 *   written; availability is read-side and never rewrites it.
 * - A stored list that does not parse is not treated as empty: the operation
 *   throws and writes nothing. Locked-access errors propagate unchanged.
 * - The project root comes from a validated `projectId`; no path is accepted.
 *
 * No React, JSX, JSON import or `node:*`: reachable from the CLI and workers.
 */
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { resolveProjectRoot } from "./project-root-resolver";
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import { OrganizerArrangementListSchema, UUID } from "./schemas";
import { generateUUID } from "./uuid";
import {
  ORGANIZER_ARRANGEMENT_LIMIT,
  ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH,
  ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH,
  type OrganizerArrangement,
  type OrganizerArrangementAddInput,
  type OrganizerArrangementAddResult,
  type OrganizerArrangementDeleteInput,
  type OrganizerArrangementDeleteResult,
  type OrganizerArrangementDraft,
  type OrganizerArrangementRefusalReason,
  type OrganizerArrangementRenameInput,
  type OrganizerArrangementRenameResult,
  type OrganizerAxis,
  type OrganizerSource,
} from "./organizer-grid-types";
import type { ProjectConfig } from "./types";

/** Longest axis field key accepted. */
const MAX_FIELD_KEY_LENGTH = 200;

const RESERVED_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

/** Fixed refusal texts: none carries any part of the input. */
const MESSAGES: Record<OrganizerArrangementRefusalReason, string> = {
  "name-blank": "Give the arrangement a name.",
  "name-too-long": `The name can be at most ${ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH} characters.`,
  "name-duplicate": "Another arrangement already has that name.",
  "limit-reached": `A project can hold at most ${ORGANIZER_ARRANGEMENT_LIMIT} arrangements.`,
  "invalid-source": "The arrangement's source is not valid.",
  "invalid-axis": "The arrangement's rows or columns are not valid.",
  "invalid-id": "The arrangement id is not valid.",
  "not-found": "That arrangement no longer exists.",
  "invalid-input": "The arrangement is not valid.",
};

/** A candidate was refused before any write. Carries the fixed message only. */
export class OrganizerArrangementRefusalError extends Error {
  constructor(readonly reason: OrganizerArrangementRefusalReason) {
    super(MESSAGES[reason]);
    this.name = "OrganizerArrangementRefusalError";
  }
}

type Refusal = Extract<OrganizerArrangementAddResult, { ok: false }>;

function refuse(reason: OrganizerArrangementRefusalReason): Refusal {
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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.safeParse(value).success;
}

/** Trimmed name, or throws a name refusal. */
function validateName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new OrganizerArrangementRefusalError("invalid-input");
  }
  const name = raw.trim();
  if (name.length < ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH) {
    throw new OrganizerArrangementRefusalError("name-blank");
  }
  if (name.length > ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH) {
    throw new OrganizerArrangementRefusalError("name-too-long");
  }
  return name;
}

function validateSource(raw: unknown): OrganizerSource {
  const invalid = new OrganizerArrangementRefusalError("invalid-source");
  if (!isPlainObject(raw)) throw invalid;
  if (raw.kind === "folder") {
    if (!hasOnlyKeys(raw, ["kind", "folderId", "scope"])) throw invalid;
    if (!isUuid(raw.folderId)) throw invalid;
    if (raw.scope !== "children" && raw.scope !== "descendants") throw invalid;
    return { kind: "folder", folderId: raw.folderId, scope: raw.scope };
  }
  if (raw.kind === "smart-folder") {
    if (!hasOnlyKeys(raw, ["kind", "queryId"])) throw invalid;
    if (!isUuid(raw.queryId)) throw invalid;
    return { kind: "smart-folder", queryId: raw.queryId };
  }
  throw invalid;
}

function validateAxis(raw: unknown, allowOrder: boolean): OrganizerAxis {
  const invalid = new OrganizerArrangementRefusalError("invalid-axis");
  if (raw === "none") return "none";
  if (raw === "order") {
    if (!allowOrder) throw invalid;
    return "order";
  }
  if (!isPlainObject(raw)) throw invalid;
  if (raw.kind === "status" || raw.kind === "subtype") {
    if (!hasOnlyKeys(raw, ["kind"])) throw invalid;
    return { kind: raw.kind };
  }
  if (raw.kind !== "field" || !hasOnlyKeys(raw, ["kind", "key"])) throw invalid;
  const key = raw.key;
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > MAX_FIELD_KEY_LENGTH ||
    RESERVED_KEYS.includes(key)
  ) {
    throw invalid;
  }
  return { kind: "field", key };
}

/**
 * Validates a candidate arrangement (name, source, axes) without any lock and
 * returns a trimmed draft rebuilt from validated parts (no client object is
 * carried). Rows may not be `order`.
 *
 * @throws OrganizerArrangementRefusalError for any refusal; the message is
 *   fixed text.
 */
export function validateOrganizerArrangementDraft(
  input: unknown,
): OrganizerArrangementDraft {
  if (
    !isPlainObject(input) ||
    !hasOnlyKeys(input, ["name", "source", "rows", "columns"])
  ) {
    throw new OrganizerArrangementRefusalError("invalid-input");
  }
  const name = validateName(input.name);
  const source = validateSource(input.source);
  const rows = validateAxis(input.rows, false);
  const columns = validateAxis(input.columns, true);
  return { name, source, rows, columns };
}

function validateRenameInput(input: unknown): { id: string; name: string } {
  if (!isPlainObject(input) || !hasOnlyKeys(input, ["id", "name"])) {
    throw new OrganizerArrangementRefusalError("invalid-input");
  }
  if (!isUuid(input.id)) {
    throw new OrganizerArrangementRefusalError("invalid-id");
  }
  return { id: input.id, name: validateName(input.name) };
}

function validateDeleteInput(input: unknown): { id: string } {
  if (!isPlainObject(input) || !hasOnlyKeys(input, ["id"])) {
    throw new OrganizerArrangementRefusalError("invalid-input");
  }
  if (!isUuid(input.id)) {
    throw new OrganizerArrangementRefusalError("invalid-id");
  }
  return { id: input.id };
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/** Name compared under trim and case-fold. */
function foldName(name: string): string {
  return name.trim().toLowerCase();
}

/** The stored list; an unparseable one throws rather than reading as empty. */
function readStoredList(
  config: ProjectConfig | undefined,
): OrganizerArrangement[] {
  const stored = (config as Record<string, unknown> | undefined)
    ?.organizerArrangements;
  if (stored === undefined) return [];
  const parsed = OrganizerArrangementListSchema.safeParse(stored);
  if (!parsed.success) {
    throw new Error("The stored organizer arrangements could not be read.");
  }
  return parsed.data as OrganizerArrangement[];
}

type ListMutation<R> = (list: OrganizerArrangement[]) => {
  next?: OrganizerArrangement[];
  result: R;
};

/**
 * Re-reads the list inside the locks, applies `mutate` and writes only
 * `config.organizerArrangements` when `next` is returned.
 */
function mutateArrangements<R>(
  projectId: string,
  mutate: ListMutation<R>,
): Promise<R> {
  const projectRoot = requireProjectRoot(projectId);
  return withMetaLock(projectRoot, () =>
    updateProjectJson<R>(
      projectRoot,
      (project) => {
        const outcome = mutate(readStoredList(project.config));
        if (outcome.next === undefined) {
          return { result: outcome.result, shouldWrite: false };
        }
        project.config = {
          ...(project.config ?? {}),
          organizerArrangements: outcome.next,
        } as ProjectConfig;
        return { result: outcome.result };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    ),
  );
}

type Validated<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** Runs a validator, turning its refusal into a result. */
function validated<T>(validate: () => T): Validated<T> {
  try {
    return { ok: true, value: validate() };
  } catch (error) {
    if (error instanceof OrganizerArrangementRefusalError) {
      return { ok: false, refusal: refuse(error.reason) };
    }
    throw error;
  }
}

/**
 * Adds an arrangement to the project named by `projectId` and returns its new
 * id. The 51st is refused; a name equal to another's under trim and case-fold
 * is refused.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function addOrganizerArrangementCore(
  projectId: string,
  input: OrganizerArrangementAddInput,
): Promise<OrganizerArrangementAddResult> {
  const draft = validated(() => validateOrganizerArrangementDraft(input));
  if (!draft.ok) return draft.refusal;
  const id = generateUUID();
  return mutateArrangements<OrganizerArrangementAddResult>(
    projectId,
    (list) => {
      if (list.length >= ORGANIZER_ARRANGEMENT_LIMIT) {
        return { result: refuse("limit-reached") };
      }
      const folded = foldName(draft.value.name);
      if (list.some((a) => foldName(a.name) === folded)) {
        return { result: refuse("name-duplicate") };
      }
      const added: OrganizerArrangement = { id, ...draft.value };
      return { next: [...list, added], result: { ok: true, id } };
    },
  );
}

/**
 * Renames an arrangement of the project named by `projectId`. Renaming to the
 * same name in another case is allowed; equal to another arrangement's is not.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function renameOrganizerArrangementCore(
  projectId: string,
  input: OrganizerArrangementRenameInput,
): Promise<OrganizerArrangementRenameResult> {
  const parsed = validated(() => validateRenameInput(input));
  if (!parsed.ok) return parsed.refusal;
  const { id, name } = parsed.value;
  return mutateArrangements<OrganizerArrangementRenameResult>(
    projectId,
    (list) => {
      if (!list.some((a) => a.id === id)) {
        return { result: refuse("not-found") };
      }
      const folded = foldName(name);
      if (list.some((a) => a.id !== id && foldName(a.name) === folded)) {
        return { result: refuse("name-duplicate") };
      }
      return {
        next: list.map((a) => (a.id === id ? { ...a, name } : a)),
        result: { ok: true, id },
      };
    },
  );
}

/**
 * Deletes an arrangement of the project named by `projectId`.
 *
 * @throws InvalidProjectIdCoreError; locked-access errors are rethrown
 *   unchanged.
 */
export async function deleteOrganizerArrangementCore(
  projectId: string,
  input: OrganizerArrangementDeleteInput,
): Promise<OrganizerArrangementDeleteResult> {
  const parsed = validated(() => validateDeleteInput(input));
  if (!parsed.ok) return parsed.refusal;
  const { id } = parsed.value;
  return mutateArrangements<OrganizerArrangementDeleteResult>(
    projectId,
    (list) => {
      if (!list.some((a) => a.id === id)) {
        return { result: refuse("not-found") };
      }
      return {
        next: list.filter((a) => a.id !== id),
        result: { ok: true, id },
      };
    },
  );
}
