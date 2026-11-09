"use client";

import React from "react";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import { useResourceObjectUrl } from "../../Sources/useResourceObjectUrl";
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

  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") {
    return (
      <NativeMediaView
        resource={resource}
        projectId={projectId}
        className={className}
      />
    );
  }

  return (
    <MediaViewer
      resource={resource}
      src={mediaFileUrl(resource.id, projectId)}
      className={className}
    />
  );
}

interface MediaViewerProps {
  resource: ImageResource | AudioResource;
  src: string;
  className: string;
}

/** Mounts the image viewer or audio player for an already-resolved `src`. */
function MediaViewer({
  resource,
  src,
  className,
}: MediaViewerProps): JSX.Element {
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

interface NativeMediaViewProps {
  resource: ImageResource | AudioResource;
  projectId: string;
  className: string;
}

/**
 * Native only (a separate component so the hook is never called
 * conditionally): reads the file in process and mounts the viewer with the
 * blob URL, or shows loading, the refusal, the lock or the failure message.
 */
function NativeMediaView({
  resource,
  projectId,
  className,
}: NativeMediaViewProps): JSX.Element {
  const state = useResourceObjectUrl(projectId, resource.id);

  if (state.status === "ready") {
    return (
      <MediaViewer resource={resource} src={state.url} className={className} />
    );
  }
  if (state.status === "loading") return <MediaStatusMessage />;
  return <MediaStatusMessage message={state.message} />;
}

export interface MediaStatusMessageProps {
  /** A refusal, lock or failure message (role="alert"). Omit for loading. */
  message?: string;
}

/**
 * The native read's non-media states, shown before a viewer mounts: a
 * loading line, or a message announced as an alert.
 */
export function MediaStatusMessage({
  message,
}: MediaStatusMessageProps): JSX.Element {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center px-4">
      {message === undefined ? (
        <p role="status" className="text-sm text-gw-secondary">
          Loading…
        </p>
      ) : (
        <p role="alert" className="text-sm text-gw-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
