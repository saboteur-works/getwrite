import type { HTMLAttributes, CSSProperties } from "react";
import type {
  AnyResource,
  TextResource,
} from "../../../../src/lib/models/types";
import Card from "../../../common/UI/Card/Card";
import {
  FileTextIcon,
  AudioIcon,
  ImageIcon,
  FolderIcon,
} from "../../../ResourceTree/ResourceTreeIcons";
import { GripVertical } from "lucide-react";

/**
 * @module OrganizerCard
 * Renders a compact, presentational card for a single resource inside the
 * organizer view. The card displays title, type, last-updated date, optional
 * body preview, and key metadata summaries.
 */

/**
 * Props accepted by {@link OrganizerCard}.
 */
export interface OrganizerCardProps {
  /**
   * Resource model rendered by the card.
   *
   * @remarks
   * The component supports any resource variant (`text`, `image`, `audio`,
   * `folder`) and derives display fields from common/shared properties.
   */
  resource: AnyResource;
  /**
   * Whether to render the resource body preview section.
   *
   * @defaultValue true
   */
  showBody?: boolean;
  /**
   * Resolved body preview text to display. The source (a metadata field, a
   * text-content excerpt, or none) is decided by the caller from the project's
   * `config.organizerCardBody`; the card never reads resource data for this.
   */
  body?: string;
  /** Called when the user clicks the Open button on the card. */
  onOpen?: () => void;
  /**
   * Called when the user clicks the card's title, selecting the resource
   * without leaving the current view.
   */
  onSelect?: () => void;
  /** Fallback status shown when the resource has no status set. Defaults to the first project status. */
  defaultStatus?: string;
  /**
   * Whether this card's resource is the current globally-selected resource;
   * applies the established selected-row highlight when true.
   *
   * @defaultValue false
   */
  isSelected?: boolean;
  /**
   * Ref callback for the card's dedicated drag handle element, typically a
   * caller's `@dnd-kit/sortable` `useSortable().setNodeRef` (or a wrapper
   * around it). The card never imports `@dnd-kit` itself; this prop exists
   * purely to let a drag-and-drop-aware caller attach its own ref to the
   * handle without the card knowing what library produced it.
   */
  dragHandleRef?: (element: HTMLElement | null) => void;
  /**
   * DOM attributes to spread onto the drag handle, typically a caller's
   * `@dnd-kit/sortable` `useSortable().attributes`. Ignored while
   * {@link isDragDisabled} is true.
   */
  dragHandleAttributes?: HTMLAttributes<HTMLElement>;
  /**
   * Event listeners to spread onto the drag handle, typically a caller's
   * `@dnd-kit/sortable` `useSortable().listeners`. Ignored while
   * {@link isDragDisabled} is true.
   */
  dragHandleListeners?: Record<string, unknown>;
  /**
   * Inline style applied to the outer card for the in-progress drag
   * transform, typically derived from a caller's `@dnd-kit/sortable`
   * `useSortable().transform`/`transition` via `CSS.Transform.toString`.
   * Composed with (never replaces) the existing `isSelected` inline style.
   */
  dragStyle?: CSSProperties;
  /**
   * When true, the drag handle renders visibly disabled, drops out of tab
   * order, and does not receive {@link dragHandleAttributes} or
   * {@link dragHandleListeners}.
   *
   * @defaultValue false
   */
  isDragDisabled?: boolean;
  /**
   * Human-readable reason shown when {@link isDragDisabled} is true, exposed
   * as the handle's `title` attribute and as visually-associated hint text
   * via `aria-describedby`.
   */
  dragDisabledReason?: string;
}

/**
 * Selects the icon component to render for a given resource type.
 *
 * @param type - The resource's `type` discriminant.
 * @returns The matching icon component from `ResourceTreeIcons`.
 */
function getResourceTypeIcon(type: AnyResource["type"]): typeof FileTextIcon {
  switch (type) {
    case "text":
      return FileTextIcon;
    case "image":
      return ImageIcon;
    case "audio":
      return AudioIcon;
    case "folder":
      return FolderIcon;
    default: {
      const _exhaustiveCheck: never = type;
      return _exhaustiveCheck;
    }
  }
}

/**
 * Presentational resource card used by organizer layouts.
 *
 * @param props - Component props.
 * @param props.resource - Resource instance to render.
 * @param props.showBody - Controls whether body preview text is shown.
 * @returns A styled `<article>` card with resource summary information.
 *
 * @example
 * <OrganizerCard resource={resource} showBody />
 */
export default function OrganizerCard({
  resource,
  showBody = true,
  body,
  onOpen,
  onSelect,
  defaultStatus = "",
  isSelected = false,
  dragHandleRef,
  dragHandleAttributes,
  dragHandleListeners,
  dragStyle,
  isDragDisabled = false,
  dragDisabledReason,
}: OrganizerCardProps): JSX.Element {
  /** Best-effort display title fallback chain. */
  const title = (resource as any).title ?? resource.name ?? "Untitled";
  /** Most relevant timestamp used for human-readable date display. */
  const updated = resource.updatedAt ?? resource.createdAt ?? "";
  /** Normalized status value shown in the metadata footer. */
  const status = (resource.userMetadata?.status as string) || defaultStatus;
  /** Icon component matching this resource's type. */
  const TypeIcon = getResourceTypeIcon(resource.type);
  /** `id` of the disabled-reason hint element, referenced by the handle's `aria-describedby`. */
  const dragHintId = `res-${resource.id}-drag-hint`;
  /**
   * Composed inline style for the outer card: the existing selected-state
   * highlight plus, when supplied, the caller's in-progress drag transform.
   * Both can be active at once.
   */
  const composedStyle: CSSProperties | undefined =
    isSelected || dragStyle
      ? {
          ...(isSelected
            ? {
                borderLeft: "2px solid var(--color-gw-red-border)",
                backgroundColor: "var(--color-gw-chrome2)",
              }
            : undefined),
          ...dragStyle,
        }
      : undefined;

  return (
    <Card
      as="article"
      className={`h-48 border${isSelected ? " resource-tree-item--selected" : ""}`}
      style={composedStyle}
      aria-labelledby={`res-${resource.id}-title`}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              ref={dragHandleRef}
              className={`flex items-center justify-center p-0.5 -m-0.5 rounded text-gw-secondary hover:text-gw-primary transition-colors duration-150${
                isDragDisabled
                  ? " opacity-40 cursor-not-allowed"
                  : " cursor-grab"
              }`}
              aria-disabled={isDragDisabled ? "true" : undefined}
              tabIndex={isDragDisabled ? -1 : 0}
              title={dragDisabledReason}
              aria-describedby={dragDisabledReason ? dragHintId : undefined}
              aria-label="Drag to reorder"
              {...(isDragDisabled ? {} : dragHandleAttributes)}
              {...(isDragDisabled ? {} : dragHandleListeners)}
            >
              <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {dragDisabledReason && (
              <span id={dragHintId} className="sr-only">
                {dragDisabledReason}
              </span>
            )}
            <TypeIcon className="w-4 h-4 text-gw-secondary" />
            <h3 id={`res-${resource.id}-title`} className="text-sm font-medium">
              {onSelect && (
                <button
                  type="button"
                  onClick={onSelect}
                  className="text-gw-secondary hover:text-gw-primary transition-colors duration-150"
                >
                  {title}
                </button>
              )}
              {!onSelect && title}
            </h3>
          </div>
          <div className="text-xs mt-1 text-gw-secondary">
            {resource.type} file
          </div>
        </div>
        <div className="text-xs whitespace-nowrap text-gw-secondary">
          {updated ? new Date(updated).toLocaleDateString() : ""}
        </div>
      </header>

      {showBody && body && (
        <div className="text-sm mb-3 overflow-y-auto h-16 text-gw-primary">
          {body}
        </div>
      )}

      <footer className="text-xs flex items-center justify-between gap-4 text-gw-secondary">
        {resource.type === "text" && (
          <div>Words: {(resource as TextResource).wordCount ?? "—"}</div>
        )}
        <div className="ml-auto">Status: {status}</div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="ml-2 px-2 py-0.5 rounded border border-gw-border bg-gw-chrome hover:bg-gw-chrome2 text-xs"
          >
            Open
          </button>
        )}
      </footer>
    </Card>
  );
}
