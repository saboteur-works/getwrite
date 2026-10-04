/**
 * @module entity-graph-kind-styles
 *
 * Persistence for the per-project `entityKind` -> color-slot/shape style
 * mapping (Feature 69, Task 2), stored at `meta/entity-graph-kind-styles.json`
 * — a new sibling to `meta/entity-graph-positions.json`. Mirrors
 * `entity-graph-positions.ts`'s whole-file-load/persist shape exactly: a
 * single JSON array, loaded and rewritten in full on every mutation, guarded
 * end-to-end by `withMetaLock` so a read-modify-write sequence (including the
 * upsert check) cannot interleave with a concurrent one.
 *
 * A style record is keyed by `entityKind` (one record per kind — `entityKind`
 * is unique across the array). An upsert replaces any existing record for the
 * same `entityKind` rather than appending a duplicate, exactly mirroring
 * `saveEntityGraphPosition`'s own filter-then-append upsert pattern.
 *
 * The persisted `color` field is deliberately a **token-slot reference**, not
 * a raw hex string: a stable identifier (`"entity-kind-0"` through
 * `"entity-kind-7"`) naming one of Task 1's `--entity-kind-*` CSS custom
 * property slots (`frontend/styles/getwrite-utilities.css`). Persisting a
 * slot name rather than a hex value means a kind's rendered color always
 * resolves through the live CSS custom property — including picking up a
 * future palette/theme change — rather than freezing a snapshot hex value at
 * save time. `EntityGraphKindColorSlotSchema` enforces this at the boundary:
 * a `#rrggbb`/`#rgb`-shaped string is rejected, not merely discouraged.
 *
 * The `shape` field is drawn from Task 1's fixed six-shape set
 * (`ENTITY_KIND_SHAPE_NAMES`, `entityKindShapes.ts`) and is not redeclared
 * here — the Zod enum is built directly from that exported tuple so the two
 * can never drift apart.
 */
import path from "node:path";
import { z } from "zod";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { ENTITY_KIND_SHAPE_NAMES } from "../../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";

const META_DIR = "meta";
const KIND_STYLES_FILE = "entity-graph-kind-styles.json";

/** The fixed token-slot names Task 1 defines in `getwrite-utilities.css`. */
export const ENTITY_KIND_COLOR_SLOTS = [
  "entity-kind-0",
  "entity-kind-1",
  "entity-kind-2",
  "entity-kind-3",
  "entity-kind-4",
  "entity-kind-5",
  "entity-kind-6",
  "entity-kind-7",
] as const;

export type EntityGraphKindColorSlot = (typeof ENTITY_KIND_COLOR_SLOTS)[number];

/**
 * The color field's schema: a strict enum of the known token-slot names
 * rather than a free-form string-plus-regex-refinement, since the enum alone
 * already rejects a `#rrggbb`/`#rgb`-shaped (or any other arbitrary) string
 * without needing a separate hex-pattern check.
 */
export const EntityGraphKindColorSlotSchema = z.enum(ENTITY_KIND_COLOR_SLOTS);

/**
 * The shape field's schema, built from Task 1's exported
 * `ENTITY_KIND_SHAPE_NAMES` tuple rather than a redeclared literal list, so
 * this schema can never fall out of sync with the six-shape set it draws
 * from.
 */
export const EntityGraphKindShapeSchema = z.enum(ENTITY_KIND_SHAPE_NAMES);

/**
 * One kind's persisted color-slot/shape style mapping. `entityKind` is the
 * raw, user-definable kind string (e.g. `"character"`), matching the same
 * open-string convention `EntitySidecarFieldsSchema.entityKind` uses.
 */
export const EntityGraphKindStyleRecordSchema = z.object({
  entityKind: z.string().min(1),
  color: EntityGraphKindColorSlotSchema,
  shape: EntityGraphKindShapeSchema,
});

export type EntityGraphKindStyleRecord = z.infer<
  typeof EntityGraphKindStyleRecordSchema
>;

const EntityGraphKindStylesFileSchema = z.array(
  EntityGraphKindStyleRecordSchema,
);

function kindStylesFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, KIND_STYLES_FILE);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

/**
 * Loads every persisted entity-kind style record for a project.
 *
 * Returns `[]` when `meta/entity-graph-kind-styles.json` does not exist yet
 * (ENOENT) — mirrors `loadEntityGraphPositions`'s ENOENT tolerance. A file
 * that exists but fails to parse as JSON or fails
 * {@link EntityGraphKindStyleRecordSchema} validation is a distinct failure —
 * a hand-corrupted file, not an absent one — and this function rethrows
 * rather than silently returning `[]` or an unvalidated shape
 * (boundary-validation floor, `docs/standards/security.md`,
 * `docs/standards/failure-visibility.md`).
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @throws {Error} If the file exists but is not valid JSON.
 * @throws {import("zod").ZodError} If the file exists but does not match
 *   `EntityGraphKindStyleRecordSchema` (including a hex-shaped `color` or a
 *   `shape` outside the fixed six-shape set).
 */
export async function loadEntityGraphKindStyles(
  projectRoot: string,
): Promise<EntityGraphKindStyleRecord[]> {
  const p = kindStylesFilePath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  return EntityGraphKindStylesFileSchema.parse(parsed);
}

async function persistEntityGraphKindStyles(
  projectRoot: string,
  records: EntityGraphKindStyleRecord[],
): Promise<void> {
  // Validate at write time too (boundary-validation floor) — a caller bug
  // must fail loudly here rather than persist a malformed record.
  const validated = EntityGraphKindStylesFileSchema.parse(records);
  await mkdir(path.join(projectRoot, META_DIR), { recursive: true });
  const p = kindStylesFilePath(projectRoot);
  await atomicWriteFile(p, JSON.stringify(validated, null, 2), {
    writeOptions: "utf8",
    durable: process.env.GETWRITE_DURABLE_META === "1",
  });
}

/**
 * Upserts a single kind's style record: replaces any existing record for
 * `entityKind`, or appends a new one if none exists yet — mirroring
 * `saveEntityGraphPosition`'s filter-then-append upsert pattern, which is
 * also how a duplicate `entityKind` on upsert is handled (the prior record is
 * replaced, never duplicated; the array is never left with two records
 * sharing the same `entityKind`).
 *
 * The entire read-modify-write sequence runs inside a single `withMetaLock`
 * call, so two concurrently-started saves for the same kind cannot
 * interleave.
 */
export async function upsertEntityGraphKindStyle(
  projectRoot: string,
  entityKind: string,
  color: EntityGraphKindColorSlot,
  shape: EntityGraphKindStyleRecord["shape"],
): Promise<EntityGraphKindStyleRecord> {
  return withMetaLock(projectRoot, async () => {
    const records = await loadEntityGraphKindStyles(projectRoot);
    const record: EntityGraphKindStyleRecord = { entityKind, color, shape };
    const next = [
      ...records.filter((existing) => existing.entityKind !== entityKind),
      record,
    ];
    await persistEntityGraphKindStyles(projectRoot, next);
    return record;
  });
}

const entityGraphKindStyles = {
  loadEntityGraphKindStyles,
  upsertEntityGraphKindStyle,
};
export default entityGraphKindStyles;
