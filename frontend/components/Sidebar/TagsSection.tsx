"use client";

import { useEffect, useState } from "react";
import { shallowEqual } from "react-redux";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import type { Tag } from "../../src/lib/models/types";
import {
  listTags,
  listTagAssignments,
  assignTag,
} from "../../src/lib/api/tags";
import Chip from "../common/UI/Chip";

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

  const resourceId = useAppSelector(
    (state) => selectResource(state.resources)?.id ?? null,
    shallowEqual,
  );

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>([]);

  // Load project tag list when projectPath becomes available
  useEffect(() => {
    if (!projectPath) return;
    listTags(projectPath)
      .then(setAllTags)
      .catch(() => setAllTags([]));
  }, [projectPath]);

  // Load assignments for the selected resource whenever it changes
  useEffect(() => {
    if (!projectPath || !resourceId) {
      setAssignedTagIds([]);
      return;
    }
    listTagAssignments(projectPath, resourceId)
      .then(setAssignedTagIds)
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
      await assignTag(projectPath, resourceId, tagId, !isAssigned);
    } catch {
      // Revert optimistic update on failure
      setAssignedTagIds((prev) =>
        isAssigned ? [...prev, tagId] : prev.filter((id) => id !== tagId),
      );
    }
  };

  if (!projectPath) return null;

  return (
    <div className="mt-0">
      <div className="flex flex-wrap gap-1">
        {allTags.length === 0 ? (
          <p className="text-gw-label tracking-label text-gw-secondary leading-snug">
            No tags yet. Create some in Project Settings.
          </p>
        ) : (
          allTags.map((tag) => {
            const isActive = assignedTagIds.includes(tag.id);
            return (
              <Chip
                key={tag.id}
                label={tag.name}
                shape="sharp"
                size="sm"
                color={tag.color}
                active={isActive && !!tag.color}
                tagActive={isActive && !tag.color}
                onClick={() => void handleToggle(tag.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
