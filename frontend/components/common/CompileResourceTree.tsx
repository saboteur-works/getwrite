"use client";

import React, { useMemo, useState } from "react";
import type { AnyResource } from "../../src/lib/models/types";
import {
    buildCompileTree,
    getDescendantLeafIds,
    isFolderChecked,
    isFolderIndeterminate,
    toggleNode,
    ROOT_ITEM_ID,
    type CompileTree,
    type ResourceItemData,
} from "./compileSelection";
import {
    ChevronDown,
    ChevronRight,
    FileTextIcon,
    ImageIcon,
    AudioIcon,
    FolderIcon,
} from "../ResourceTree/ResourceTreeIcons";

export interface CompileResourceTreeProps {
    resources: AnyResource[];
    checkedIds: Set<string>;
    onChange: (ids: Set<string>) => void;
}

function initExpandedFolders(tree: CompileTree): Set<string> {
    return new Set(
        Object.values(tree)
            .filter((n) => n.isFolder && n.resourceId !== ROOT_ITEM_ID)
            .map((n) => n.resourceId),
    );
}

function sortedChildren(nodeId: string, tree: CompileTree): string[] {
    const node = tree[nodeId];
    if (!node) return [];
    return [...node.children].sort(
        (a, b) => (tree[a]?.orderIndex ?? 0) - (tree[b]?.orderIndex ?? 0),
    );
}

function renderLeafIcon(
    resourceType: ResourceItemData["resourceType"],
): React.ReactNode {
    switch (resourceType) {
        case "image":
            return <ImageIcon className="compile-tree-icon" />;
        case "audio":
            return <AudioIcon className="compile-tree-icon" />;
        default:
            return <FileTextIcon className="compile-tree-icon" />;
    }
}

export default function CompileResourceTree({
    resources,
    checkedIds,
    onChange,
}: CompileResourceTreeProps) {
    const tree = useMemo(() => buildCompileTree(resources), [resources]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() =>
        initExpandedFolders(tree),
    );

    function toggleExpand(folderId: string) {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    }

    function renderNode(nodeId: string, depth: number): React.ReactNode {
        const node = tree[nodeId];
        if (!node) return null;

        if (node.isFolder) {
            const isExpanded = expandedFolders.has(nodeId);
            const checked = isFolderChecked(nodeId, checkedIds, tree);
            const indeterminate = isFolderIndeterminate(
                nodeId,
                checkedIds,
                tree,
            );
            const leaves = getDescendantLeafIds(nodeId, tree);
            const hasLeaves = leaves.length > 0;

            return (
                <React.Fragment key={nodeId}>
                    <div
                        className="compile-tree-item"
                        style={{ paddingLeft: `${depth * 20 + 8}px` }}
                    >
                        <button
                            type="button"
                            className="compile-tree-chevron-button"
                            onClick={() => toggleExpand(nodeId)}
                            aria-label={
                                isExpanded
                                    ? `Collapse ${node.name}`
                                    : `Expand ${node.name}`
                            }
                        >
                            {isExpanded ? <ChevronDown /> : <ChevronRight />}
                        </button>
                        <label className="compile-tree-label">
                            <input
                                type="checkbox"
                                className="compile-tree-checkbox"
                                checked={checked}
                                disabled={!hasLeaves}
                                ref={(el) => {
                                    if (el) el.indeterminate = indeterminate;
                                }}
                                onChange={() =>
                                    onChange(toggleNode(nodeId, checkedIds, tree))
                                }
                                aria-label={node.name}
                            />
                            <FolderIcon className="compile-tree-icon" />
                            <span className="compile-tree-name">
                                {node.name}
                            </span>
                        </label>
                    </div>
                    {isExpanded &&
                        sortedChildren(nodeId, tree).map((childId) =>
                            renderNode(childId, depth + 1),
                        )}
                </React.Fragment>
            );
        }

        // Leaf node
        return (
            <div
                key={nodeId}
                className="compile-tree-item"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                <span
                    className="compile-tree-chevron-spacer"
                    aria-hidden="true"
                />
                <label className="compile-tree-label">
                    <input
                        type="checkbox"
                        className="compile-tree-checkbox"
                        checked={checkedIds.has(nodeId)}
                        onChange={() =>
                            onChange(toggleNode(nodeId, checkedIds, tree))
                        }
                        aria-label={node.name}
                    />
                    {renderLeafIcon(node.resourceType)}
                    <span className="compile-tree-name">{node.name}</span>
                </label>
            </div>
        );
    }

    return (
        <div
            className="compile-tree-root"
            role="tree"
            aria-label="Resources to compile"
            data-testid="compile-resource-tree"
        >
            {sortedChildren(ROOT_ITEM_ID, tree).map((childId) =>
                renderNode(childId, 0),
            )}
        </div>
    );
}
