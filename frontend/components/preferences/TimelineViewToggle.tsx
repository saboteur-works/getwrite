"use client";

/**
 * @module TimelineViewToggle
 *
 * User-preferences section that turns the chronological Timeline view/tab on or
 * off for the active project (`config.features.timelineView`). The view depends
 * on the Timeline date fields (`config.features.timeline`), so enabling the view
 * also enables those fields when they are off — keeping the project out of the
 * "view on, no data fields" state. Persists via the {@link updateProjectFeatures}
 * thunk, merging onto the full feature map so other flags are preserved.
 */

import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectSelectedProjectId,
  selectActiveProjectFeatures,
  updateProjectFeatures,
} from "../../src/store/projectsSlice";
import { hoverTipProps, HoverTipSurface } from "../common/UI/HoverTip";
import { toastService } from "../../src/lib/toast-service";

/** react-tooltip anchor id for the "also enables the date fields" hint. */
const TIMELINE_VIEW_TOOLTIP_ID = "timeline-view-toggle-tip";

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

  const isTimelineFieldsEnabled = features.timeline === true;
  // Only warn when the date fields are off — that's the case where enabling the
  // view will also flip them on. When they're already on, no hint is needed.
  const tooltip = isTimelineFieldsEnabled
    ? undefined
    : "Also turns on the Timeline date fields, which the view reads.";

  const handleToggle = async (next: boolean): Promise<void> => {
    // The view is useless without its date fields, so enabling it enables them
    // too (no-op when already on). Disabling the view leaves the fields alone.
    const willEnableFields = next && !isTimelineFieldsEnabled;
    const updated = {
      ...features,
      timelineView: next,
      ...(willEnableFields && { timeline: true }),
    };
    try {
      await dispatch(
        updateProjectFeatures({
          projectId: selectedProjectId,
          features: updated,
        }),
      ).unwrap();
      toastService.success(
        `Timeline view ${next ? "enabled" : "disabled"}`,
        willEnableFields ? "Timeline fields turned on too." : undefined,
      );
    } catch (error) {
      toastService.error(
        "Couldn't update Timeline view",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Timeline view</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Show the chronological Timeline view for this project. It reads the
        Timeline date fields, so turning the view on also enables those fields.
      </p>

      <div className="mt-4">
        <label
          className="inline-flex items-center gap-2"
          {...hoverTipProps(TIMELINE_VIEW_TOOLTIP_ID, tooltip)}
        >
          <input
            type="checkbox"
            checked={features.timelineView === true}
            onChange={(event) => void handleToggle(event.target.checked)}
            className="h-4 w-4 rounded border-gw-border"
          />
          <span className="text-sm font-medium text-gw-primary">
            Enable Timeline view
          </span>
        </label>
      </div>

      {tooltip && <HoverTipSurface id={TIMELINE_VIEW_TOOLTIP_ID} />}
    </section>
  );
}
