import { Tooltip } from "react-tooltip";
import { TOOLTIP_STYLE } from "./tooltipStyle";

/**
 * @module HoverTip
 *
 * Shared react-tooltip wiring so anchors and their tooltip surface stay
 * consistent across the app (branded style, placement, and the
 * data-attribute contract). Each call site keeps its own anchor element and a
 * stable tooltip id; this module owns the two pieces that were otherwise
 * copy-pasted: the anchor attributes and the `<Tooltip>` surface.
 */

/** Anchor element type augmented with react-tooltip's data attributes. */
export interface HoverTipAnchorProps {
  "data-tooltip-id"?: string;
  "data-tooltip-content"?: string;
}

/**
 * Returns the data attributes that bind a hover target to the tooltip surface
 * with the given id, or an empty object when there is no content (so no tooltip
 * is shown).
 *
 * @param id - The shared tooltip anchor id (matches a {@link HoverTipSurface}).
 * @param content - Tooltip text, or `undefined` to render no tooltip.
 */
export function hoverTipProps(
  id: string,
  content: string | undefined,
): HoverTipAnchorProps {
  return content
    ? { "data-tooltip-id": id, "data-tooltip-content": content }
    : {};
}

/**
 * Renders the branded tooltip surface for a given anchor id. Render once per id
 * (alongside the anchors that reference it).
 *
 * @param id - The shared tooltip anchor id.
 */
export function HoverTipSurface({ id }: { id: string }): JSX.Element {
  return <Tooltip id={id} place="top" style={TOOLTIP_STYLE} />;
}
