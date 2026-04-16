import React from "react";
import { dateToPercent, formatTick, getAdaptiveFormat } from "./utils";

export interface TimelineAxisProps {
    ticks: number[];
    axisBounds: { start: number; end: number };
    locale?: string;
    dateFormat?: Intl.DateTimeFormatOptions;
}

export default function TimelineAxis({
    ticks,
    axisBounds,
    locale,
    dateFormat,
}: TimelineAxisProps): JSX.Element {
    const resolvedFormat = React.useMemo(() => {
        if (dateFormat) return dateFormat;
        const intervalMs = ticks.length > 1 ? ticks[1] - ticks[0] : axisBounds.end - axisBounds.start;
        return getAdaptiveFormat(intervalMs);
    }, [dateFormat, ticks, axisBounds]);

    return (
        <div
            style={{
                position: "relative",
                height: "24px",
                borderBottom: "1px solid var(--timeline-axis-color)",
                marginBottom: "4px",
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
                            transform: "translateX(-50%)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "2px",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "var(--timeline-axis-label-size)",
                                color: "var(--timeline-axis-label-color)",
                                whiteSpace: "nowrap",
                                userSelect: "none",
                            }}
                        >
                            {formatTick(tick, locale, resolvedFormat)}
                        </span>
                        <span
                            style={{
                                width: "1px",
                                height: "4px",
                                backgroundColor: "var(--timeline-axis-color)",
                                display: "block",
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
}
