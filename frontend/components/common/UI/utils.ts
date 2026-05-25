import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-aware className merger used by every primitive in `components/common/UI/`.
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (de-duplicates conflicting utility classes, last-write-wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
