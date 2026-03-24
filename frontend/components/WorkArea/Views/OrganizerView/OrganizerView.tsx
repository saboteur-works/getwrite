import React from "react";
import type { AnyResource } from "../../../../src/lib/models/types";
import OrganizerCard from "./OrganizerCard";
import useAppSelector from "../../../../src/store/hooks";
import {
    selectFolders,
    selectResources,
} from "../../../../src/store/resourcesSlice";
import { ChevronRight, ChevronDown, Eye, EyeClosed } from "lucide-react";
import { shallowEqual } from "react-redux";

export interface OrganizerViewProps {
    /** Resources to display as cards */
    resources: AnyResource[];
    /** Whether to show the body/content of each resource */
    showBody?: boolean;
    /** Callback when the user toggles body visibility */
    onToggleBody?: (show: boolean) => void;
    /** Optional className for outer container */
    className?: string;
}

/**
 * `OrganizerView` renders a hierarchical grid of resource cards used
 * to visually browse resources organized by folder structure. Each card
 * shows the title, type and a small metadata summary. The parent may control
 * whether the resource body is visible via `showBody` or toggle it with
 * `onToggleBody`.
 *
 * Folders can be nested and are rendered with indentation reflecting
 * their depth in the hierarchy.
 */
export default function OrganizerView({
    showBody = true,
    onToggleBody,
    className = "",
}: OrganizerViewProps): JSX.Element {
    const resources = useAppSelector(
        (s) => selectResources(s.resources),
        shallowEqual,
    );
    const folders = useAppSelector(
        (s) => selectFolders(s.resources),
        shallowEqual,
    );

    const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(
        new Set(),
    );

    const [showBodyState, setShowBodyState] = React.useState(showBody);

    const toggleFolderExpansion = (folderId: string) => {
        setExpandedFolders((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) newSet.delete(folderId);
            else newSet.add(folderId);
            return newSet;
        });
    };

    const filterResourcesByFolder = (folderId: string) => {
        return resources.filter((resource) => resource.folderId === folderId);
    };

    const getChildFolders = (parentId: string | null) => {
        return folders.filter((folder) => folder.folderId === parentId);
    };

    const getRootFolders = () => {
        return folders.filter((folder) => !folder.folderId);
    };

    const handleToggle = React.useCallback(() => {
        setShowBodyState((prev) => !prev);
        if (onToggleBody) onToggleBody(!showBodyState);
    }, [onToggleBody, showBodyState]);

    /**
     * Recursively renders a folder and its subfolders with proper indentation.
     *
     * @param folder - The folder to render
     * @param depth - The nesting depth (0 for root)
     * @returns JSX representing the folder and its contents
     */
    const renderFolderTree = (folder: AnyResource, depth: number = 0) => {
        const folderResources = filterResourcesByFolder(folder.id);
        const childFolders = getChildFolders(folder.id);
        const isExpanded = expandedFolders.has(folder.id);
        const paddingLeft = depth * 1.5;

        return (
            <div key={folder.id} style={{ marginLeft: `${paddingLeft}rem` }}>
                <button
                    type="button"
                    className="flex items-center mb-2 group"
                    onClick={() => toggleFolderExpansion(folder.id)}
                >
                    {isExpanded ? (
                        <ChevronDown
                            className="mr-1 text-gw-secondary"
                            size={16}
                        />
                    ) : (
                        <ChevronRight
                            className="mr-1 text-gw-secondary"
                            size={16}
                        />
                    )}
                    <h3 className="text-sm font-medium group-hover:underline">
                        {folder.name} (
                        {folderResources.length + childFolders.length})
                    </h3>
                </button>

                {isExpanded && (
                    <>
                        {folderResources.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                                {folderResources.map((r) => (
                                    <OrganizerCard
                                        key={r.id}
                                        resource={r}
                                        showBody={showBodyState}
                                    />
                                ))}
                            </div>
                        )}

                        {childFolders.length > 0 && (
                            <div className="mt-2 mb-3">
                                {childFolders.map((childFolder) =>
                                    renderFolderTree(childFolder, depth + 1),
                                )}
                            </div>
                        )}

                        {folderResources.length === 0 &&
                            childFolders.length === 0 && (
                                <p className="text-xs mb-2 text-gw-secondary">
                                    No resources or subfolders
                                </p>
                            )}
                    </>
                )}
            </div>
        );
    };

    return (
        <div
            className={`p-4 overflow-y-scroll h-[calc(100vh-12rem)] ${className}`}
        >
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Organizer</h2>
                <div>
                    <button
                        type="button"
                        onClick={handleToggle}
                        className="px-3 py-1 text-sm border border-gw-border rounded-md workarea-button bg-gw-chrome"
                    >
                        {showBodyState ? (
                            <EyeClosed
                                className="inline-block mr-1 text-gw-secondary"
                            />
                        ) : (
                            <Eye
                                className="inline-block mr-1 text-gw-secondary"
                            />
                        )}{" "}
                        {showBodyState ? "Hide bodies" : "Show bodies"}
                    </button>
                </div>
            </div>

            {getRootFolders().map((f) => renderFolderTree(f, 0))}
        </div>
    );
}
