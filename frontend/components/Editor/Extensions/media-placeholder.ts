/**
 * @module media-placeholder
 *
 * Framework-light DOM builder for the inline box shown where an embedded
 * picture goes while it loads, or when it cannot be shown (Feature 105, FR-4,
 * FR-8, OQ-10). Non-React so a ProseMirror node view can use it; reuses the
 * picker's `editor-image-picker-thumb-placeholder` style and its neutral
 * colours (no red). Task 7 reuses it for picker entries.
 */

export const MEDIA_PLACEHOLDER_CLASS = "editor-image-picker-thumb-placeholder";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The lucide "image" icon, drawn as a decorative SVG. */
function createImageIcon(): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.flexShrink = "0";

  const frame = document.createElementNS(SVG_NS, "rect");
  frame.setAttribute("width", "18");
  frame.setAttribute("height", "18");
  frame.setAttribute("x", "3");
  frame.setAttribute("y", "3");
  frame.setAttribute("rx", "2");
  frame.setAttribute("ry", "2");
  const sun = document.createElementNS(SVG_NS, "circle");
  sun.setAttribute("cx", "9");
  sun.setAttribute("cy", "9");
  sun.setAttribute("r", "2");
  const hill = document.createElementNS(SVG_NS, "path");
  hill.setAttribute("d", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21");
  svg.append(frame, sun, hill);
  return svg;
}

/**
 * Builds the placeholder. With no `message` it is a loading box
 * (`role="status"`, "Loading…"); with one it is announced as an alert.
 */
export function createMediaPlaceholder(message?: string): HTMLElement {
  const box = document.createElement("div");
  box.className = MEDIA_PLACEHOLDER_CLASS;
  // The picker's class fixes 64x64; a message needs room to wrap.
  box.style.width = "auto";
  box.style.height = "auto";
  box.style.minHeight = "64px";
  box.style.maxWidth = "100%";
  box.style.boxSizing = "border-box";
  box.style.padding = "8px 12px";
  box.style.gap = "8px";
  box.style.fontSize = "0.875rem";
  box.style.userSelect = "none";

  const text = document.createElement("span");
  if (message === undefined) {
    box.setAttribute("role", "status");
    box.setAttribute("data-media-state", "loading");
    text.textContent = "Loading…";
  } else {
    box.setAttribute("role", "alert");
    box.setAttribute("data-media-state", "message");
    text.textContent = message;
  }
  box.append(createImageIcon(), text);
  return box;
}
