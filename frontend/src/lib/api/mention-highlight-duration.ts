/**
 * @module api/mention-highlight-duration
 *
 * Client transport for the per-project mention-jump highlight duration
 * (Entity mention navigation, Task 8), mirroring
 * `word-count-goal.ts`'s `setWordCountGoal` pattern exactly.
 *
 * Failure contract: `setMentionHighlightDuration` rejects on a network error,
 * non-2xx status, or malformed body (the malformed body is also reported
 * through `reportTransportValidationFailure`), even though the save has by
 * then succeeded server-side, so the caller re-reads rather than trusting a
 * fabricated value — the same reject-on-failure posture as
 * `word-count-goal.ts`, since a silently-degraded duration read would be
 * indistinguishable from "never set" per this codebase's failure-visibility
 * standard.
 *
 * There is no dedicated GET route for this setting (mirroring
 * `word-count-goal.ts`/Task 7's route, which is PUT-only): the current value
 * normally arrives already as part of the loaded project's `config`. For
 * callers that only have that raw, possibly-unset config value in hand (the
 * later mention-jump highlight consumer, Task 9), `resolveMentionHighlightDurationSeconds`
 * below is a pure, zero-network read that applies the spec's 2-second
 * fallback — no additional transport surface was needed for that.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-mention-highlight-duration-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import { SetMentionHighlightDurationResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The default highlight duration (seconds) used when unset, per FR-10. */
export const DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS = 2;

/** The mention-highlight-duration operations both platforms implement. */
export interface MentionHighlightDurationTransport {
  /**
   * Sets (integer 1-10 inclusive) or clears (`null`)
   * `config.mentionHighlightDurationSeconds`.
   */
  setMentionHighlightDuration(
    projectId: string,
    seconds: number | null,
  ): Promise<{ mentionHighlightDurationSeconds: number | undefined }>;
}

/**
 * Pure read: resolves the duration (seconds) a mention-jump highlight should
 * last, given the raw, possibly-unset `config.mentionHighlightDurationSeconds`
 * value — e.g. from the already-loaded project's config. Falls back to
 * {@link DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS} when `undefined`. No
 * network access: there is no GET route for this setting.
 */
export function resolveMentionHighlightDurationSeconds(
  configValue: number | undefined,
): number {
  return configValue ?? DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/mention-highlight-duration";

/** HTTP transport — the hosted/desktop path. */
export const httpMentionHighlightDurationTransport: MentionHighlightDurationTransport =
  {
    async setMentionHighlightDuration(projectId, seconds) {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          mentionHighlightDurationSeconds: seconds,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to save the mention-highlight duration (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = SetMentionHighlightDurationResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(
          "mention-highlight-duration.setMentionHighlightDuration",
          parsed.error.issues,
        );
        throw new Error(
          "The mention-highlight duration response was malformed.",
        );
      }
      return {
        mentionHighlightDurationSeconds:
          parsed.data.mentionHighlightDurationSeconds,
      };
    },
  };

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-mention-highlight-duration-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveMentionHighlightDurationTransport: () => Promise<MentionHighlightDurationTransport> =
  createTransport(httpMentionHighlightDurationTransport, () =>
    import("../../store/transport/native-mention-highlight-duration-backend").then(
      ({ createNativeMentionHighlightDurationTransport }) =>
        createNativeMentionHighlightDurationTransport(),
    ),
  );

/**
 * Sets (integer 1-10 inclusive) or clears (`null`) the project's
 * mention-highlight duration. Rejects on any failure.
 */
export async function setMentionHighlightDuration(
  projectId: string,
  seconds: number | null,
): Promise<{ mentionHighlightDurationSeconds: number | undefined }> {
  const transport = await resolveMentionHighlightDurationTransport();
  return transport.setMentionHighlightDuration(projectId, seconds);
}
