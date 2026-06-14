"use client";

/**
 * @module ProjectFeatureToggles
 *
 * Section shown at the top of the Metadata Fields menu that turns the
 * previously-locked built-in metadata features (Timeline, Point of View,
 * Synopsis, Notes) on or off, co-located with the field definitions they
 * govern. Each toggle reflects the active project's `config.features` state and
 * persists changes via the {@link updateProjectFeatures} thunk. Toggling is
 * available at any time after project creation (FR10); turning a feature off
 * only hides its field — stored values are preserved.
 */

import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectSelectedProjectId,
  selectTimelineEnabled,
  selectPovEnabled,
  selectSynopsisEnabled,
  selectNotesEnabled,
  updateProjectFeatures,
} from "../../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../../src/lib/models/types";

/** Display definition for a single feature toggle. */
interface FeatureToggleDef {
  /** Feature flag key in `config.features`. */
  key: keyof ProjectFeatureFlags;
  /** Human-readable label rendered as the control's accessible name. */
  label: string;
  /** Short explanation of what enabling the feature does. */
  description: string;
}

const FEATURE_TOGGLES: readonly FeatureToggleDef[] = [
  {
    key: "timeline",
    label: "Timeline",
    description:
      "Story date, duration, and end-date fields plus the Timeline view.",
  },
  {
    key: "pov",
    label: "Point of View",
    description: "The point-of-view metadata field and its timeline coloring.",
  },
  {
    key: "synopsis",
    label: "Synopsis",
    description: "The synopsis metadata field in the sidebar.",
  },
  {
    key: "notes",
    label: "Notes",
    description: "The notes metadata field in the sidebar.",
  },
];

/**
 * Renders the per-project feature toggles. Returns `null` when no project is
 * selected so the section is omitted entirely rather than rendered empty.
 *
 * @returns The feature-toggle section, or `null` when no project is active.
 */
export default function ProjectFeatureToggles(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const enabled: ProjectFeatureFlags = {
    timeline: useAppSelector(selectTimelineEnabled),
    pov: useAppSelector(selectPovEnabled),
    synopsis: useAppSelector(selectSynopsisEnabled),
    notes: useAppSelector(selectNotesEnabled),
  };

  if (!selectedProjectId) {
    return null;
  }

  /**
   * Persists a single feature change by sending the full, merged feature map
   * (the route replaces the `features` block wholesale).
   *
   * @param key - Feature flag being changed.
   * @param next - Desired enabled state.
   */
  const handleToggle = (
    key: keyof ProjectFeatureFlags,
    next: boolean,
  ): void => {
    void dispatch(
      updateProjectFeatures({
        projectId: selectedProjectId,
        features: { ...enabled, [key]: next },
      }),
    );
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">
        Built-in features
      </h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Turn the optional built-in fields on or off for this project. Disabling
        one hides its field below and in the sidebar, but keeps any values
        you&rsquo;ve already saved.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {FEATURE_TOGGLES.map(({ key, label, description }) => (
          <div key={key}>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled[key] ?? false}
                onChange={(event) => handleToggle(key, event.target.checked)}
                className="h-4 w-4 rounded border-gw-border"
              />
              <span className="text-sm font-medium text-gw-primary">
                {label}
              </span>
            </label>
            <p className="ml-6 mt-0.5 text-xs text-gw-secondary">
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
