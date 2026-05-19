"use client";

import React, { useEffect, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";

export interface RenameResourceModalProps {
    isOpen: boolean;
    initialName?: string;
    onClose?: () => void;
    onConfirm?: (newName: string) => void;
}

export default function RenameResourceModal({
    isOpen,
    initialName = "",
    onClose,
    onConfirm,
}: RenameResourceModalProps): JSX.Element | null {
    const [name, setName] = useState<string>(initialName);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setName(initialName);
    }, [initialName, isOpen]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose?.();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

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
                <h3 className="text-lg font-medium text-gw-primary">Rename resource</h3>

                <div className="p-2">
                    <label className="text-sm font-medium text-gw-secondary">Name</label>
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            else if (e.key === "Escape") onClose?.();
                        }}
                        className="w-full border border-gw-border rounded px-2 py-1 mt-1 bg-gw-chrome text-gw-primary"
                        aria-label="rename-resource-input"
                    />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={handleSave}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
