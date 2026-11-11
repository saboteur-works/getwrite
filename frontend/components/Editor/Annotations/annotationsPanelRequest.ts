/**
 * @module annotationsPanelRequest
 *
 * A one-slot, module-scoped request from outside the editor (the Claims tab's
 * Open) to open the open resource's annotations panel with one annotation's
 * row in view. The panel's open state lives inside `TipTapEditor`, which has
 * no parent to receive a prop from, so the request is read through
 * `useSyncExternalStore` by `useAnnotationsPanel`, which consumes it when the
 * editor is on that resource. A request nobody consumed within
 * `REQUEST_MAX_AGE_MS` is dropped, so a late-mounting editor never opens a
 * panel for a click the writer made long ago. Nothing is persisted.
 */

export interface AnnotationsPanelRequest {
  /** The resource whose panel should open. */
  resourceId: string;
  /** The annotation whose row is scrolled to and focused. */
  annotationId: string;
  /** The passage was not found in the saved document: the panel says so. */
  isPassageMissing: boolean;
}

interface StoredRequest extends AnnotationsPanelRequest {
  token: number;
  at: number;
}

/** How long an unconsumed request stays valid. */
export const REQUEST_MAX_AGE_MS = 10_000;

let pending: StoredRequest | null = null;
let nextToken = 1;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Asks the editor on `request.resourceId` to open its annotations panel. */
export function requestAnnotationsPanel(
  request: AnnotationsPanelRequest,
): void {
  pending = { ...request, token: nextToken++, at: Date.now() };
  notify();
}

export function subscribeAnnotationsPanelRequest(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The pending request, or null; a stale one reads as none. */
export function getAnnotationsPanelRequest(): StoredRequest | null {
  if (pending !== null && Date.now() - pending.at > REQUEST_MAX_AGE_MS) {
    pending = null;
  }
  return pending;
}

/** Marks a request consumed; ignored when a newer request replaced it. */
export function clearAnnotationsPanelRequest(token: number): void {
  if (pending !== null && pending.token === token) {
    pending = null;
    notify();
  }
}

/** Test seam: forgets any pending request and listeners' view of it. */
export function resetAnnotationsPanelRequestForTests(): void {
  pending = null;
  notify();
}
