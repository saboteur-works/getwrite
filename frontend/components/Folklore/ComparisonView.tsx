"use client";

import React from "react";
import ComparisonColumn from "./ComparisonColumn";
import { COMPARISON_COLUMN_LIMIT } from "./comparisonLimit";
import {
  useVariantTexts,
  type VariantTextsDeps,
  type VariantTextEntry,
} from "./useVariantTexts";
import useViewportTier from "../../src/lib/hooks/useViewportTier";
import {
  readFolkloreSelection,
  resolveFolkloreSelection,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import {
  COMPARISON_PHONE_MESSAGE,
  type ComparisonColumnLimit,
} from "../../src/lib/models/folklore-types";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";

/**
 * @module ComparisonView
 *
 * Feature 110 (FR-12, FR-17, FR-18, FR-22): the read-only side-by-side
 * comparison. It owns the chosen variants, restores them from the per-device
 * remembered selection, reads the chosen variants through `useVariantTexts`
 * and lays one `ComparisonColumn` per chosen variant. There is no write
 * control for a variant, field, tag or list and no difference markup.
 *
 * - The remembered selection is written only when the writer changes the
 *   selection here, never on open, scroll or close.
 * - A selection over the column limit is refused with a message that states
 *   the limit and is never silently shortened. With the limit `null` (not yet
 *   measured) nothing is refused and no limit is stated.
 * - At phone width the fixed message replaces the columns and no read is
 *   started; the selection is kept across the 768 px boundary.
 */

/** A variant of the picked narrative that can be chosen for comparison. */
export interface ComparisonVariant {
  id: string;
  name: string;
  fields: VariantFieldDescription[];
}

export interface ComparisonViewProps {
  /** The open project's directory id, or null when none is open. */
  projectId: string | null;
  /** The picked narrative folder id, stored with the selection. */
  narrativeId: string | null;
  /** The picked narrative's variants today. */
  variants: readonly ComparisonVariant[];
  /** Overrides the column limit (a test passes 3); defaults to the constant. */
  limit?: ComparisonColumnLimit;
  /** Called with the new selection after the writer changes it. */
  onSelectionChange?: (variantIds: readonly string[]) => void;
  /** Test seam for the reads. */
  deps?: VariantTextsDeps;
}

interface InitialSelection {
  ids: string[];
  lostCount: number;
}

function restoreSelection(
  projectId: string | null,
  narrativeId: string | null,
  variants: readonly ComparisonVariant[],
): InitialSelection {
  if (
    projectId === null ||
    narrativeId === null ||
    typeof window === "undefined"
  ) {
    return { ids: [], lostCount: 0 };
  }
  const read = readFolkloreSelection(projectId);
  if (read.status !== "stored" || read.selection.narrativeId !== narrativeId) {
    return { ids: [], lostCount: 0 };
  }
  const resolved = resolveFolkloreSelection(
    read.selection,
    variants.map((v) => v.id),
  );
  return {
    ids: resolved.selection.variantIds,
    lostCount: resolved.lostVariantIds.length,
  };
}

function limitMessage(limit: number): string {
  return `At most ${limit} variants can be compared at once. Deselect a variant to change the selection.`;
}

function lostMessage(count: number): string {
  return count === 1
    ? "1 remembered variant is no longer in this narrative and was left out of the selection."
    : `${count} remembered variants are no longer in this narrative and were left out of the selection.`;
}

function ColumnsGrid({
  projectId,
  chosen,
  entries,
}: {
  projectId: string;
  chosen: readonly ComparisonVariant[];
  entries: readonly VariantTextEntry[];
}): React.ReactElement {
  return (
    <div
      data-testid="comparison-columns"
      className="grid gap-2 overflow-x-auto"
      style={{
        gridTemplateColumns: `repeat(${chosen.length}, minmax(18rem, 1fr))`,
      }}
    >
      {chosen.map((variant) => {
        const entry = entries.find((e) => e.id === variant.id);
        return (
          <ComparisonColumn
            key={variant.id}
            projectId={projectId}
            resourceId={variant.id}
            name={variant.name}
            fields={variant.fields}
            content={
              entry?.content ?? { kind: "unreadable", reason: "Not read." }
            }
            audio={entry?.audio ?? { kind: "none" }}
          />
        );
      })}
    </div>
  );
}

/** The comparison: a chooser, then one column per chosen variant. */
export default function ComparisonView(
  props: ComparisonViewProps,
): React.ReactElement {
  const { projectId, narrativeId, variants, onSelectionChange, deps } = props;
  const limit =
    props.limit === undefined ? COMPARISON_COLUMN_LIMIT : props.limit;
  const [initial] = React.useState<InitialSelection>(() =>
    restoreSelection(projectId, narrativeId, variants),
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>(initial.ids);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const tier = useViewportTier();
  // The tier starts at "desktop" before mount; reads wait one commit so a
  // phone is known before any read can start.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => setHasMounted(true), []);

  const isPhone = tier === "phone";
  const chosen = selectedIds
    .map((id) => variants.find((v) => v.id === id))
    .filter((v): v is ComparisonVariant => v !== undefined);
  const liveLostCount = selectedIds.length - chosen.length;
  const isOverLimit = limit !== null && chosen.length > limit;
  const chosenIds = chosen.map((v) => v.id);
  const texts = useVariantTexts({
    projectId,
    variantIds: chosenIds,
    enabled: hasMounted && !isPhone && !isOverLimit,
    deps,
  });

  const change = (next: string[]): void => {
    setSelectedIds(next);
    if (projectId !== null) {
      writeFolkloreSelection(projectId, { narrativeId, variantIds: next });
    }
    onSelectionChange?.(next);
  };

  const toggle = (id: string): void => {
    if (selectedIds.includes(id)) {
      setRefusal(null);
      change(selectedIds.filter((s) => s !== id));
      return;
    }
    if (limit !== null && selectedIds.length >= limit) {
      setRefusal(limitMessage(limit));
      return;
    }
    setRefusal(null);
    change([...selectedIds, id]);
  };

  if (isPhone) {
    return (
      <section aria-label="Comparison">
        <p>{COMPARISON_PHONE_MESSAGE}</p>
      </section>
    );
  }

  const lostCount = initial.lostCount + liveLostCount;
  const refusalText =
    refusal ?? (isOverLimit && limit !== null ? limitMessage(limit) : null);

  return (
    <section aria-label="Comparison" className="flex min-w-0 flex-col gap-2">
      <fieldset className="border border-gw-border p-2">
        <legend className="px-1 font-bold">Variants to compare</legend>
        {variants.length === 0 && <p>This narrative has no variants.</p>}
        {variants.map((variant) => (
          <label
            key={variant.id}
            className="mr-4 inline-flex items-center gap-1"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(variant.id)}
              onChange={() => toggle(variant.id)}
            />
            {variant.name}
          </label>
        ))}
      </fieldset>
      {lostCount > 0 && <p role="status">{lostMessage(lostCount)}</p>}
      {refusalText !== null && <p role="alert">{refusalText}</p>}
      {chosen.length < 2 && (
        <p>Choose two or more variants to compare them side by side.</p>
      )}
      <ColumnsBody
        projectId={projectId}
        chosen={chosen}
        texts={texts}
        isOverLimit={isOverLimit}
      />
    </section>
  );
}

function ColumnsBody({
  projectId,
  chosen,
  texts,
  isOverLimit,
}: {
  projectId: string | null;
  chosen: readonly ComparisonVariant[];
  texts: ReturnType<typeof useVariantTexts>;
  isOverLimit: boolean;
}): React.ReactElement | null {
  if (isOverLimit || chosen.length === 0) return null;
  if (texts.status === "locked") {
    return (
      <p role="status">
        This project is locked, so the variants cannot be shown. Unlock the
        project to compare them.
      </p>
    );
  }
  if (texts.status !== "ready") {
    return <p role="status">Reading the chosen variants.</p>;
  }
  return (
    <ColumnsGrid
      projectId={projectId ?? ""}
      chosen={chosen}
      entries={texts.variants}
    />
  );
}
