"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";

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
}: RenameResourceModalProps): JSX.Element {
  const [name, setName] = useState<string>(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName, isOpen]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm?.(trimmed);
    onClose?.();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        maxWidth="max-w-[480px]"
        className="p-6"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle asChild>
          <h3 className="text-lg font-medium text-gw-primary">
            Rename resource
          </h3>
        </DialogTitle>

        <div className="p-2">
          <label className="text-sm font-medium text-gw-secondary">Name</label>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            className="w-full mt-1"
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
      </DialogContent>
    </Dialog>
  );
}
