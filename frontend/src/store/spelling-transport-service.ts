/**
 * Transport-service layer for `spellingSlice`: resolves the request context
 * from slice state and exposes one function per list mutation. The HTTP /
 * native selection lives in `lib/api/project-spelling.ts`; this file only
 * keeps the thunk bodies free of transport detail.
 */
import {
  addSpellingWord,
  ignoreSpellingWord,
  removeSpellingWord,
  unignoreSpellingWord,
  type SpellingLists,
} from "../lib/api/project-spelling";

/** The slice fields the context resolver reads. */
interface SpellingContextSource {
  spelling: { projectId: string | null; status: string };
}

/** Which list operation a mutation performs. */
export type SpellingMutation =
  | "add-word"
  | "remove-word"
  | "ignore-word"
  | "unignore-word";

/**
 * Resolves the project a mutation targets. Mutations only run against a
 * project whose lists are loaded; otherwise there is nothing to replace.
 */
export function resolveSpellingRequestContext(
  state: SpellingContextSource,
): { projectId: string } | { error: string } {
  const { projectId, status } = state.spelling;
  if (!projectId || status !== "loaded") {
    return { error: "The project's spelling lists are not loaded." };
  }
  return { projectId };
}

const MUTATIONS: Record<
  SpellingMutation,
  (projectId: string, word: string) => Promise<SpellingLists>
> = {
  "add-word": addSpellingWord,
  "remove-word": removeSpellingWord,
  "ignore-word": ignoreSpellingWord,
  "unignore-word": unignoreSpellingWord,
};

/** Runs `mutation` and returns the server's lists. Rejects on any failure. */
export function postSpellingMutation(
  mutation: SpellingMutation,
  projectId: string,
  word: string,
): Promise<SpellingLists> {
  return MUTATIONS[mutation](projectId, word);
}
