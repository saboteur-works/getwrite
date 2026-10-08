"use client";

/**
 * @module EntityFeatureToggles
 *
 * Entity-specific feature toggles, shown in Project Settings' "Entities" tab:
 * the `entities` activation flag (Entity, Entities Mentioned, and Entity
 * Mentions sections in the sidebar) and the dependent `entityHighlighting`
 * flag (inline editor highlighting), which only renders once `entities` is
 * on. Split out of `ProjectFeatureToggles.tsx`, which keeps the other
 * built-in metadata toggles (Timeline, Point of View, Synopsis, Notes) in
 * the Metadata tab — these two toggles govern entity behavior specifically,
 * so they live alongside Relationship Types and the mention-highlight
 * duration field instead. Persists changes via the same
 * {@link updateProjectFeatures} thunk, merged onto the full current feature
 * map since the route replaces the `features` block wholesale.
 */

import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectSelectedProjectId,
  selectActiveProjectFeatures,
  updateProjectFeatures,
} from "../../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../../src/lib/models/types";
import { toastService } from "../../src/lib/toast-service";

/**
 * Renders the entity activation and highlighting toggles. Returns `null`
 * when no project is selected so the section is omitted entirely rather
 * than rendered empty.
 *
 * @returns The entity feature-toggle section, or `null` when no project is
 *   active.
 */
export default function EntityFeatureToggles(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const features = useAppSelector(selectActiveProjectFeatures);

  if (!selectedProjectId) {
    return null;
  }

  /**
   * Persists a single feature change by sending the full, merged feature map
   * (the route replaces the `features` block wholesale), then confirms with a
   * toast (or reports failure).
   *
   * @param key - Feature flag being changed.
   * @param label - Human-readable feature name, used in the toast.
   * @param next - Desired enabled state.
   */
  const handleToggle = async (
    key: keyof ProjectFeatureFlags,
    label: string,
    next: boolean,
  ): Promise<void> => {
    const updated: ProjectFeatureFlags = { ...features, [key]: next };
    try {
      await dispatch(
        updateProjectFeatures({
          projectId: selectedProjectId,
          features: updated,
        }),
      ).unwrap();
      toastService.success(`${label} ${next ? "enabled" : "disabled"}`);
    } catch (error) {
      toastService.error(
        `Couldn't update ${label}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Entities</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Turn entity tracking on or off for this project. Disabling it hides the
        Entity, Entities Mentioned, and Entity Mentions sections, but keeps any
        values you&rsquo;ve already saved.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={features.entities === true}
              onChange={(event) =>
                void handleToggle("entities", "Entities", event.target.checked)
              }
              className="h-4 w-4 rounded border-gw-border"
            />
            <span className="text-sm font-medium text-gw-primary">
              Entities
            </span>
          </label>
          <p className="ml-6 mt-0.5 text-xs text-gw-secondary">
            The Entity, Entities Mentioned, and Entity Mentions sections in the
            sidebar.
          </p>
        </div>

        {features.entities === true && (
          <div className="border-t-[0.5px] border-gw-border pt-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={features.entityHighlighting === true}
                onChange={(event) =>
                  void handleToggle(
                    "entityHighlighting",
                    "Entity highlighting",
                    event.target.checked,
                  )
                }
                className="h-4 w-4 rounded border-gw-border"
              />
              <span className="text-sm font-medium text-gw-primary">
                Entity highlighting
              </span>
            </label>
            <p className="ml-6 mt-0.5 text-xs text-gw-secondary">
              Highlights entity names and aliases inline in the editor.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
