import React from "react";
import "./timeline.css";
import type { TimelineProps, TimelineGroup, TimelineItem } from "./types";
import { computeAxisBounds, buildTicks } from "./utils";
import TimelineAxis from "./TimelineAxis";
import TimelineRow from "./TimelineRow";

const DEFAULT_TICK_COUNT = 8;

export default function Timeline({
    items,
    groups,
    config,
    className = "",
}: TimelineProps): JSX.Element {
    const axisBounds = React.useMemo(
        () => computeAxisBounds(items, config),
        [items, config],
    );

    const ticks = React.useMemo(
        () =>
            buildTicks(
                axisBounds.start,
                axisBounds.end,
                config?.tickCount ?? DEFAULT_TICK_COUNT,
            ),
        [axisBounds, config?.tickCount],
    );

    const groupMap = React.useMemo(() => {
        const map = new Map<string, TimelineGroup>();
        groups?.forEach((g) => map.set(g.id, g));
        return map;
    }, [groups]);

    // Build rows: one per group (in supplied order), plus one ungrouped row for items without a groupId.
    const rows = React.useMemo(() => {
        if (!groups || groups.length === 0) {
            return [{ group: undefined, items }];
        }
        const ungrouped = items.filter((i) => !i.groupId);
        const grouped: Array<{ group: TimelineGroup | undefined; items: TimelineItem[] }> = groups.map((g) => ({
            group: g,
            items: items.filter((i) => i.groupId === g.id),
        }));
        const result = grouped.filter((r) => r.items.length > 0);
        if (ungrouped.length > 0) {
            result.push({ group: undefined, items: ungrouped });
        }
        return result;
    }, [groups, items, groupMap]);

    const hasGroupLabels = groups && groups.length > 0;

    return (
        <div
            className={className}
            style={{
                backgroundColor: "var(--timeline-bg)",
                fontFamily: "var(--timeline-font-family)",
                overflowX: "auto",
            }}
        >
            <div style={{ minWidth: "1200px", padding: "8px 0" }}>
                {/* Axis offset accounts for the group label column when groups are present */}
                <div
                    style={{
                        paddingLeft: hasGroupLabels
                            ? "var(--timeline-group-label-width)"
                            : "0",
                    }}
                >
                    <TimelineAxis
                        ticks={ticks}
                        axisBounds={axisBounds}
                        locale={config?.locale}
                        dateFormat={config?.dateFormat}
                    />
                </div>

                {rows.map((row, i) => (
                    <TimelineRow
                        key={row.group?.id ?? `ungrouped-${i}`}
                        group={row.group}
                        items={row.items}
                        axisBounds={axisBounds}
                    />
                ))}
            </div>
        </div>
    );
}
