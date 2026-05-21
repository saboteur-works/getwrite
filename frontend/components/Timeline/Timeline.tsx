import React from "react";
import "./timeline.css";
import type { TimelineProps, TimelineGroup, TimelineItem } from "./types";
import {
  computeAxisBounds,
  buildAdaptiveTicks,
  getAdaptiveTickStrategy,
  dateToPercent,
} from "./utils";
import TimelineAxis from "./TimelineAxis";
import TimelineRow from "./TimelineRow";
import TimelineTooltip from "./TimelineTooltip";

const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 10];
const DEFAULT_ZOOM = 2;
const BASE_TRACK_WIDTH = 900;

function findNearestStep(v: number): number {
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - v) < Math.abs(best - v) ? step : best,
  );
}

function stepUp(z: number): number {
  const i = ZOOM_STEPS.indexOf(z);
  return i < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[i + 1] : z;
}

function stepDown(z: number): number {
  const i = ZOOM_STEPS.indexOf(z);
  return i > 0 ? ZOOM_STEPS[i - 1] : z;
}

export default function Timeline({
  items,
  groups,
  config,
  className = "",
  povNames = [],
}: TimelineProps): JSX.Element {
  const [zoom, setZoom] = React.useState(
    findNearestStep(config?.initialZoom ?? DEFAULT_ZOOM),
  );
  const [activePoV, setActivePoV] = React.useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = React.useState<TimelineItem | null>(
    null,
  );
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const anchorFracRef = React.useRef<number>(0);

  const trackWidth = Math.max(BASE_TRACK_WIDTH, BASE_TRACK_WIDTH * zoom);

  // Capture scroll anchor fraction before zoom changes
  const captureAnchor = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const total = trackWidth;
    const vw = el.clientWidth;
    anchorFracRef.current = (el.scrollLeft + vw / 2) / total;
  }, [trackWidth]);

  const zoomIn = React.useCallback(() => {
    captureAnchor();
    setZoom((z) => stepUp(z));
  }, [captureAnchor]);

  const zoomOut = React.useCallback(() => {
    captureAnchor();
    setZoom((z) => stepDown(z));
  }, [captureAnchor]);

  const resetZoom = React.useCallback(() => {
    captureAnchor();
    setZoom(DEFAULT_ZOOM);
  }, [captureAnchor]);

  // Restore scroll position after zoom
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newTrackWidth = Math.max(BASE_TRACK_WIDTH, BASE_TRACK_WIDTH * zoom);
    const vw = el.clientWidth;
    const target = anchorFracRef.current * newTrackWidth - vw / 2;
    el.scrollLeft = Math.max(0, Math.min(target, newTrackWidth - vw));
  }, [zoom]);

  // Non-passive wheel listener for Ctrl/Cmd+scroll zoom
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomIn, zoomOut]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [zoomIn, zoomOut, resetZoom]);

  const axisBounds = React.useMemo(
    () => computeAxisBounds(items, config),
    [items, config],
  );

  const spanMs = axisBounds.end - axisBounds.start;

  const ticks = React.useMemo(() => {
    const strategy = getAdaptiveTickStrategy(spanMs, zoom);
    return buildAdaptiveTicks(axisBounds.start, axisBounds.end, strategy, zoom);
  }, [axisBounds, spanMs, zoom]);

  // Filter items by active POV
  const filteredItems = React.useMemo((): TimelineItem[] => {
    if (!activePoV) return items;
    return items.filter((i) => i.metadata?.pov === activePoV);
  }, [items, activePoV]);

  const rows = React.useMemo(() => {
    if (!groups || groups.length === 0) {
      return [
        { group: undefined as TimelineGroup | undefined, items: filteredItems },
      ];
    }
    const ungrouped = filteredItems.filter((i) => !i.groupId);
    const grouped: Array<{
      group: TimelineGroup | undefined;
      items: TimelineItem[];
    }> = groups.map((g) => ({
      group: g,
      items: filteredItems.filter((i) => i.groupId === g.id),
    }));
    const result = grouped.filter((r) => r.items.length > 0);
    if (ungrouped.length > 0) {
      result.push({ group: undefined, items: ungrouped });
    }
    return result;
  }, [groups, filteredItems]);

  const hasGroupLabels = groups && groups.length > 0;

  // Label column width: fit longest group label, clamped 84–120px
  const labelWidth = React.useMemo(() => {
    if (!hasGroupLabels) return 84;
    const longest = Math.max(0, ...(groups ?? []).map((g) => g.label.length));
    return Math.min(120, Math.max(84, Math.round(longest * 7.5)));
  }, [groups, hasGroupLabels]);

  // Detect POVs present in items (for legend + filter pills when povNames is not provided)
  const povNamesResolved = React.useMemo(() => {
    if (povNames.length > 0) return povNames;
    return [
      ...new Set(
        items.map((i) => i.metadata?.pov).filter((p): p is string => !!p),
      ),
    ];
  }, [povNames, items]);

  const hasUnassigned = React.useMemo(
    () => items.some((i) => !i.metadata?.pov),
    [items],
  );

  const showLegend = povNamesResolved.length > 1 || hasUnassigned;

  // Tooltip: use item's POV color for the dot in the legend via CSS var
  const handleChipHover = React.useCallback(
    (item: TimelineItem | null, x: number, y: number) => {
      setHoveredItem(item);
      if (item) setTooltipPos({ x, y });
    },
    [],
  );

  const rootRect = rootRef.current?.getBoundingClientRect();
  const containerWidth = rootRect?.width ?? 800;
  const containerHeight = rootRect?.height ?? 600;

  const sceneLabel =
    filteredItems.length === 1 ? "1 SCENE" : `${filteredItems.length} SCENES`;

  return (
    <div
      ref={rootRef}
      className={`timeline-root ${className}`}
      style={{
        backgroundColor: "var(--timeline-bg)",
        fontFamily: "var(--timeline-font-family)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        marginTop: "1rem",
      }}
    >
      {/* ── Toolbar ── */}
      <div className="timeline-toolbar">
        {/* Label-column spacer */}
        <div
          style={{ width: labelWidth, minWidth: labelWidth, flexShrink: 0 }}
        />
        <div style={{ width: 16, flexShrink: 0 }} />

        <span className="timeline-scene-count">{sceneLabel}</span>

        <div style={{ flex: 1 }} />

        {/* POV filter pills */}
        {povNamesResolved.length > 0 && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              className={`timeline-pov-pill${activePoV === null ? " active" : ""}`}
              style={{ marginLeft: 0 }}
              onClick={() => setActivePoV(null)}
            >
              ALL
            </button>
            {povNamesResolved.map((pov) => (
              <button
                key={pov}
                className={`timeline-pov-pill${activePoV === pov ? " active" : ""}`}
                onClick={() => setActivePoV(activePoV === pov ? null : pov)}
              >
                {pov}
              </button>
            ))}
          </div>
        )}

        <div className="timeline-toolbar-divider" />

        {/* Zoom controls */}
        <div className="timeline-zoom-group" style={{ marginRight: 16 }}>
          <button
            className="timeline-zoom-btn"
            aria-label="Zoom out"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_STEPS[0]}
          >
            −
          </button>
          <button
            className="timeline-zoom-label"
            onClick={resetZoom}
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="timeline-zoom-btn"
            aria-label="Zoom in"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          >
            +
          </button>
        </div>
      </div>

      {/* ── POV legend ── */}
      {showLegend && (
        <div className="timeline-legend">
          <div
            style={{
              width: labelWidth + 16,
              minWidth: labelWidth + 16,
              flexShrink: 0,
            }}
          />
          <span className="timeline-legend-header">POV</span>
          {povNamesResolved.map((pov) => {
            const color = items.find((i) => i.metadata?.pov === pov)?.color;
            return (
              <span key={pov} className="timeline-legend-entry">
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: color ?? "var(--timeline-item-bg)",
                    flexShrink: 0,
                  }}
                />
                {pov}
              </span>
            );
          })}
          {/* Outline status swatch */}
          <span className="timeline-legend-entry" style={{ marginLeft: 8 }}>
            <span
              style={{
                width: 22,
                height: 9,
                borderRadius: 2,
                flexShrink: 0,
                background:
                  "repeating-linear-gradient(45deg, var(--timeline-outline-stripe) 0px, var(--timeline-outline-stripe) 1.5px, transparent 1.5px, transparent 5px)",
                border: "0.5px solid var(--timeline-axis-color)",
              }}
            />
            Outline
          </span>
        </div>
      )}

      {/* ── Scrollable track area ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "auto",
          position: "relative",
        }}
      >
        <div
          style={{
            minWidth: `${trackWidth}px`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Axis — sticky top via TimelineAxis internal styles */}
          <TimelineAxis
            ticks={ticks}
            axisBounds={axisBounds}
            zoom={zoom}
            labelWidth={labelWidth}
            locale={config?.locale}
            dateFormat={config?.dateFormat}
          />

          {/* Empty state */}
          {filteredItems.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                minHeight: 200,
                gap: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--timeline-font-family)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-gw-secondary)",
                  userSelect: "none",
                }}
              >
                {activePoV ? "No scenes match this filter" : "No dated scenes"}
              </span>
              <span
                style={{
                  fontFamily: "var(--timeline-font-family)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "var(--color-gw-secondary)",
                  userSelect: "none",
                }}
              >
                {activePoV
                  ? "Set POV in the metadata sidebar"
                  : "Add story dates in the metadata sidebar"}
              </span>
            </div>
          )}

          {/* Rows */}
          {rows.map((row, i) => (
            <TimelineRow
              key={row.group?.id ?? `ungrouped-${i}`}
              group={row.group}
              items={row.items}
              axisBounds={axisBounds}
              trackWidthPx={trackWidth}
              rowIndex={i}
              ticks={ticks}
              labelWidth={labelWidth}
              onChipHover={handleChipHover}
            />
          ))}
        </div>
      </div>

      {/* Tooltip — absolutely positioned within .timeline-root */}
      <TimelineTooltip
        visible={hoveredItem !== null}
        x={tooltipPos.x}
        y={tooltipPos.y}
        item={hoveredItem}
        containerWidth={containerWidth}
        containerHeight={containerHeight}
      />
    </div>
  );
}
