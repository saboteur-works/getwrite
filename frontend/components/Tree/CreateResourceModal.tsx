import React, { useEffect, useRef, useState } from "react";
import { X, FilePlus2 } from "lucide-react";
import type {
    AnyResource,
    ResourceType as CanonicalResourceType,
    Folder,
} from "../../src/lib/models/types";

type ResourceType = CanonicalResourceType | string;

export interface CreateResourcePayload {
    title: string;
    type: CanonicalResourceType | string;
    folderId?: string;
}

export interface CreateResourceModalProps {
    isOpen: boolean;
    initialTitle?: string;
    initialType?: ResourceType;
    parentId?: string;
    /** Available parent folders to place the new resource under (optional) */
    parents?: Folder[];
    onClose?: () => void;
    onCreate?: (
        payload: CreateResourcePayload,
        parentId?: string,
        opts?: { [key: string]: any },
    ) => void;
}

/**
 * Simple modal to create a resource (UI-only). Calls `onCreate` with title/type.
 */
export default function CreateResourceModal({
    isOpen,
    initialTitle = "New Resource",
    initialType = "text",
    parentId,
    parents = [],
    onClose,
    onCreate,
}: CreateResourceModalProps): JSX.Element | null {
    const [title, setTitle] = useState<string>(initialTitle);
    const [type, setType] = useState<ResourceType>(initialType as ResourceType);
    const [selectedParent, setSelectedParent] = useState<string | undefined>(
        parentId,
    );
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setTitle(initialTitle);
        setType(initialType);
        setSelectedParent(parentId);
    }, [initialTitle, initialType, isOpen]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    const handleCreate = () => {
        const trimmed = title.trim();
        if (!trimmed) return;
        onCreate?.(
            { title: trimmed, type, folderId: selectedParent },
            selectedParent,
            {
                title: trimmed,
            },
        );
        onClose?.();
    };

    if (!isOpen) return null;

    return (
        <div className="project-modal-root">
            <div
                className="project-modal-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="project-modal-panel">
                <h3 className="project-modal-title">
                    {initialTitle ? "Create resource" : "New resource"}
                </h3>

                <div className="project-modal-field">
                    <label
                        className="project-modal-label"
                        htmlFor="resource-title"
                    >
                        Title
                    </label>
                    <input
                        id="resource-title"
                        ref={inputRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="project-modal-input"
                        aria-label="resource-title"
                    />
                </div>

                <div className="project-modal-field">
                    <label
                        className="project-modal-label"
                        htmlFor="resource-type"
                    >
                        Type
                    </label>
                    <select
                        id="resource-type"
                        value={type}
                        onChange={(e) =>
                            setType(e.target.value as ResourceType)
                        }
                        className="project-modal-select"
                        aria-label="resource-type"
                    >
                        <option value="text">Document</option>
                        <option value="folder">Folder</option>
                    </select>
                </div>

                <div className="project-modal-field">
                    <label
                        className="project-modal-label"
                        htmlFor="resource-parent"
                    >
                        Parent folder
                    </label>
                    <select
                        id="resource-parent"
                        value={selectedParent ?? ""}
                        onChange={(e) =>
                            setSelectedParent(
                                e.target.value === ""
                                    ? undefined
                                    : e.target.value,
                            )
                        }
                        className="project-modal-select"
                        aria-label="resource-parent"
                    >
                        <option value="">(root)</option>
                        {parents.map((p: Folder) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="project-modal-actions">
                    <button
                        type="button"
                        onClick={onClose}
                        className="project-modal-button project-modal-button-secondary"
                    >
                        <X size={14} aria-hidden="true" />
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        className="project-modal-button project-modal-button-primary"
                    >
                        <FilePlus2 size={14} aria-hidden="true" />
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
