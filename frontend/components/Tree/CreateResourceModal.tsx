import React, { useEffect, useRef, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
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
    initialTitle = "",
    initialType = "",
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="z-10 bg-white rounded-md shadow-lg max-w-lg w-full p-6">
                <h3 className="text-lg font-medium">
                    {initialTitle ? "Create resource" : "New resource"}
                </h3>

                <div className="p-2">
                    <label className="text-sm font-medium">Title</label>
                    <input
                        ref={inputRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full border rounded px-2 py-1 mt-1"
                        aria-label="resource-title"
                    />

                    <label className="text-sm font-medium mt-3 block">
                        Type
                    </label>
                    <select
                        value={type}
                        onChange={(e) =>
                            setType(e.target.value as ResourceType)
                        }
                        className="w-full border rounded px-2 py-1 mt-1"
                        aria-label="resource-type"
                    >
                        <option value="text">Document</option>
                        <option value="folder">Folder</option>
                    </select>

                    <label className="text-sm font-medium mt-3 block">
                        Parent folder
                    </label>
                    <select
                        value={selectedParent ?? ""}
                        onChange={(e) =>
                            setSelectedParent(
                                e.target.value === ""
                                    ? undefined
                                    : e.target.value,
                            )
                        }
                        className="w-full border rounded px-2 py-1 mt-1"
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

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1 rounded border"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        className="px-3 py-1 rounded bg-brand-500 text-white"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
