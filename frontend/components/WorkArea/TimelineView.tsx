import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import useAppSelector from "../../src/store/hooks";

export interface TimelineViewProps {
    className?: string;
}

function groupByDate(resources: AnyResource[]) {
    const dated: Record<string, AnyResource[]> = {};
    const undated: AnyResource[] = [];
    resources.forEach((r) => {
        const date = r.createdAt ? r.createdAt.split("T")[0] : null;
        if (date) {
            dated[date] = dated[date] || [];
            dated[date].push(r);
        } else {
            undated.push(r);
        }
    });
    // Sort dates descending
    const dates = Object.keys(dated).sort((a, b) => (a < b ? 1 : -1));
    return { dates, dated, undated };
}

export default function TimelineView({ className = "" }: TimelineViewProps) {
    const projectFromStore = useAppSelector(
        (state) =>
            state.projects.projects[state.projects.selectedProjectId ?? ""],
    );
    const resourcesFromStore = useAppSelector(
        (state) => state.resources.resources,
    );

    const { dates, dated, undated } = React.useMemo(
        () => groupByDate(resourcesFromStore),
        [resourcesFromStore],
    );

    return (
        <div className={`${className}`}>
            <div className="workarea-section">
                <h2 className="workarea-section-title">
                    Timeline — {projectFromStore?.name}
                </h2>
            </div>

            <div className="space-y-6">
                {dates.map((d) => (
                    <section key={d} className="workarea-section">
                        <h3 className="workarea-section-title text-base">
                            {d}
                        </h3>
                        <ul className="workarea-list">
                            {dated[d].map((r) => (
                                <li key={r.id} className="workarea-list-item">
                                    <div className="workarea-list-item-label">
                                        {r.name ?? (r as any).title}
                                    </div>
                                    <div className="workarea-list-item-meta">
                                        {r.type}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                {undated.length > 0 && (
                    <section className="workarea-section">
                        <h3 className="workarea-section-title text-base">
                            Undated
                        </h3>
                        <ul className="workarea-list">
                            {undated.map((r) => (
                                <li key={r.id} className="workarea-list-item">
                                    <div className="workarea-list-item-label">
                                        {r.name ?? (r as any).title}
                                    </div>
                                    <div className="workarea-list-item-meta">
                                        {r.type}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}
