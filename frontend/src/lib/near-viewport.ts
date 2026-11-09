/**
 * @module near-viewport
 *
 * Reports once when an element is near the viewport (Feature 105, FR-11), so
 * only nearby media reads its bytes. Decision: with no `IntersectionObserver`
 * the element is treated as near (the callback fires on a microtask), so media
 * still loads rather than staying a placeholder forever.
 */

/** How far outside the viewport still counts as near. */
export const NEAR_VIEWPORT_ROOT_MARGIN = "400px";

/**
 * Calls `onNear` at most once. Returns a release function that disconnects
 * the observer and guarantees `onNear` is not called afterwards.
 */
export function observeNearViewport(
  element: Element,
  onNear: () => void,
  rootMargin: string = NEAR_VIEWPORT_ROOT_MARGIN,
): () => void {
  let isDone = false;
  const fire = (): void => {
    if (isDone) return;
    isDone = true;
    onNear();
  };

  if (typeof IntersectionObserver !== "function") {
    queueMicrotask(fire);
    return () => {
      isDone = true;
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (isDone || !entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      fire();
    },
    { rootMargin },
  );
  observer.observe(element);
  return () => {
    if (!isDone) observer.disconnect();
    isDone = true;
  };
}
