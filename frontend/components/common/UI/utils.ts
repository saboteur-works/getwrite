import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The product type scale, mirroring `--text-gw-*` in `styles/getwrite-theme.css`.
 *
 * tailwind-merge only knows Tailwind's stock font sizes. Without this list it
 * reads `text-gw-label` as a text color, so `cn("text-gw-label", "text-gw-primary")`
 * silently dropped the size.
 */
const GW_FONT_SIZES = [
  "gw-hero",
  "gw-display",
  "gw-h1",
  "gw-h2",
  "gw-h3",
  "gw-body",
  "gw-small",
  "gw-editor",
  "gw-label",
  "gw-micro",
  "gw-nano",
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: GW_FONT_SIZES }] } },
});

/**
 * Tailwind-aware className merger used by every primitive in `components/common/UI/`.
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (de-duplicates conflicting utility classes, last-write-wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
