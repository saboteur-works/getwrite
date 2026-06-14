"use client";

/**
 * @module TimelineViewToggle
 *
 * User-preferences section that turns the chronological Timeline view/tab on or
 * off for the active project (`config.features.timelineView`), independently of
 * the Timeline date fields (toggled in the Metadata Fields menu). Persists via
 * the {@link updateProjectFeatures} thunk, merging onto the full feature map so
 * the field toggles are preserved. Editable at any time after project creation.
 */

import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectSelectedProjectId,
  selectActiveProjectFeatures,
  updateProjectFeatures,
} from "../../src/store/projectsSlice";

/**
 * Renders the Timeline view toggle. Returns `null` when no project is selected
 * so the section is omitted rather than rendered empty.
 *
 * @returns The Timeline-view toggle section, or `null` when no project is active.
 */
export default function TimelineViewToggle(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  // Merge onto the full current map so the field toggles (and any other flags)
  // are preserved — the route replaces the `features` block wholesale.
  const features = useAppSelector(selectActiveProjectFeatures);

  if (!selectedProjectId) {
    return null;
  }

  const handleToggle = (next: boolean): void => {
    void dispatch(
      updateProjectFeatures({
        projectId: selectedProjectId,
        features: { ...features, timelineView: next },
      }),
    );
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Timeline view</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Show the chronological Timeline view for this project. It reads the
        Timeline date fields &mdash; enable those in the Metadata Fields menu to
        give the view something to plot.
      </p>

      <div className="mt-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={features.timelineView === true}
            onChange={(event) => handleToggle(event.target.checked)}
            className="h-4 w-4 rounded border-gw-border"
          />
          <span className="text-sm font-medium text-gw-primary">
            Enable Timeline view
          </span>
        </label>
      </div>
    </section>
  );
}
