import React from "react";
import type { AnyResource, Folder } from "../../../../src/lib/models/types";
import OrganizerCard from "./OrganizerCard";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  selectFolders,
  selectResources,
  setSelectedResourceId,
} from "../../../../src/store/resourcesSlice";
import { selectActiveProjectStatuses } from "../../../../src/store/projectsSlice";
import { Eye, EyeClosed } from "lucide-react";
import { shallowEqual } from "react-redux";
import Button from "../../../common/UI/Button";

export interface OrganizerViewProps {
  /** Whether to show the body/content of each resource */
  showBody?: boolean;
  /** Callback when the user toggles body visibility */
  onToggleBody?: (show: boolean) => void;
  /** Optional className for outer container */
  className?: string;
}

/**
 * `OrganizerView` renders a flat grid of cards for the direct children
 * (files and subfolders) of the currently selected folder. Clicking a
 * card's Open button selects that item, allowing navigation into subfolders.
 */
export default function OrganizerView({
  showBody = true,
  onToggleBody,
  className = "",
}: OrganizerViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(
    (s) => selectResources(s.resources),
    shallowEqual,
  );
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const selectedResourceId = useAppSelector(
    (s) => s.resources.selectedResourceId,
  );
  const defaultStatus =
    useAppSelector((s) => selectActiveProjectStatuses(s))[0] ?? "";

  const [showBodyState, setShowBodyState] = React.useState(showBody);

  const handleToggle = React.useCallback(() => {
    setShowBodyState((prev) => {
      const next = !prev;
      if (onToggleBody) onToggleBody(next);
      return next;
    });
  }, [onToggleBody]);

  const getEffectiveFolderParentId = (folder: Folder) =>
    folder.parentId ?? folder.folderId ?? null;

  const selectedFolder =
    folders.find((f) => f.id === selectedResourceId) ?? null;

  const childFolders = selectedFolder
    ? folders
        .filter((f) => getEffectiveFolderParentId(f) === selectedFolder.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const childResources = selectedFolder
    ? resources
        .filter((r) => r.folderId === selectedFolder.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const allChildren: AnyResource[] = [...childFolders, ...childResources];

  const handleOpen = (id: string) => dispatch(setSelectedResourceId(id));

  return (
    <div className={`p-4 overflow-y-scroll h-[calc(100vh-12rem)] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gw-h2 font-semibold text-gw-secondary">
          {selectedFolder ? selectedFolder.name : "Organizer"}
        </h2>
        <Button variant="secondary" onClick={handleToggle}>
          {showBodyState ? (
            <EyeClosed
              size={16}
              className="inline-block mr-1 text-gw-secondary"
            />
          ) : (
            <Eye size={16} className="inline-block mr-1 text-gw-secondary" />
          )}{" "}
          {showBodyState ? "Hide bodies" : "Show bodies"}
        </Button>
      </div>

      {!selectedFolder ? (
        <p className="text-sm text-gw-secondary">
          Select a folder to view its contents.
        </p>
      ) : allChildren.length === 0 ? (
        <p className="text-sm text-gw-secondary">This folder is empty.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allChildren.map((child) => (
            <OrganizerCard
              key={child.id}
              resource={child}
              showBody={showBodyState}
              defaultStatus={defaultStatus}
              onOpen={() => handleOpen(child.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
