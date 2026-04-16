import React from "react";
import "./timeline.css";
import type { TimelineProps, TimelineGroup, TimelineItem } from "./types";
import { computeAxisBounds, buildTicks } from "./utils";
import TimelineAxis from "./TimelineAxis";
import TimelineRow from "./TimelineRow";

const DEFAULT_TICK_COUNT = 8;
const BASE_TRACK_WIDTH = 1200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.5;

export default function Timeline({
    items,
    groups,
    config,
    className = "",
}: TimelineProps): JSX.Element {
    const [zoom, setZoom] = React.useState(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, config?.initialZoom ?? 1)),
    );

    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Non-passive wheel listener so we can preventDefault for Ctrl+scroll zoom.
    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setZoom((z) =>
                    e.deltaY < 0
                        ? Math.min(+(z + ZOOM_STEP).toFixed(1), MAX_ZOOM)
                        : Math.max(+(z - ZOOM_STEP).toFixed(1), MIN_ZOOM),
                );
            }
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    const zoomIn = () =>
        setZoom((z) => Math.min(+(z + ZOOM_STEP).toFixed(1), MAX_ZOOM));
    const zoomOut = () =>
        setZoom((z) => Math.max(+(z - ZOOM_STEP).toFixed(1), MIN_ZOOM));

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

    const rows = React.useMemo(() => {
        if (!groups || groups.length === 0) {
            return [{ group: undefined as TimelineGroup | undefined, items }];
        }
        const ungrouped = items.filter((i) => !i.groupId);
        const grouped: Array<{ group: TimelineGroup | undefined; items: TimelineItem[] }> =
            groups.map((g) => ({
                group: g,
                items: items.filter((i) => i.groupId === g.id),
            }));
        const result = grouped.filter((r) => r.items.length > 0);
        if (ungrouped.length > 0) {
            result.push({ group: undefined, items: ungrouped });
        }
        return result;
    }, [groups, items]);

    const hasGroupLabels = groups && groups.length > 0;
    const trackWidth = BASE_TRACK_WIDTH * zoom;

    return (
        <div
            className={`timeline-root ${className}`}
            style={{
                backgroundColor: "var(--timeline-bg)",
                fontFamily: "var(--timeline-font-family)",
            }}
        >
            {/* Zoom controls — outside the scroll container so they stay fixed */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 8px",
                }}
            >
                <button
                    className="timeline-zoom-btn"
                    aria-label="Zoom out"
                    title="Zoom out (Ctrl+scroll)"
                    onClick={zoomOut}
                    disabled={zoom <= MIN_ZOOM}
                >
                    −
                </button>
                <span className="timeline-zoom-label">
                    {Math.round(zoom * 100)}%
                </span>
                <button
                    className="timeline-zoom-btn"
                    aria-label="Zoom in"
                    title="Zoom in (Ctrl+scroll)"
                    onClick={zoomIn}
                    disabled={zoom >= MAX_ZOOM}
                >
                    +
                </button>
            </div>

            {/* Scrollable track */}
            <div ref={scrollRef} style={{ overflowX: "auto" }}>
                <div
                    style={{
                        minWidth: `${trackWidth}px`,
                        padding: "4px 0 8px",
                    }}
                >
                    {/* Axis — offset by group label column width when groups are present */}
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
        </div>
    );
}
