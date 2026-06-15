import React from "react";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import { setSelectedResourceId } from "../../../../src/store/resourcesSlice";
import {
  selectPovEnabled,
  selectNotesEnabled,
} from "../../../../src/store/projectsSlice";
import { Timeline } from "../../../Timeline";
import type { TimelineItem, TimelineGroup } from "../../../Timeline";

export interface TimelineViewProps {
  className?: string;
  /**
   * POV chip color palette. Each entry is any valid CSS color value or
   * `var(--some-token)` reference. Defaults to the `--timeline-pov-*` CSS
   * custom properties defined by the host stylesheet, which automatically
   * respond to light/dark mode. Pass explicit hex values here when using
   * TimelineView outside the GetWrite app (e.g., as a standalone package
   * without the host CSS loaded).
   */
  colors?: string[];
}

function resolvePovDisplay(pov: unknown): string | undefined {
  if (!pov) return undefined;
  if (typeof pov === "string") return pov;
  if (typeof pov === "object" && pov !== null && "name" in pov) {
    return (pov as { name: string }).name || undefined;
  }
  return undefined;
}

const DEFAULT_POV_PALETTE = [
  "var(--timeline-pov-0)",
  "var(--timeline-pov-1)",
  "var(--timeline-pov-2)",
  "var(--timeline-pov-3)",
  "var(--timeline-pov-4)",
  "var(--timeline-pov-5)",
  "var(--timeline-pov-6)",
  "var(--timeline-pov-7)",
];

export default function TimelineView({
  className = "",
  colors = DEFAULT_POV_PALETTE,
}: TimelineViewProps) {
  const dispatch = useAppDispatch();

  const resources = useAppSelector((state) => state.resources.resources);
  const folders = useAppSelector((state) => state.resources.folders ?? []);

  // POV and Notes are independent opt-ins (spec FR4): when a feature is off the
  // Timeline must ignore its data entirely — no coloring, pills, or legend for
  // POV; no notes carried into item metadata. Values are preserved on disk.
  const povEnabled = useAppSelector(selectPovEnabled);
  const notesEnabled = useAppSelector(selectNotesEnabled);

  const povColorMap = React.useMemo(() => {
    if (!povEnabled) return {} as Record<string, string>;
    const povs = [
      ...new Set(
        resources
          .map((r) => resolvePovDisplay(r.userMetadata?.pov))
          .filter((p): p is string => !!p),
      ),
    ];
    return Object.fromEntries(
      povs.map((p, i) => [p, colors[i % colors.length]]),
    );
  }, [resources, colors, povEnabled]);

  const items = React.useMemo((): TimelineItem[] => {
    return resources
      .filter(
        (r) =>
          typeof r.userMetadata?.storyDate === "string" &&
          r.userMetadata.storyDate !== "",
      )
      .map((r) => {
        const storyDate = r.userMetadata!.storyDate as string;
        const storyTime = r.userMetadata?.storyTime as string | undefined;
        const storyDuration = r.userMetadata?.storyDuration as
          | number
          | undefined;
        const storyEndDate = r.userMetadata?.storyEndDate as string | undefined;

        const startDate = storyTime ? `${storyDate}T${storyTime}` : storyDate;

        const endDate =
          storyEndDate ??
          (storyDuration != null
            ? new Date(
                Date.parse(startDate) + storyDuration * 60000,
              ).toISOString()
            : undefined);

        const durationH =
          storyDuration != null ? storyDuration / 60 : undefined;

        const pov = povEnabled
          ? resolvePovDisplay(r.userMetadata?.pov)
          : undefined;
        const statusArr = r.userMetadata?.status as string[] | undefined;
        const status = r.userMetadata?.status as string | undefined;
        // Notes is the `userMetadata.notes` metadata field (what the sidebar
        // reads/writes and the Notes toggle gates) — not the legacy
        // resource-level `r.notes`.
        const rawNotes = r.userMetadata?.notes;
        const notesText =
          notesEnabled && typeof rawNotes === "string" ? rawNotes : undefined;
        const notes = notesText
          ? notesText.slice(0, 120) + (notesText.length > 120 ? "…" : "")
          : undefined;
        const folder = folders.find((f) => f.id === r.folderId)?.name;

        return {
          id: r.id,
          label: r.name ?? r.id,
          startDate,
          endDate,
          groupId: r.folderId ?? undefined,
          color: pov ? povColorMap[pov] : undefined,
          durationH,
          status,
          onClick: (id: string) => dispatch(setSelectedResourceId(id)),
          metadata: { pov, status: statusArr, folder, notes },
        };
      });
  }, [resources, povColorMap, folders, dispatch, povEnabled, notesEnabled]);

  const groups = React.useMemo((): TimelineGroup[] => {
    const groupIds = new Set(
      items.map((i) => i.groupId).filter(Boolean) as string[],
    );
    return folders
      .filter((f) => groupIds.has(f.id))
      .map((f) => ({ id: f.id, label: f.name ?? f.id }));
  }, [items, folders]);

  const povNames = React.useMemo(() => Object.keys(povColorMap), [povColorMap]);

  return (
    <Timeline
      className={className}
      items={items}
      groups={groups}
      povNames={povNames}
      config={{ initialZoom: 2 }}
    />
  );
}
