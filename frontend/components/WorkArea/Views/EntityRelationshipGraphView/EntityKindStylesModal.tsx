"use client";

/**
 * @module EntityKindStylesModal
 *
 * Feature 69, Task 6: the dedicated kind-to-color/shape customization modal
 * (FR-3), structurally modeled on `TagsManagerModal.tsx` — a header, a main
 * row list, and a form-like editing affordance per row — but NOT a redesign
 * of that component (an explicit non-goal). This modal is self-contained: it
 * owns its own `Dialog` overlay (mirroring `ImportDocxDialog.tsx`'s
 * `isOpen`/`onClose`-controlled standalone pattern) rather than assuming a
 * host like `ProjectSettingsDialog.tsx` already provides one, since nothing
 * in the graph view currently does. Task 7 only needs to render this
 * component with `isOpen` wired to its own open/close state and does not
 * need to exist for this component to be built, tested, or demoed in
 * Storybook.
 *
 * Two sections (OQ-4):
 * - The main row list is driven by every `entityKind` EVER persisted to
 *   `meta/entity-graph-kind-styles.json` (Task 2/4's
 *   `getEntityGraphKindStyles`), not merely kinds currently in use. Each row's
 *   color and shape selects persist immediately on change (FR-4), mirroring
 *   `EntityGraphSettingsPanel.tsx`'s no-separate-Save-action convention for an
 *   already-configured value.
 * - The "new/unmapped" section is computed live from `declaredEntityKinds`
 *   (the project's currently-declared entities' `entityKind` values, as
 *   already assembled by `EntityRelationshipGraphView.tsx`'s node list) minus
 *   whatever is already in the main row list. Each entry shows Task 5's
 *   deterministic fallback style as its current rendering, plus the same
 *   color/shape pickers, but requires an explicit "Save style" action — there
 *   is nothing yet to "change immediately" the way a configured row has, and
 *   OQ-4's own text calls for this to be "explicit and actionable" rather
 *   than silently relying on the fallback. On save, the returned record is
 *   merged into local state, which moves the kind out of this section and
 *   into the main row list with no reload (OQ-4).
 *
 * Both sections' pickers are hard-constrained: the color select only ever
 * offers Task 2's eight persistable `entity-kind-0`..`entity-kind-7` token
 * slots (never the neutral `entity-kind-default` fallback slot, which is not
 * itself a valid persisted value, and never an arbitrary/hex value), and the
 * shape select only ever offers Task 1's fixed six-shape set.
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../common/UI/Dialog";
import Button from "../../../common/UI/Button";
import Select from "../../../common/UI/Select";
import {
  getEntityGraphKindStyles,
  saveEntityGraphKindStyle,
  type EntityGraphKindColorSlot,
  type EntityGraphKindStyleRecord,
} from "../../../../src/lib/api/entity-graph-kind-styles";
import { ENTITY_KIND_COLOR_SLOTS } from "./entityKindShapes";
import {
  getEntityKindFallbackStyle,
  ENTITY_KIND_DEFAULT_COLOR_SLOT,
} from "../../../../src/lib/models/entity-kind-fallback-style";
import { toastService } from "../../../../src/lib/toast-service";
import {
  ENTITY_KIND_SHAPE_NAMES,
  getEntityKindShapeGeometry,
  type EntityKindShapeName,
} from "./entityKindShapes";

export interface EntityKindStylesModalProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Server-validated id of the active project (directory basename). */
  projectId: string;
  /**
   * Every `entityKind` currently carried by a declared entity in this
   * project (e.g. `EntityRelationshipGraphView`'s own node list, mapped to
   * `entityKind`). Duplicates are expected and deduplicated internally — this
   * prop is not required to be pre-deduplicated by the caller.
   */
  declaredEntityKinds: string[];
  onClose: () => void;
  /**
   * Feature 69, Task 7: invoked after a style save succeeds (either a
   * configured-row edit or a new/unmapped "Save style" action), so the host
   * view can re-fetch its own `kindStyles` state and pass the refreshed
   * array down to `EntityGraphCanvas` — without this, a save here would only
   * reach the canvas after a reload (FR-4). Optional so this modal remains
   * usable (e.g. in Storybook) without a host that cares about the refresh.
   */
  onStylesChanged?: (saved: EntityGraphKindStyleRecord) => void;
}

const FIRST_COLOR_SLOT: EntityGraphKindColorSlot = ENTITY_KIND_COLOR_SLOTS[0];

/** A readable 1-based label for a color token slot, e.g. `"entity-kind-0"` -> `"Color 1"`. */
function colorSlotLabel(slot: EntityGraphKindColorSlot): string {
  const index = ENTITY_KIND_COLOR_SLOTS.indexOf(slot);
  return `Color ${index + 1}`;
}

function shapeLabel(shape: EntityKindShapeName): string {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

/**
 * A readable label for any persisted-or-fallback color-slot reference,
 * including the neutral `entity-kind-default` fallback slot (Task 5) that
 * `colorSlotLabel` above doesn't cover, since that slot is never a valid
 * persisted value and never offered by `ColorSelect`.
 */
function legendColorLabel(colorSlot: string): string {
  if (colorSlot === ENTITY_KIND_DEFAULT_COLOR_SLOT) return "Default color";
  const index = ENTITY_KIND_COLOR_SLOTS.indexOf(
    colorSlot as EntityGraphKindColorSlot,
  );
  return index === -1 ? colorSlot : `Color ${index + 1}`;
}

/** Resolves a persisted token-slot reference to its CSS custom property. */
function colorVar(slot: string): string {
  return `var(--${slot})`;
}

/**
 * Renders one of Task 1's six fixed shapes, filled with a color resolved
 * live from a `--entity-kind-*` CSS custom property — never a JS-side hex
 * literal (matching Task 8's own constraint for the canvas).
 */
function ShapeIcon({
  shape,
  colorSlot,
  size = 20,
}: {
  shape: EntityKindShapeName;
  colorSlot: string;
  size?: number;
}): JSX.Element {
  const boundingRadius = size / 2 - 1;
  const geometry = getEntityKindShapeGeometry(shape, boundingRadius);
  const half = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-half} ${-half} ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      {geometry.kind === "circle" ? (
        <circle
          cx={0}
          cy={0}
          r={geometry.radius}
          style={{ fill: colorVar(colorSlot) }}
        />
      ) : (
        <path d={geometry.d} style={{ fill: colorVar(colorSlot) }} />
      )}
    </svg>
  );
}

function ColorSwatch({ colorSlot }: { colorSlot: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-5 flex-shrink-0 rounded-sm border border-gw-border"
      style={{ backgroundColor: colorVar(colorSlot) }}
    />
  );
}

function ColorSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: EntityGraphKindColorSlot;
  disabled: boolean;
  onChange: (value: EntityGraphKindColorSlot) => void;
}): JSX.Element {
  return (
    <Select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange(event.target.value as EntityGraphKindColorSlot)
      }
    >
      {ENTITY_KIND_COLOR_SLOTS.map((slot) => (
        <option key={slot} value={slot}>
          {colorSlotLabel(slot)}
        </option>
      ))}
    </Select>
  );
}

function ShapeSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: EntityKindShapeName;
  disabled: boolean;
  onChange: (value: EntityKindShapeName) => void;
}): JSX.Element {
  return (
    <Select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as EntityKindShapeName)}
    >
      {ENTITY_KIND_SHAPE_NAMES.map((shape) => (
        <option key={shape} value={shape}>
          {shapeLabel(shape)}
        </option>
      ))}
    </Select>
  );
}

/**
 * `EntityKindStylesModal` — see the module doc comment above for the full
 * account of its two sections and their differing persist behavior.
 */
export default function EntityKindStylesModal({
  isOpen,
  projectId,
  declaredEntityKinds,
  onClose,
  onStylesChanged,
}: EntityKindStylesModalProps): JSX.Element {
  const [records, setRecords] = React.useState<
    EntityGraphKindStyleRecord[] | null
  >(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savingKinds, setSavingKinds] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [unmappedDraftColor, setUnmappedDraftColor] = React.useState<
    Record<string, EntityGraphKindColorSlot>
  >({});
  const [unmappedDraftShape, setUnmappedDraftShape] = React.useState<
    Record<string, EntityKindShapeName>
  >({});

  const loadStyles = React.useCallback(async () => {
    try {
      const loaded = await getEntityGraphKindStyles(projectId);
      setRecords(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to load entity kind styles.",
      );
    }
  }, [projectId]);

  // Reloads every time the modal opens, rather than only once ever — unlike
  // `EntityGraphSettingsPanel`'s lazy-load-once pattern, the set of declared
  // entity kinds driving the "new/unmapped" section can change between
  // openings (a writer may declare a new entity kind, close the modal, then
  // reopen it), and a stale `records` snapshot would misclassify a kind that
  // was configured in the meantime.
  React.useEffect(() => {
    if (isOpen) {
      void loadStyles();
    }
  }, [isOpen, loadStyles]);

  const configuredKinds = React.useMemo(
    () =>
      [...(records ?? [])].sort((a, b) =>
        a.entityKind.localeCompare(b.entityKind),
      ),
    [records],
  );

  const newUnmappedKinds = React.useMemo(() => {
    if (records === null) return [];
    const configuredSet = new Set(records.map((record) => record.entityKind));
    const unique = new Set(
      declaredEntityKinds.filter((kind) => !configuredSet.has(kind)),
    );
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [records, declaredEntityKinds]);

  const persistKindStyle = React.useCallback(
    async (
      kind: string,
      color: EntityGraphKindColorSlot,
      shape: EntityKindShapeName,
    ) => {
      setSavingKinds((prev) => new Set(prev).add(kind));
      setRowErrors((prev) => {
        if (!(kind in prev)) return prev;
        const next = { ...prev };
        delete next[kind];
        return next;
      });
      try {
        const saved = await saveEntityGraphKindStyle(
          projectId,
          kind,
          color,
          shape,
        );
        setRecords((prev) => [
          ...(prev ?? []).filter((record) => record.entityKind !== kind),
          saved,
        ]);
        setUnmappedDraftColor((prev) => {
          if (!(kind in prev)) return prev;
          const next = { ...prev };
          delete next[kind];
          return next;
        });
        setUnmappedDraftShape((prev) => {
          if (!(kind in prev)) return prev;
          const next = { ...prev };
          delete next[kind];
          return next;
        });
        onStylesChanged?.(saved);
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to save the entity kind style.";
        setRowErrors((prev) => ({ ...prev, [kind]: message }));
        toastService.error(`Could not save the style for "${kind}".`);
      } finally {
        setSavingKinds((prev) => {
          const next = new Set(prev);
          next.delete(kind);
          return next;
        });
      }
    },
    [projectId, onStylesChanged],
  );

  const legendKinds = React.useMemo(() => {
    const seen = new Set<string>();
    const entries: {
      kind: string;
      color: string;
      shape: EntityKindShapeName;
    }[] = [];
    for (const record of configuredKinds) {
      if (seen.has(record.entityKind)) continue;
      seen.add(record.entityKind);
      entries.push({
        kind: record.entityKind,
        color: record.color,
        shape: record.shape,
      });
    }
    for (const kind of newUnmappedKinds) {
      if (seen.has(kind)) continue;
      seen.add(kind);
      const fallback = getEntityKindFallbackStyle(kind);
      entries.push({ kind, color: fallback.color, shape: fallback.shape });
    }
    return entries.sort((a, b) => a.kind.localeCompare(b.kind));
  }, [configuredKinds, newUnmappedKinds]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent maxWidth="max-w-[640px]" className="p-6">
        <DialogTitle>Entity kind colors and shapes</DialogTitle>
        <DialogDescription className="mb-4">
          Choose a color and shape each entity kind on the relationship graph. A
          kind with no choice made yet is represented by a default color and an
          automatically assigned shape.
        </DialogDescription>

        {loadError ? (
          <p role="alert" className="text-sm font-medium text-gw-primary">
            {loadError}
          </p>
        ) : records === null ? (
          <p role="status" className="text-sm text-gw-secondary">
            Loading entity kind styles…
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gw-primary">
                Configured kinds
              </h3>
              {configuredKinds.length === 0 ? (
                <p className="text-sm text-gw-secondary">
                  No entity kind has been customized yet.
                </p>
              ) : (
                <ul
                  className="flex flex-col gap-2"
                  data-testid="configured-kind-rows"
                >
                  {configuredKinds.map((record) => {
                    const isSaving = savingKinds.has(record.entityKind);
                    const rowError = rowErrors[record.entityKind];
                    const colorId = `entity-kind-style-color-${record.entityKind}`;
                    const shapeId = `entity-kind-style-shape-${record.entityKind}`;
                    return (
                      <li
                        key={record.entityKind}
                        className="flex flex-col gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                        data-testid={`configured-kind-row-${record.entityKind}`}
                      >
                        <div className="flex items-center gap-3">
                          <ColorSwatch colorSlot={record.color} />
                          <ShapeIcon
                            shape={record.shape}
                            colorSlot={record.color}
                          />
                          <span className="flex-1 text-sm font-medium text-gw-primary">
                            {record.entityKind}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label
                            htmlFor={colorId}
                            className="text-sm text-gw-secondary"
                          >
                            Color
                          </label>
                          <ColorSelect
                            id={colorId}
                            label={`${record.entityKind} color`}
                            value={record.color}
                            disabled={isSaving}
                            onChange={(color) =>
                              void persistKindStyle(
                                record.entityKind,
                                color,
                                record.shape,
                              )
                            }
                          />
                          <label
                            htmlFor={shapeId}
                            className="text-sm text-gw-secondary"
                          >
                            Shape
                          </label>
                          <ShapeSelect
                            id={shapeId}
                            label={`${record.entityKind} shape`}
                            value={record.shape}
                            disabled={isSaving}
                            onChange={(shape) =>
                              void persistKindStyle(
                                record.entityKind,
                                record.color,
                                shape,
                              )
                            }
                          />
                        </div>
                        {rowError ? (
                          <p
                            role="alert"
                            className="text-sm font-medium text-gw-primary"
                          >
                            {rowError}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-gw-primary">
                New / unmapped kinds
              </h3>
              {newUnmappedKinds.length === 0 ? (
                <p className="text-sm text-gw-secondary">
                  Every entity kind currently in use has a configured style.
                </p>
              ) : (
                <ul
                  className="flex flex-col gap-2"
                  data-testid="unmapped-kind-rows"
                >
                  {newUnmappedKinds.map((kind) => {
                    const fallback = getEntityKindFallbackStyle(kind);
                    const draftColor =
                      unmappedDraftColor[kind] ?? FIRST_COLOR_SLOT;
                    const draftShape =
                      unmappedDraftShape[kind] ?? fallback.shape;
                    const isSaving = savingKinds.has(kind);
                    const rowError = rowErrors[kind];
                    const colorId = `entity-kind-style-new-color-${kind}`;
                    const shapeId = `entity-kind-style-new-shape-${kind}`;
                    return (
                      <li
                        key={kind}
                        className="flex flex-col gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome2 px-3 py-2"
                        data-testid={`unmapped-kind-row-${kind}`}
                      >
                        <div className="flex items-center gap-3">
                          <ColorSwatch colorSlot={fallback.color} />
                          <ShapeIcon
                            shape={fallback.shape}
                            colorSlot={fallback.color}
                          />
                          <span className="flex-1 text-sm font-medium text-gw-primary">
                            {kind}
                          </span>
                          <span className="text-xs text-gw-secondary">
                            Using default style
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label
                            htmlFor={colorId}
                            className="text-sm text-gw-secondary"
                          >
                            Color
                          </label>
                          <ColorSelect
                            id={colorId}
                            label={`${kind} color`}
                            value={draftColor}
                            disabled={isSaving}
                            onChange={(color) =>
                              setUnmappedDraftColor((prev) => ({
                                ...prev,
                                [kind]: color,
                              }))
                            }
                          />
                          <label
                            htmlFor={shapeId}
                            className="text-sm text-gw-secondary"
                          >
                            Shape
                          </label>
                          <ShapeSelect
                            id={shapeId}
                            label={`${kind} shape`}
                            value={draftShape}
                            disabled={isSaving}
                            onChange={(shape) =>
                              setUnmappedDraftShape((prev) => ({
                                ...prev,
                                [kind]: shape,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isSaving}
                            onClick={() =>
                              void persistKindStyle(
                                kind,
                                draftColor,
                                draftShape,
                              )
                            }
                          >
                            {isSaving ? "Saving…" : "Save style"}
                          </Button>
                        </div>
                        {rowError ? (
                          <p
                            role="alert"
                            className="text-sm font-medium text-gw-primary"
                          >
                            {rowError}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-gw-primary">
                Legend
              </h3>
              <p className="mb-2 text-sm text-gw-secondary">
                Every kind currently in use in this project, with its color and
                shape (including kinds that are still using the default style).
              </p>
              {legendKinds.length === 0 ? (
                <p className="text-sm text-gw-secondary">
                  No entity kind is in use in this project yet.
                </p>
              ) : (
                <ul
                  className="flex flex-col gap-1"
                  data-testid="entity-kind-styles-legend"
                >
                  {legendKinds.map((entry) => (
                    <li
                      key={entry.kind}
                      className="flex items-center gap-3"
                      data-testid={`entity-kind-styles-legend-row-${entry.kind}`}
                    >
                      <ShapeIcon shape={entry.shape} colorSlot={entry.color} />
                      <span className="text-sm text-gw-primary">
                        {entry.kind}
                      </span>
                      <span className="text-xs text-gw-secondary">
                        {legendColorLabel(entry.color)},{" "}
                        {shapeLabel(entry.shape)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
