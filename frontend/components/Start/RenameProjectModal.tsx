import React, { useEffect, useRef, useState } from "react";

export interface RenameProjectModalProps {
    isOpen: boolean;
    initialName?: string;
    onClose?: () => void;
    onConfirm?: (newName: string) => void;
}

export default function RenameProjectModal({
    isOpen,
    initialName = "",
    onClose,
    onConfirm,
}: RenameProjectModalProps): JSX.Element | null {
    const [name, setName] = useState<string>(initialName);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setName(initialName);
    }, [initialName, isOpen]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onConfirm?.(trimmed);
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

            <div className="z-10 bg-gw-chrome rounded-md max-w-md w-full p-6">
                <h3 className="text-lg font-medium text-gw-primary">Rename project</h3>

                <div className="p-2">
                    <label className="text-sm font-medium text-gw-secondary">Name</label>
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border border-gw-border rounded px-2 py-1 mt-1 bg-gw-chrome text-gw-primary"
                        aria-label="rename-project-input"
                    />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="border border-gw-primary text-gw-primary bg-transparent rounded-md font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2 hover:bg-gw-chrome2 transition-colors duration-150"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="border border-gw-primary text-gw-primary bg-transparent rounded-md font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2 hover:bg-gw-chrome2 transition-colors duration-150"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
