// Last Updated: 2026-10-22

/**
 * Feature 91, Task 10 (FR-18): a bundled face that fails at runtime is reported
 * through `console.error` with the family name, so a missing or corrupt file is
 * never a silent substitution. Browser APIs only, guarded for SSR; no network
 * text or URL is logged.
 */

interface FontFaceLike {
  readonly family: string;
}

interface FontFaceSetEventLike {
  readonly fontfaces?: readonly FontFaceLike[];
}

type FontListener = (event: FontFaceSetEventLike) => void;

/** The slice of `document.fonts` this module uses (a test passes a fake). */
export interface FontSetLike {
  addEventListener(type: "loadingerror", listener: FontListener): void;
  removeEventListener(type: "loadingerror", listener: FontListener): void;
}

/** Strips the quotes a browser may keep around a family name. */
function plainFamily(family: string): string {
  return family.replace(/^["']+|["']+$/g, "").trim();
}

/** Reports one failed face by family name. */
export function reportFontFailure(family: string): void {
  console.error(`Bundled font failed to load: ${plainFamily(family)}`);
}

/**
 * Reports every face of each `loadingerror` event. Returns the cleanup that
 * removes the listener; a no-op when no font set is available.
 */
export function watchFontFailures(fonts: FontSetLike | undefined): () => void {
  if (!fonts) return () => {};
  const listener: FontListener = (event) => {
    for (const face of event.fontfaces ?? []) reportFontFailure(face.family);
  };
  fonts.addEventListener("loadingerror", listener);
  return () => fonts.removeEventListener("loadingerror", listener);
}
