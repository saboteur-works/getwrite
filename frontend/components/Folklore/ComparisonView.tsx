"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import ComparisonColumn from "./ComparisonColumn";
import { COMPARISON_COLUMN_LIMIT } from "./comparisonLimit";
import {
  useVariantTexts,
  type VariantTextsDeps,
  type VariantTextEntry,
} from "./useVariantTexts";
import useViewportTier from "../../src/lib/hooks/useViewportTier";
import {
  COMPARISON_PHONE_MESSAGE,
  type ComparisonColumnLimit,
} from "../../src/lib/models/folklore-types";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";

/**
 * @module ComparisonView
 *
 * Feature 110 (FR-12, FR-17, FR-18, FR-22): the read-only side-by-side
 * comparison, shown by the Narratives tab in place of the list. The variants
 * are chosen only in the list (`selectedIds` arrives as a prop); this view has
 * no chooser, writes nothing (not even the remembered selection) and has no
 * write control for a variant, field, tag or list and no difference markup.
 *
 * - The heading takes focus when the view opens; "Back to list" calls
 *   `onBack`, and the caller returns focus to its Compare button.
 * - A selection over the column limit is refused with a message that states
 *   the limit and is never silently shortened. With the limit `null` (not yet
 *   measured) nothing is refused and no limit is stated.
 * - At phone width the fixed message replaces the columns and no read is
 *   started.
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
  /** The picked narrative's variants today. */
  variants: readonly ComparisonVariant[];
  /** Ids chosen in the list, in the order they are laid out. */
  selectedIds: readonly string[];
  /** Returns to the list ("Back to list"). */
  onBack?: () => void;
  /** Overrides the column limit (a test passes 3); defaults to the constant. */
  limit?: ComparisonColumnLimit;
  /** Test seam for the reads. */
  deps?: VariantTextsDeps;
}

function limitMessage(limit: number): string {
  return `At most ${limit} variants can be compared at once. Go back to the list and deselect a variant.`;
}

/** Also used by the tab for the selection it restores. */
export function lostMessage(count: number): string {
  return count === 1
    ? "1 remembered variant is no longer in this narrative and was left out of the selection."
    : `${count} remembered variants are no longer in this narrative and were left out of the selection.`;
}

/**
 * Narrowest a column may be before the region scrolls sideways (FR-12).
 * ComparisonColumn adds a 1px border and `p-2` (0.5rem) on each side, 18px
 * in all at a 16px root, so 16.125rem (258px) leaves 240px of text, the
 * readable bar. Below it the comparison region scrolls, never the page.
 */
const COLUMN_MIN_WIDTH = "16.125rem";

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
      className="grid w-full min-w-0 max-w-full gap-2 overflow-x-auto"
      style={{
        gridTemplateColumns: `repeat(${chosen.length}, minmax(${COLUMN_MIN_WIDTH}, 1fr))`,
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

/** The comparison: a heading, a way back, then one column per chosen variant. */
export default function ComparisonView(
  props: ComparisonViewProps,
): React.ReactElement {
  const { projectId, variants, selectedIds, onBack, deps } = props;
  const limit =
    props.limit === undefined ? COMPARISON_COLUMN_LIMIT : props.limit;
  const tier = useViewportTier();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // The tier starts at "desktop" before mount; reads wait one commit so a
  // phone is known before any read can start.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => setHasMounted(true), []);
  React.useEffect(() => headingRef.current?.focus(), []);

  const isPhone = tier === "phone";
  const chosen = selectedIds
    .map((id) => variants.find((v) => v.id === id))
    .filter((v): v is ComparisonVariant => v !== undefined);
  const lostCount = selectedIds.length - chosen.length;
  const isOverLimit = limit !== null && chosen.length > limit;
  const chosenIds = chosen.map((v) => v.id);
  const texts = useVariantTexts({
    projectId,
    variantIds: chosenIds,
    enabled: hasMounted && !isPhone && !isOverLimit,
    deps,
  });

  if (isPhone) {
    return (
      <section aria-label="Comparison">
        <p>{COMPARISON_PHONE_MESSAGE}</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Comparison"
      className="flex w-full min-w-0 max-w-full flex-col gap-2"
    >
      <div className="flex items-center gap-3">
        <h3 ref={headingRef} tabIndex={-1} className="m-0 font-bold">
          {`Comparing ${chosen.length} ${chosen.length === 1 ? "variant" : "variants"}`}
        </h3>
        {onBack !== undefined && (
          <Button variant="secondary" size="xs" onClick={onBack}>
            Back to list
          </Button>
        )}
      </div>
      {lostCount > 0 && <p role="status">{lostMessage(lostCount)}</p>}
      {isOverLimit && limit !== null && (
        <p role="alert">{limitMessage(limit)}</p>
      )}
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
