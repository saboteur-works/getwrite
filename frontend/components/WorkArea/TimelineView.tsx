import React from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";
import { Timeline } from "../Timeline";
import type { TimelineItem, TimelineGroup } from "../Timeline";

export interface TimelineViewProps {
    className?: string;
}

export default function TimelineView({ className = "" }: TimelineViewProps) {
    const dispatch = useAppDispatch();

    const projectName = useAppSelector(
        (state) =>
            state.projects.projects[state.projects.selectedProjectId ?? ""]
                ?.name ?? "",
    );

    const resources = useAppSelector((state) => state.resources.resources);
    const folders = useAppSelector(
        (state) => state.resources.folders ?? [],
    );

    const povColorMap = React.useMemo(() => {
        const povs = [
            ...new Set(
                resources
                    .map((r) => r.userMetadata?.pov as string | undefined)
                    .filter((p): p is string => !!p),
            ),
        ];
        const palette = [
            "#6B8CAE", "#7A9E7E", "#A89060", "#8B6E9E",
            "#5E9EA0", "#A07060", "#7E8A6E", "#9E7A8E",
        ];
        return Object.fromEntries(povs.map((p, i) => [p, palette[i % palette.length]]));
    }, [resources]);

    const items = React.useMemo((): TimelineItem[] => {
        return resources
            .filter(
                (r) => typeof r.userMetadata?.storyDate === "string" && r.userMetadata.storyDate !== "",
            )
            .map((r) => {
                const storyDate = r.userMetadata!.storyDate as string;
                const storyTime = r.userMetadata?.storyTime as string | undefined;
                const storyDuration = r.userMetadata?.storyDuration as
                    | number
                    | undefined;

                const startDate = storyTime
                    ? `${storyDate}T${storyTime}`
                    : storyDate;

                const endDate =
                    storyDuration != null
                        ? new Date(
                              Date.parse(startDate) + storyDuration * 60000,
                          ).toISOString()
                        : undefined;

                const tooltipParts: string[] = [];
                tooltipParts.push(
                    new Intl.DateTimeFormat(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        ...(storyTime ? { hour: "2-digit", minute: "2-digit" } : {}),
                    }).format(new Date(Date.parse(startDate))),
                );
                if (storyDuration != null) {
                    tooltipParts.push(
                        storyDuration >= 60
                            ? `${Math.round(storyDuration / 60)}h`
                            : `${storyDuration} min`,
                    );
                }

                const pov = r.userMetadata?.pov as string | undefined;

                return {
                    id: r.id,
                    label: r.name ?? r.id,
                    startDate,
                    endDate,
                    groupId: r.folderId ?? undefined,
                    tooltip: tooltipParts.join(" · "),
                    color: pov ? povColorMap[pov] : undefined,
                    onClick: (id: string) => dispatch(setSelectedResourceId(id)),
                };
            });
    }, [resources, povColorMap, dispatch]);

    const groups = React.useMemo((): TimelineGroup[] => {
        const groupIds = new Set(
            items.map((i) => i.groupId).filter(Boolean) as string[],
        );
        return folders
            .filter((f) => groupIds.has(f.id))
            .map((f) => ({ id: f.id, label: f.name ?? f.id }));
    }, [items, folders]);

    return (
        <div className={className}>
            <div className="workarea-section">
                <h2 className="workarea-section-title">
                    Timeline{projectName ? ` — ${projectName}` : ""}
                </h2>
            </div>

            {items.length === 0 ? (
                <div className="workarea-section">
                    <p className="text-gw-secondary text-sm">
                        No scenes have story dates yet. Select a scene and set a
                        Story Date in the metadata sidebar.
                    </p>
                </div>
            ) : (
                <Timeline items={items} groups={groups} />
            )}
        </div>
    );
}
