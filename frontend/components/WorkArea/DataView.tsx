import React from "react";
import type { Project, AnyResource } from "../../src/lib/models/types";

export interface DataViewProps {
    /** Optional list of projects to show aggregate statistics for */
    projects?: Project[];
    /** The single project to display statistics for (used when `projects` is not provided) */
    project?: Project;
    /** Optional adapter view from `buildProjectView` (canonical models). */
    view?: { project: any; folders: any[]; resources: AnyResource[] };
    /** Optional override flat list of resources to render (uses project(s).resources by default) */
    resources?: AnyResource[];
    className?: string;
}

/**
 * `DataView` renders statistics scoped to a single project and a simple
 * resource list. When `project` is omitted a placeholder project is used so
 * the component remains usable in isolation.
 */
export default function DataView({
    projects,
    project,
    view,
    resources,
    className = "",
}: DataViewProps): JSX.Element {
    const flatResources = React.useMemo(() => {
        if (resources) return resources;
        if (view && view.resources) return view.resources;
        if (projects && projects.length > 0)
            return projects.flatMap(
                (p) => (p as any).resources as AnyResource[],
            );
        if (project && (project as any).resources)
            return (project as any).resources as AnyResource[];
        return [] as AnyResource[];
    }, [resources, view, projects]);

    const totalResources = flatResources.length;
    const totalWords = flatResources.reduce(
        (acc: number, r: AnyResource) =>
            acc + ((r as any).metadata?.wordCount ?? (r as any).wordCount ?? 0),
        0,
    );

    const projectsCount = projects ? projects.length : project ? 1 : 1;

    return (
        <div className={`p-4 ${className}`}>
            <h2 className="text-lg font-semibold mb-4">
                Data — {project?.name ?? "No Project"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-3 bg-white rounded-md border text-sm">
                    <div className="text-slate-500">Projects</div>
                    <div className="text-xl font-medium">{projectsCount}</div>
                </div>
                <div className="p-3 bg-white rounded-md border text-sm">
                    <div className="text-slate-500">Resources</div>
                    <div className="text-xl font-medium">{totalResources}</div>
                </div>
                <div className="p-3 bg-white rounded-md border text-sm">
                    <div className="text-slate-500">Total words</div>
                    <div className="text-xl font-medium">{totalWords}</div>
                </div>
            </div>

            <section>
                <h3 className="text-sm font-medium mb-2">Resources</h3>
                <ul className="space-y-2">
                    {flatResources.map((r: AnyResource) => (
                        <li
                            key={r.id}
                            className="p-3 bg-white rounded-md border flex items-center justify-between"
                        >
                            <div>
                                <div className="text-sm font-medium">
                                    {(r as any).name ??
                                        (r as any).title ??
                                        r.id}
                                </div>
                                <div className="text-xs text-slate-500">
                                    {r.type}
                                </div>
                            </div>
                            <div className="text-xs text-slate-500">
                                {(r as any).metadata?.wordCount ??
                                    (r as any).wordCount ??
                                    0}{" "}
                                words
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
