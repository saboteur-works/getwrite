/**
 * @module store/transport/native-annotations-backend
 *
 * In-process {@link AnnotationsTransport} for a native (Capacitor) build: runs
 * the same core the HTTP route uses (`annotations-core.ts`) inside the native
 * storage context, so the same bad input throws the same error here as it maps
 * to 400 on the route. Imported only by `lib/api/annotations.ts`'s dynamic
 * import; `next.config.mjs` aliases it to a web-stub in web builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  addAnnotationCore,
  deleteAnnotationCore,
  listAnnotationsCore,
  reattachAnnotationCore,
  updateAnnotationCore,
} from "../../lib/models/annotations-core";
import type { AnnotationsTransport } from "../../lib/api/annotations";

/**
 * Builds the in-process annotations transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeAnnotationsTransport(
  deps: NativeBackendDeps = {},
): AnnotationsTransport {
  const run = createNativeRunner(deps);
  return {
    list: (projectId, resourceId) =>
      run(() => listAnnotationsCore(projectId, resourceId)),
    add: (projectId, resourceId, annotation) =>
      run(() => addAnnotationCore(projectId, resourceId, annotation)),
    update: (projectId, resourceId, annotationId, body) =>
      run(() =>
        updateAnnotationCore(projectId, resourceId, annotationId, body),
      ),
    reattach: (projectId, resourceId, annotationId, quote) =>
      run(() =>
        reattachAnnotationCore(projectId, resourceId, annotationId, quote),
      ),
    remove: (projectId, resourceId, annotationId) =>
      run(() => deleteAnnotationCore(projectId, resourceId, annotationId)),
  };
}
