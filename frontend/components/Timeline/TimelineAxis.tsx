import React from "react";
import {
  dateToPercent,
  formatTickAdaptive,
  getAdaptiveTickStrategy,
} from "./utils";

export interface TimelineAxisProps {
  ticks: number[];
  axisBounds: { start: number; end: number };
  zoom: number;
  labelWidth: number;
  locale?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
}

export default function TimelineAxis({
  ticks,
  axisBounds,
  zoom,
  labelWidth,
  locale,
  dateFormat,
}: TimelineAxisProps): JSX.Element {
  const strategy = React.useMemo(() => {
    if (dateFormat) {
      return { intervalMs: 0, format: dateFormat, includeTime: false };
    }
    const spanMs = axisBounds.end - axisBounds.start;
    return getAdaptiveTickStrategy(spanMs, zoom);
  }, [dateFormat, axisBounds, zoom]);

  return (
    <div
      data-testid="timeline-axis"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        height: "32px",
        background: "var(--color-gw-chrome2, var(--timeline-bg))",
        borderBottom: "0.5px solid var(--timeline-axis-color)",
        flexShrink: 0,
      }}
    >
      {/* Label pad — aligns with row label column, sticky at left */}
      <div
        style={{
          width: labelWidth,
          minWidth: labelWidth,
          position: "sticky",
          left: 0,
          zIndex: 11,
          background: "var(--color-gw-chrome2, var(--timeline-bg))",
          borderRight: "0.5px solid var(--timeline-axis-color)",
          flexShrink: 0,
        }}
      />

      {/* Tick track */}
      <div
        style={{
          flex: 1,
          position: "relative",
          height: "32px",
          fontFamily: "var(--timeline-font-family)",
        }}
      >
        {ticks.map((tick) => {
          const left = dateToPercent(tick, axisBounds.start, axisBounds.end);
          return (
            <div
              key={tick}
              style={{
                position: "absolute",
                left: `${left}%`,
                bottom: 0,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Label — sits above the tick mark */}
              <span
                style={{
                  position: "absolute",
                  bottom: "9px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: "var(--timeline-axis-label-size)",
                  color: "var(--timeline-axis-label-color)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                {formatTickAdaptive(tick, strategy, locale)}
              </span>
              {/* Tick mark */}
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "0.5px",
                  height: "5px",
                  backgroundColor: "var(--timeline-axis-color)",
                  display: "block",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
