"use client";

import React, { useState } from "react";
import type { ResourceRef } from "../../src/lib/models/types";
import "./value-picker.css";

export interface RefHoverPreviewProps {
  /** The resource ref to describe in the preview. */
  resource: ResourceRef;
  children: React.ReactNode;
}

/**
 * Wraps a child element and shows a hover popover with the referenced
 * resource's name and id. When id is null, the ref is marked as deleted.
 */
export default function RefHoverPreview({
  resource,
  children,
}: RefHoverPreviewProps): JSX.Element {
  const [isVisible, setVisible] = useState(false);

  return (
    <span
      className="ref-hover-preview"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {isVisible && (
        <div className="ref-hover-preview__popover" role="tooltip">
          <span className="ref-hover-preview__name">{resource.name}</span>
          {resource.id === null ? (
            <span className="ref-hover-preview__deleted">Deleted</span>
          ) : (
            <span className="ref-hover-preview__id">
              {resource.id.slice(0, 8)}…
            </span>
          )}
        </div>
      )}
    </span>
  );
}
