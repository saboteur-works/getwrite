"use client";

import { useEffect, useRef, useState } from "react";
import { X, FilePlus2, Upload } from "lucide-react";
import type {
  ResourceType as CanonicalResourceType,
  Folder,
} from "../../src/lib/models/types";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";
import FolderTreePicker from "./FolderTreePicker";

type ResourceType = CanonicalResourceType | string;

const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.heic";
const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.ogg,.flac,.aac";

function isMediaType(type: ResourceType): type is "image" | "audio" {
  return type === "image" || type === "audio";
}

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
    opts?: { [key: string]: unknown },
  ) => void;
  /** Called instead of onCreate when the user creates an image or audio resource. */
  onUpload?: (
    file: File,
    opts: { title: string; folderId?: string },
  ) => Promise<void>;
}

/**
 * Modal to create a resource. Handles text/folder via `onCreate` and
 * image/audio via `onUpload` (which accepts the binary file directly).
 */
export default function CreateResourceModal({
  isOpen,
  initialTitle = "New Resource",
  initialType = "text",
  parentId,
  parents = [],
  onClose,
  onCreate,
  onUpload,
}: CreateResourceModalProps): JSX.Element | null {
  const [title, setTitle] = useState<string>(initialTitle);
  const [type, setType] = useState<ResourceType>(initialType as ResourceType);
  const [selectedParent, setSelectedParent] = useState<string | undefined>(
    parentId,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setType(initialType);
    setSelectedParent(parentId);
    setSelectedFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialTitle, initialType, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  const handleTypeChange = (next: ResourceType) => {
    setType(next);
    setSelectedFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (isMediaType(type)) {
      if (!selectedFile) {
        setUploadError("Please select a file.");
        return;
      }
      if (!onUpload) return;
      setIsUploading(true);
      setUploadError(null);
      try {
        await onUpload(selectedFile, {
          title: trimmed,
          folderId: selectedParent,
        });
        onClose?.();
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : "Upload failed. Please try again.",
        );
      } finally {
        setIsUploading(false);
      }
      return;
    }

    onCreate?.(
      { title: trimmed, type, folderId: selectedParent },
      selectedParent,
      { title: trimmed },
    );
    onClose?.();
  };

  const accept =
    type === "image"
      ? IMAGE_ACCEPT
      : type === "audio"
        ? AUDIO_ACCEPT
        : undefined;

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
        <div>
          <DialogTitle asChild>
            <h3 className="project-modal-title">
              {initialTitle ? "Create resource" : "New resource"}
            </h3>
          </DialogTitle>

          <div className="project-modal-field">
            <label className="project-modal-label" htmlFor="resource-title">
              Title
            </label>
            <Input
              id="resource-title"
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isMediaType(type)) handleCreate();
              }}
              className="w-full mt-1"
              aria-label="resource-title"
            />
          </div>

          <div className="project-modal-field">
            <label className="project-modal-label" htmlFor="resource-type">
              Type
            </label>
            <Select
              id="resource-type"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as ResourceType)}
              className="w-full mt-1"
              aria-label="resource-type"
            >
              <option value="text">Document</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="folder">Folder</option>
            </Select>
          </div>

          {isMediaType(type) && (
            <div className="project-modal-field">
              <label className="project-modal-label" htmlFor="resource-file">
                File
              </label>
              <input
                ref={fileInputRef}
                id="resource-file"
                type="file"
                accept={accept}
                aria-label="resource-file"
                className="w-full mt-1 text-sm"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  setUploadError(null);
                }}
              />
              {uploadError && (
                <p
                  className="mt-1 text-sm text-[var(--color-mid)]"
                  role="alert"
                >
                  {uploadError}
                </p>
              )}
            </div>
          )}

          <div className="project-modal-field">
            <label className="project-modal-label" htmlFor="resource-parent">
              Parent folder
            </label>
            <FolderTreePicker
              id="resource-parent"
              folders={parents}
              value={selectedParent}
              onChange={setSelectedParent}
              className="mt-1"
              aria-label="resource-parent"
            />
          </div>

          <div className="project-modal-actions">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isUploading}
            >
              <X size={14} aria-hidden="true" />
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleCreate}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Upload size={14} aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                <>
                  <FilePlus2 size={14} aria-hidden="true" />
                  Create
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
