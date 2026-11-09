import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { ImageResource } from "../../../src/lib/models/types";
import { resourceBlobCache } from "../../../src/lib/resource-blob-cache";
import type { ResourceBlobHolder } from "../../../src/lib/resource-blob-cache";
import { observeNearViewport } from "../../../src/lib/near-viewport";
import {
  RESOURCE_FAILED_STATE,
  type ResourceObjectUrlState,
} from "../../../src/lib/resource-object-url-state";
import { createMediaPlaceholder } from "../Extensions/media-placeholder";
import { resolveGetWriteImageSrc } from "../Extensions/GetWriteImage";

export interface ImagePickerThumbProps {
  resource: ImageResource;
  projectId: string | null;
}

/** The shared placeholder box, sized for a picker entry. */
export function PickerPlaceholder({ message }: { message?: string }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const box = createMediaPlaceholder(message);
    box.style.padding = "4px";
    box.style.fontSize = "10px";
    box.style.gap = "4px";
    box.style.flexDirection = "column";
    box.style.textAlign = "center";
    if (message !== undefined) box.title = message;
    host.replaceChildren(box);
    return () => host.replaceChildren();
  }, [message]);
  return <span ref={hostRef} className="block max-w-full" />;
}

/** Native entry: reads its picture through the shared cache once near. */
function NativePickerThumb({
  resource,
  projectId,
}: {
  resource: ImageResource;
  projectId: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ResourceObjectUrlState>({
    status: "loading",
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let holder: ResourceBlobHolder | null = null;
    const stopObserving = observeNearViewport(box, () => {
      holder = resourceBlobCache.acquire(projectId, resource.id, setState);
      setState(holder.getState());
    });
    return () => {
      stopObserving();
      holder?.release();
    };
  }, [projectId, resource.id]);

  let content: React.ReactNode;
  if (state.status === "ready" && state.kind === "image") {
    content = (
      <img
        src={state.url}
        alt={resource.name}
        className="editor-image-picker-thumb"
      />
    );
  } else if (state.status === "loading") {
    content = <PickerPlaceholder />;
  } else if (state.status === "ready") {
    content = <PickerPlaceholder message={RESOURCE_FAILED_STATE_MESSAGE} />;
  } else {
    content = <PickerPlaceholder message={state.message} />;
  }
  return <div ref={boxRef}>{content}</div>;
}

const RESOURCE_FAILED_STATE_MESSAGE: string =
  RESOURCE_FAILED_STATE.status === "failed"
    ? RESOURCE_FAILED_STATE.message
    : "";

/** One picker entry's picture: web `<img>`, native lazy read, or a stand-in. */
export default function ImagePickerThumb({
  resource,
  projectId,
}: ImagePickerThumbProps) {
  if (!resource.file || !projectId) {
    return (
      <div className="editor-image-picker-thumb-placeholder">
        <ImageIcon size={24} aria-hidden="true" />
      </div>
    );
  }
  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") {
    return <NativePickerThumb resource={resource} projectId={projectId} />;
  }
  return (
    <img
      src={resolveGetWriteImageSrc(resource.id, null, projectId)}
      alt={resource.name}
      className="editor-image-picker-thumb"
    />
  );
}
