import React, { useEffect, useRef, useState } from "react";
import { X, FilePlus2 } from "lucide-react";
import type {
    AnyResource,
    ResourceType as CanonicalResourceType,
    Folder,
} from "../../src/lib/models/types";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";

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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
            <DialogContent
                maxWidth="max-w-[480px]"
                className="p-6"
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
            >
            <div>
                <DialogTitle asChild>
                    <h3 className="project-modal-title">
                        {initialTitle ? "Create resource" : "New resource"}
                    </h3>
                </DialogTitle>

                <div className="project-modal-field">
                    <label
                        className="project-modal-label"
                        htmlFor="resource-title"
                    >
                        Title
                    </label>
                    <Input
                        id="resource-title"
                        ref={inputRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full mt-1"
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
                    <Select
                        id="resource-type"
                        value={type}
                        onChange={(e) =>
                            setType(e.target.value as ResourceType)
                        }
                        className="w-full mt-1"
                        aria-label="resource-type"
                    >
                        <option value="text">Document</option>
                        <option value="folder">Folder</option>
                    </Select>
                </div>

                <div className="project-modal-field">
                    <label
                        className="project-modal-label"
                        htmlFor="resource-parent"
                    >
                        Parent folder
                    </label>
                    <Select
                        id="resource-parent"
                        value={selectedParent ?? ""}
                        onChange={(e) =>
                            setSelectedParent(
                                e.target.value === ""
                                    ? undefined
                                    : e.target.value,
                            )
                        }
                        className="w-full mt-1"
                        aria-label="resource-parent"
                    >
                        <option value="">Project Root</option>
                        {parents.map((p: Folder) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="project-modal-actions">
                    <Button variant="secondary" onClick={onClose}>
                        <X size={14} aria-hidden="true" />
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={handleCreate}>
                        <FilePlus2 size={14} aria-hidden="true" />
                        Create
                    </Button>
                </div>
            </div>
            </DialogContent>
        </Dialog>
    );
}
