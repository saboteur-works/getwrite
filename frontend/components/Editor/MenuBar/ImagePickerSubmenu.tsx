import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useAppSelector } from "../../../src/store/hooks";
import { selectResources } from "../../../src/store/resourcesSlice";
import { selectActiveProjectRootPath } from "../../../src/store/projectsSlice";
import type { ImageResource } from "../../../src/lib/models/types";
import { buildButtonClasses, TOOLBAR_TOOLTIP_ID } from "./editor-toolbar-icons";

export interface ImagePickerSubmenuProps {
  editor: Editor;
}

export default function ImagePickerSubmenu({
  editor,
}: ImagePickerSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const allResources = useAppSelector((s) => selectResources(s.resources));
  const projectPath = useAppSelector(selectActiveProjectRootPath);

  const imageResources = allResources.filter(
    (r): r is ImageResource => r.type === "image",
  );

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const update = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const handleInsert = (resource: ImageResource) => {
    if (!projectPath) return;
    const src = `/api/resource/${resource.id}/file?projectPath=${encodeURIComponent(projectPath)}`;
    editor
      .chain()
      .focus()
      .insertGetWriteImage({ src, resourceId: resource.id })
      .run();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="editor-menu-color-root">
      <button
        ref={buttonRef}
        type="button"
        data-tooltip-id={TOOLBAR_TOOLTIP_ID}
        data-tooltip-content="Insert Image"
        className={`editor-menu-icon-button ${buildButtonClasses(false, false)}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Insert image"
      >
        <ImageIcon size={16} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="editor-image-picker"
          role="menu"
          aria-label="Image picker"
          style={{
            position: "fixed",
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          {imageResources.length === 0 ? (
            <p className="editor-image-picker-empty">No images in project</p>
          ) : (
            <div className="editor-image-picker-grid">
              {imageResources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  className="editor-image-picker-item"
                  role="menuitem"
                  aria-label={`Insert ${resource.name}`}
                  onClick={() => handleInsert(resource)}
                >
                  {resource.file && projectPath ? (
                    <img
                      src={`/api/resource/${resource.id}/file?projectPath=${encodeURIComponent(projectPath)}`}
                      alt={resource.name}
                      className="editor-image-picker-thumb"
                    />
                  ) : (
                    <div className="editor-image-picker-thumb-placeholder">
                      <ImageIcon size={24} aria-hidden="true" />
                    </div>
                  )}
                  <span className="editor-image-picker-name">
                    {resource.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
