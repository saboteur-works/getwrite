"use client";

import React from "react";
import type { Project, AnyResource, Folder } from "../../src/lib/models/types";
import WordCountProgressBar from "./WordCountProgressBar";
import ResourceListItem from "./ResourceListItem";
import StubResourcesSection from "./StubResourcesSection";
import ResourceBreakdown, { type ResourceGroup } from "./ResourceBreakdown";

const STUB_WORD_THRESHOLD = 50;

type ResourceWithWordCount = AnyResource & {
    userMetadata?: { wordCount?: number };
    wordCount?: number;
};

function getWordCount(r: AnyResource): number {
    const rc = r as ResourceWithWordCount;
    return rc.userMetadata?.wordCount ?? rc.wordCount ?? 0;
}

export interface DataViewProps {
    /** Optional list of projects to show aggregate statistics for */
    projects?: Project[];
    /** The single project to display statistics for (used when `projects` is not provided) */
    project?: Project;
    /** Optional adapter view from `buildProjectView` (canonical models). */
    view?: { project: Project; folders: AnyResource[]; resources: AnyResource[] };
    /** Optional override flat list of resources to render (uses project(s).resources by default) */
    resources?: AnyResource[];
    /** Folder list used to group resources in the Breakdown section. */
    folders?: Folder[];
    className?: string;
}

type SortOrder = "lastEdited" | "name";

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
    folders,
    className = "",
}: DataViewProps): JSX.Element {
    const [sortOrder, setSortOrder] = React.useState<SortOrder>("lastEdited");

    const flatResources = React.useMemo(() => {
        if (resources) return resources;
        if (view && view.resources) return view.resources;
        if (projects && projects.length > 0)
            return projects.flatMap((p) => (p as Project & { resources?: AnyResource[] }).resources ?? []);
        if (project && (project as Project & { resources?: AnyResource[] }).resources)
            return (project as Project & { resources?: AnyResource[] }).resources as AnyResource[];
        return [] as AnyResource[];
    }, [resources, view, projects, project]);

    const sortedResources = React.useMemo(() => {
        return [...flatResources].sort((a, b) => {
            if (sortOrder === "name") {
                return (a.name ?? "").localeCompare(b.name ?? "");
            }
            const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
            const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
            const aSafe = Number.isNaN(aTime) ? 0 : aTime;
            const bSafe = Number.isNaN(bTime) ? 0 : bTime;
            return bSafe - aSafe;
        });
    }, [flatResources, sortOrder]);

    const wordCountGoal = project?.config?.wordCountGoal;

    const stubResources = React.useMemo(
        () => sortedResources.filter((r) => getWordCount(r) <= STUB_WORD_THRESHOLD),
        [sortedResources],
    );

    const contentResources = React.useMemo(
        () => sortedResources.filter((r) => getWordCount(r) > STUB_WORD_THRESHOLD),
        [sortedResources],
    );

    const folderMap = React.useMemo(() => {
        const map = new Map<string, string>();
        for (const f of folders ?? []) {
            map.set(f.id, f.name ?? "Unnamed");
        }
        return map;
    }, [folders]);

    const resourceGroups = React.useMemo<ResourceGroup[]>(() => {
        const byFolder = new Map<string, AnyResource[]>();
        for (const r of flatResources) {
            const key = r.folderId ?? "__ungrouped__";
            const existing = byFolder.get(key);
            if (existing) {
                existing.push(r);
            } else {
                byFolder.set(key, [r]);
            }
        }
        const groups: ResourceGroup[] = Array.from(byFolder.entries()).map(
            ([fid, rs]) => ({
                label:
                    fid === "__ungrouped__"
                        ? "Ungrouped"
                        : (folderMap.get(fid) ?? "Unknown"),
                resourceCount: rs.length,
                wordCount: rs.reduce((acc, r) => acc + getWordCount(r), 0),
            }),
        );
        groups.sort((a, b) => {
            if (a.label === "Ungrouped") return 1;
            if (b.label === "Ungrouped") return -1;
            return a.label.localeCompare(b.label);
        });
        return groups;
    }, [flatResources, folderMap]);

    const totalResources = flatResources.length;
    const totalWords = flatResources.reduce((acc: number, r: AnyResource) => acc + getWordCount(r), 0);

    return (
        <div className={`${className}`}>
            <div className="workarea-section">
                <h2 className="workarea-section-title">
                    Data — {project?.name ?? "No Project"}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="workarea-stat-card">
                        <div className="workarea-stat-label">Resources</div>
                        <div className="workarea-stat-value text-xl">
                            {totalResources}
                        </div>
                    </div>
                    <div className="workarea-stat-card">
                        <div className="workarea-stat-label">Total words</div>
                        <div className="workarea-stat-value text-xl">{totalWords}</div>
                    </div>
                </div>
            </div>

            {wordCountGoal && wordCountGoal > 0 ? (
                <div className="workarea-section">
                    <h3 className="workarea-section-title">Writing Goal</h3>
                    <WordCountProgressBar current={totalWords} goal={wordCountGoal} />
                </div>
            ) : null}

            {resourceGroups.length >= 2 ? (
                <ResourceBreakdown groups={resourceGroups} />
            ) : null}

            <div className="workarea-section">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="workarea-section-title">Resources</h3>
                    <div className="flex gap-3">
                        {(["lastEdited", "name"] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSortOrder(key)}
                                className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-150 ${
                                    sortOrder === key
                                        ? "text-gw-primary"
                                        : "text-gw-secondary hover:text-gw-primary"
                                }`}
                            >
                                {key === "lastEdited" ? "Last Edited" : "Name"}
                            </button>
                        ))}
                    </div>
                </div>
                <StubResourcesSection resources={stubResources} />
                <ul className="workarea-list">
                    {contentResources.map((r: AnyResource) => (
                        <ResourceListItem
                            key={r.id}
                            name={r.name ?? r.id}
                            type={r.type}
                            wordCount={getWordCount(r)}
                            lastEditedAt={r.updatedAt ?? r.createdAt}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
}
