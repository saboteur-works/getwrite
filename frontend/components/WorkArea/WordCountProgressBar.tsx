import React from "react";

export interface WordCountProgressBarProps {
    /** Current word count. */
    current: number;
    /** Target word count. Caller must ensure this is > 0. */
    goal: number;
    className?: string;
}

export default function WordCountProgressBar({
    current,
    goal,
    className = "",
}: WordCountProgressBarProps): JSX.Element {
    const pct = Math.round((Math.min(current, goal) / goal) * 100);
    const achieved = current >= goal;

    const label = achieved
        ? `${current.toLocaleString()} / ${goal.toLocaleString()} words · Goal reached`
        : current === 0
          ? `0 / ${goal.toLocaleString()} words`
          : `${current.toLocaleString()} / ${goal.toLocaleString()} words · ${pct}%`;

    return (
        <div className={`space-y-1.5 ${className}`}>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={goal}
                aria-valuenow={Math.min(current, goal)}
                aria-label="Writing goal progress"
                className="h-1.5 w-full overflow-hidden rounded-full bg-gw-chrome2"
            >
                <div
                    className="h-full rounded-full bg-gw-primary transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <p className="font-mono text-[10px] text-gw-secondary">{label}</p>
        </div>
    );
}
