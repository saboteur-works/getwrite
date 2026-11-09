import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useAppSelector } from "../../../src/store/hooks";
import { selectResources } from "../../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../../src/store/projectsSlice";
import type { ImageResource } from "../../../src/lib/models/types";
import { resolveGetWriteImageSrc } from "../Extensions/GetWriteImage";
import { buildButtonClasses, TOOLBAR_TOOLTIP_ID } from "./editor-toolbar-icons";
import ImagePickerThumb from "./ImagePickerThumb";

/** Smallest gap kept between the picker and a viewport edge, in CSS px. */
const VIEWPORT_MARGIN = 8;

export interface ImagePickerSubmenuProps {
  editor: Editor;
}

export default function ImagePickerSubmenu({
  editor,
}: ImagePickerSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const allResources = useAppSelector((s) => selectResources(s.resources));
  const projectId = useAppSelector(selectActiveProjectDirectoryId);

  const imageResources = allResources.filter(
    (r): r is ImageResource => r.type === "image",
  );

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

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
  }, [isOpen]);

  // Keep the fixed-position picker fully inside the viewport (phone width).
  // At a width where it already fits, this changes nothing.
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        menuPosition.left,
        window.innerWidth - rect.width - VIEWPORT_MARGIN,
      ),
    );
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        menuPosition.top,
        window.innerHeight - rect.height - VIEWPORT_MARGIN,
      ),
    );
    if (left === menuPosition.left && top === menuPosition.top) return;
    setMenuPosition({ top, left });
  }, [isOpen, menuPosition.left, menuPosition.top]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const handleInsert = (resource: ImageResource) => {
    if (!projectId) return;
    editor
      .chain()
      .focus()
      .insertGetWriteImage({
        src: resolveGetWriteImageSrc(resource.id, null, projectId),
        resourceId: resource.id,
      })
      .run();
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="editor-menu-color-root">
      <button
        ref={buttonRef}
        type="button"
        data-tooltip-id={TOOLBAR_TOOLTIP_ID}
        data-tooltip-content="Insert Image"
        className={`editor-menu-icon-button ${buildButtonClasses(false, false)}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Insert image"
      >
        <ImageIcon size={16} />
      </button>

      {isOpen
        ? createPortal(
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
                <p className="editor-image-picker-empty">
                  No images in project
                </p>
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
                      <ImagePickerThumb
                        resource={resource}
                        projectId={projectId}
                      />
                      <span className="editor-image-picker-name">
                        {resource.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
