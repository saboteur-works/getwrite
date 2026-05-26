"use client";

import React from "react";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import useAppSelector from "../../../src/store/hooks";
import { selectActiveProjectRootPath } from "../../../src/store/projectsSlice";
import type {
  ImageResource,
  AudioResource,
} from "../../../src/lib/models/types";

export interface MediaViewProps {
  /** The selected image or audio resource to display. */
  resource: ImageResource | AudioResource;
  className?: string;
}

/**
 * Builds the file-serving URL for a media resource. The serving route requires
 * the project root as a query parameter, so it must be supplied and encoded.
 */
export function mediaFileUrl(resourceId: string, projectPath: string): string {
  return `/api/resource/${resourceId}/file?projectPath=${encodeURIComponent(
    projectPath,
  )}`;
}

/**
 * Container that renders the appropriate viewer for the selected media
 * resource: an {@link ImageViewer} for images, an {@link AudioPlayer} for
 * audio. Resolves the active project root from the store to build the
 * file-serving URL the viewers load from.
 */
export default function MediaView({
  resource,
  className = "",
}: MediaViewProps): JSX.Element {
  const projectPath = useAppSelector(selectActiveProjectRootPath);

  if (!projectPath) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center px-4">
        <p className="text-sm text-gw-secondary">
          Open a project to view this media.
        </p>
      </div>
    );
  }

  const src = mediaFileUrl(resource.id, projectPath);

  if (resource.type === "image") {
    return <ImageViewer src={src} alt={resource.name} className={className} />;
  }

  return (
    <AudioPlayer
      src={src}
      durationSeconds={resource.durationSeconds}
      className={className}
    />
  );
}
