"use client";

import React from "react";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import useAppSelector from "../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../src/store/projectsSlice";
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
 * Builds the file-serving URL for a media resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/[resource-id]/file` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export function mediaFileUrl(resourceId: string, projectId: string): string {
  return `/api/resource/${resourceId}/file?projectId=${encodeURIComponent(
    projectId,
  )}`;
}

/**
 * Container that renders the appropriate viewer for the selected media
 * resource: an {@link ImageViewer} for images, an {@link AudioPlayer} for
 * audio. Resolves the active project's on-disk directory basename from the
 * store to build the file-serving URL the viewers load from.
 */
export default function MediaView({
  resource,
  className = "",
}: MediaViewProps): JSX.Element {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);

  if (!projectId) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center px-4">
        <p className="text-sm text-gw-secondary">
          Open a project to view this media.
        </p>
      </div>
    );
  }

  const src = mediaFileUrl(resource.id, projectId);

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
