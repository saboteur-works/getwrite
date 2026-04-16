import React from "react";
import { dateToPercent, formatTick } from "./utils";

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
                            {formatTick(tick, locale, dateFormat)}
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
