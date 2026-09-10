/**
 * Placement for the entity-graph edge tooltip (entity-graph-edge-tooltips,
 * FR-10). The tooltip follows the pointer, so where it lands relative to the
 * graph is decided here rather than by a fixed CSS offset. Measured before
 * this existed, a fixed above-right offset covered one of the hovered edge's
 * own two nodes in 54% of hovers, and ran off a 411px phone screen in all of
 * them.
 *
 * Pure and layout-free — every size and position arrives as a number — so it
 * can be tested without a browser (jsdom reports every rect as zero-sized).
 */

/** A rectangle in viewport (client) coordinates. */
export interface ClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TooltipPlacementInput {
  pointerX: number;
  pointerY: number;
  /** The tooltip's own rendered size. */
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  /**
   * Rects the tooltip should cover as little of as possible: the hovered
   * edge's two endpoint nodes.
   */
  avoid: readonly ClientRect[];
}

export interface TooltipPlacement {
  left: number;
  top: number;
}

/** Distance kept between the pointer and the tooltip, on both axes. */
export const TOOLTIP_POINTER_GAP = 10;

/**
 * Minimum distance kept between the tooltip and the viewport's edges — half
 * the 24px the width cap subtracts (`min(260px, calc(100vw - 24px))`), so a
 * tooltip at its widest still fits with this margin on both sides.
 */
export const TOOLTIP_VIEWPORT_MARGIN = 12;

/**
 * Clamps `value` into `[min, max]`. When the span is too small for the
 * tooltip (`max < min`), pins it to `min` so it never slides off the leading
 * edge of the viewport.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function overlapArea(a: ClientRect, b: ClientRect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Chooses where to draw the tooltip. Tries the four positions diagonally
 * around the pointer — above-right first (the tooltip's original placement),
 * then above-left, below-right, below-left — clamps each inside the viewport,
 * and returns the one covering the least area of the `avoid` rects. Ties go
 * to the earlier position, so an unobstructed tooltip stays above-right.
 * Because every candidate is clamped, the tooltip is always fully on-screen
 * whenever it fits at all; when every position overlaps something, the least
 * overlap wins (FR-10).
 */
export function chooseTooltipPlacement(
  input: TooltipPlacementInput,
): TooltipPlacement {
  const {
    pointerX,
    pointerY,
    width,
    height,
    viewportWidth,
    viewportHeight,
    avoid,
  } = input;
  const toRight = pointerX + TOOLTIP_POINTER_GAP;
  const toLeft = pointerX - TOOLTIP_POINTER_GAP - width;
  const above = pointerY - TOOLTIP_POINTER_GAP - height;
  const below = pointerY + TOOLTIP_POINTER_GAP;
  const candidates: ReadonlyArray<readonly [number, number]> = [
    [toRight, above],
    [toLeft, above],
    [toRight, below],
    [toLeft, below],
  ];

  const placed = candidates.map(([rawLeft, rawTop]) => {
    const left = clamp(
      rawLeft,
      TOOLTIP_VIEWPORT_MARGIN,
      viewportWidth - TOOLTIP_VIEWPORT_MARGIN - width,
    );
    const top = clamp(
      rawTop,
      TOOLTIP_VIEWPORT_MARGIN,
      viewportHeight - TOOLTIP_VIEWPORT_MARGIN - height,
    );
    const rect: ClientRect = {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
    const overlap = avoid.reduce(
      (sum, other) => sum + overlapArea(rect, other),
      0,
    );
    return { left, top, overlap };
  });

  const best = placed.reduce((kept, next) =>
    next.overlap < kept.overlap ? next : kept,
  );
  return { left: best.left, top: best.top };
}
