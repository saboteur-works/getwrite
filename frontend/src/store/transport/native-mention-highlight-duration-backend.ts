/**
 * @module store/transport/native-mention-highlight-duration-backend
 *
 * In-process {@link MentionHighlightDurationTransport} for a native
 * (Capacitor) build: runs the same core the HTTP route uses
 * (`mention-highlight-duration-core.ts`) inside the native storage context.
 * Duration validation lives in that core, so the same bad input throws the
 * same error here as it maps to 400 on the route.
 *
 * Imported only on the native path
 * (`lib/api/mention-highlight-duration.ts`'s dynamic import);
 * `next.config.mjs` aliases it to a `node:*`-free web-stub in web/desktop
 * builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setMentionHighlightDurationCore } from "../../lib/models/mention-highlight-duration-core";
import type { MentionHighlightDurationTransport } from "../../lib/api/mention-highlight-duration";

/**
 * Builds the in-process mention-highlight-duration transport for a native
 * build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeMentionHighlightDurationTransport(
  deps: NativeBackendDeps = {},
): MentionHighlightDurationTransport {
  const run = createNativeRunner(deps);
  return {
    setMentionHighlightDuration: (projectId, seconds) =>
      run(() => setMentionHighlightDurationCore(projectId, seconds)),
  };
}
