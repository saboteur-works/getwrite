"use client";

import { useEffect, useState } from "react";
import { shallowEqual } from "react-redux";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import type { Tag } from "../../src/lib/models/types";
import LabeledField from "./controls/LabeledField";

/**
 * Sidebar section that displays all project-level tags as toggleable chips.
 * Assigned tags for the selected resource are shown in the active state.
 *
 * Reads `projectPath` and `resourceId` from Redux — no external props needed.
 */
export default function TagsSection(): JSX.Element | null {
    const projectPath = useAppSelector((state) => {
        const id = state.projects.selectedProjectId;
        if (!id) return null;
        return state.projects.projects[id]?.rootPath ?? null;
    });

    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );

    const resourceId = selectedResource?.id ?? null;

    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [assignedTagIds, setAssignedTagIds] = useState<string[]>([]);

    // Load project tag list when projectPath becomes available
    useEffect(() => {
        if (!projectPath) return;
        fetch("/api/project/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list", projectPath }),
        })
            .then((r) => r.json())
            .then((data: { tags?: Tag[] }) => setAllTags(data.tags ?? []))
            .catch(() => setAllTags([]));
    }, [projectPath]);

    // Load assignments for the selected resource whenever it changes
    useEffect(() => {
        if (!projectPath || !resourceId) {
            setAssignedTagIds([]);
            return;
        }
        fetch("/api/project/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "assignments",
                projectPath,
                resourceId,
            }),
        })
            .then((r) => r.json())
            .then((data: { tagIds?: string[] }) =>
                setAssignedTagIds(data.tagIds ?? []),
            )
            .catch(() => setAssignedTagIds([]));
    }, [projectPath, resourceId]);

    const handleToggle = async (tagId: string) => {
        if (!projectPath || !resourceId) return;
        const isAssigned = assignedTagIds.includes(tagId);
        // Optimistic update
        setAssignedTagIds((prev) =>
            isAssigned ? prev.filter((id) => id !== tagId) : [...prev, tagId],
        );
        try {
            await fetch("/api/project/tags/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath,
                    resourceId,
                    tagId,
                    assign: !isAssigned,
                }),
            });
        } catch {
            // Revert optimistic update on failure
            setAssignedTagIds((prev) =>
                isAssigned
                    ? [...prev, tagId]
                    : prev.filter((id) => id !== tagId),
            );
        }
    };

    if (!projectPath) return null;

    return (
        <div className="mt-6">
            <LabeledField label="Tags">
                <div className="mt-2 flex flex-wrap gap-1">
                    {allTags.length === 0 ? (
                        <p className="text-[11px] text-gw-secondary leading-snug">
                            No tags yet. Create some in Project Settings.
                        </p>
                    ) : (
                        allTags.map((tag) => {
                            const isActive = assignedTagIds.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => void handleToggle(tag.id)}
                                    className={`metadata-sidebar-tag${isActive ? " metadata-sidebar-tag--active" : ""}`}
                                    style={
                                        tag.color
                                            ? isActive
                                                ? {
                                                      borderColor: tag.color,
                                                      backgroundColor: tag.color,
                                                      color: "#fff",
                                                  }
                                                : {
                                                      borderColor: tag.color,
                                                      color: tag.color,
                                                  }
                                            : undefined
                                    }
                                >
                                    {tag.name}
                                </button>
                            );
                        })
                    )}
                </div>
            </LabeledField>
        </div>
    );
}
