"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import QueryBuilder from "../QueryBuilder/QueryBuilder";
import { useQueryBuilderState } from "../QueryBuilder/useQueryBuilderState";
import type { FilterChipField } from "../QueryBuilder/FilterChip";
import type { ResourceOption } from "../Sidebar/controls/ResourceRefInput";
import { setGoalFilter } from "../../src/lib/api/goal-filter";
import {
  buildGoalFilterDraft,
  prepareGoalFilterSave,
} from "../../src/lib/goal-filter-draft";

export interface GoalFilterSectionProps {
  /** Server-validated id of the active project. */
  projectId: string;
  /** The stored `config.goalFilter`; omitted or `null` when none is set. */
  storedFilter?: unknown;
  /** The project's query-builder field list (the Data view's list). */
  fields: FilterChipField[];
  /** Resource typeahead options for resource-ref chips. */
  resolveResourceOptions?: (
    refFolder: string | undefined,
    includeSubfolders?: boolean,
  ) => ResourceOption[];
  /** Folder typeahead options for folder-ref chips. */
  resolveFolderOptions?: () => ResourceOption[];
  /** Called with the saved filter after a save, or `null` after a clear. */
  onSaved?: (goalFilter: unknown | null) => void;
}

const INVALID_STORED_LINE =
  "Your saved goal filter can't be used. Change it or clear it.";
const FAILED_LINE = "Failed to save goal filter.";

/**
 * Sets or clears the project's goal filter (`config.goalFilter`), which
 * decides which text documents count toward both writing goals. Uses its own
 * `useQueryBuilderState` instance, is given no `savedQueries` (so no `ref`
 * chip can be created and there is no "Save query"), and shows no live match
 * count. Nothing is saved until Save or Clear is pressed. State lines are
 * neutral text: errors in `role="alert"`, confirmations in `role="status"`
 * (STYLING.md: no red).
 */
export default function GoalFilterSection({
  projectId,
  storedFilter,
  fields,
  resolveResourceOptions,
  resolveFolderOptions,
  onSaved,
}: GoalFilterSectionProps): JSX.Element {
  const builder = useQueryBuilderState();
  const [currentFilter, setCurrentFilter] = useState<unknown>(storedFilter);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // The draft's fields include a placeholder for each missing key, so the
  // builder must receive them rather than the caller's list.
  const draft = useMemo(
    () => buildGoalFilterDraft(currentFilter, fields),
    [currentFilter, fields],
  );

  const { reset } = builder;
  const hasSeeded = useRef<boolean>(false);
  useEffect(() => {
    if (hasSeeded.current) return;
    hasSeeded.current = true;
    if (draft.status === "ok") {
      reset({ groups: draft.groups, combinator: draft.globalCombinator });
    }
  }, [draft, reset]);

  const handleSave = async (): Promise<void> => {
    setSavedMessage(null);
    const prepared = prepareGoalFilterSave(
      builder.groups,
      builder.globalCombinator,
    );
    if (!prepared.ok) {
      setErrorMessage(prepared.message);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await setGoalFilter(projectId, prepared.ast);
      setCurrentFilter(result.goalFilter ?? prepared.ast);
      onSaved?.(result.goalFilter ?? prepared.ast);
      setSavedMessage("Goal filter saved.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `${FAILED_LINE} ${err.message}`
          : FAILED_LINE,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setSavedMessage(null);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await setGoalFilter(projectId, null);
      setCurrentFilter(undefined);
      reset({ groups: [], combinator: "and" });
      onSaved?.(null);
      setSavedMessage("Goal filter cleared.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `${FAILED_LINE} ${err.message}`
          : FAILED_LINE,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="goal-filter-heading"
      className="mt-6 flex w-full flex-col gap-3"
    >
      <h3
        id="goal-filter-heading"
        className="text-base font-semibold text-gw-primary"
      >
        Goal filter
      </h3>
      <p className="max-w-2xl text-sm text-gw-secondary">
        Choose which documents count toward both goals. Leave empty to count
        every text document.
      </p>
      <Card padding="lg" className="flex flex-col gap-3">
        {draft.status === "invalid" ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-gw-primary">
              {INVALID_STORED_LINE}
            </p>
            <p className="text-sm text-gw-secondary">{draft.message}</p>
          </div>
        ) : (
          <>
            {draft.missingFieldKeys.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-gw-secondary">
                {draft.missingFieldKeys.map((key) => (
                  <li key={key}>
                    <span className="font-medium text-gw-primary">{key}</span>:{" "}
                    {draft.missingFieldMessage}
                  </li>
                ))}
              </ul>
            ) : null}
            <QueryBuilder
              groups={builder.groups}
              globalCombinator={builder.globalCombinator}
              availableFields={draft.fields}
              resolveResourceOptions={resolveResourceOptions}
              resolveFolderOptions={resolveFolderOptions}
              isAdvanced={builder.isAdvanced}
              rawAst={builder.rawAst}
              onGlobalCombinatorChange={builder.onGlobalCombinatorChange}
              onGroupCombinatorChange={builder.onGroupCombinatorChange}
              onGroupAdd={builder.onGroupAdd}
              onGroupDelete={builder.onGroupDelete}
              onChipUpdate={builder.onChipUpdate}
              onChipAdd={builder.onChipAdd}
              onChipDelete={builder.onChipDelete}
              onChipDuplicate={builder.onChipDuplicate}
              onChipReorder={builder.onChipReorder}
              onRestoreFromAdvanced={builder.onRestoreFromAdvanced}
            />
          </>
        )}
        {errorMessage ? (
          <p role="alert" className="text-sm font-medium text-gw-primary">
            {errorMessage}
          </p>
        ) : null}
        <p role="status" className="text-sm text-gw-secondary">
          {savedMessage}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClear}
            disabled={isSaving}
          >
            Clear goal filter
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || draft.status === "invalid"}
          >
            {isSaving ? "Saving…" : "Save goal filter"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
