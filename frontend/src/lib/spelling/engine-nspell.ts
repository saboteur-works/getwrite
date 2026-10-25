/**
 * @module engine-nspell
 *
 * The `SpellEngine` adapter for the chosen engine, `nspell` with the
 * `dictionary-en` data (Decision in `specs/features/spell-checker/
 * experiments.md`; FR-21, FR-23, FR-24). It is the only module that imports
 * `nspell`. `nspell` builds its checker in memory from the affix and
 * dictionary text and does no file or network reads, so the data comes from
 * a `loadAssets` function; in the worker that is `createFetchAssetLoader`,
 * which fetches the two files from the page's own origin and from nowhere else.
 */
import nspell from "nspell";
import { type SpellEngine } from "./engine";

/** The Hunspell affix and dictionary files, as decoded text. */
export interface DictionaryAssets {
  aff: string;
  dic: string;
}

export interface NspellEngineOptions {
  loadAssets: () => Promise<DictionaryAssets>;
}

/**
 * Quiet time after an edit before the editor posts a check, in milliseconds.
 * Set from the Part 0 figures for this engine (`experiments.md`, Task 31
 * section): a whole-document check measured at most 224.8 ms (200,000 words,
 * Android), and re-checking one paragraph at most 0.7 ms. The Decision sets no
 * performance limit.
 */
export const SPELL_DEBOUNCE_MS = 300;

type Checker = ReturnType<typeof nspell>;

/** nspell's dictionary holds straight apostrophes; writers type curly ones. */
function lookupForm(word: string): string {
  return word.replace(/’/g, "'");
}

export function createNspellEngine(options: NspellEngineOptions): SpellEngine {
  let checker: Checker | null = null;

  const loaded = (): Checker => {
    if (checker === null) throw new Error("the nspell engine is not loaded");
    return checker;
  };

  return {
    async load() {
      const { aff, dic } = await options.loadAssets();
      if (aff.trim().length === 0 || dic.trim().length === 0) {
        throw new Error("the dictionary files are empty");
      }
      checker = nspell(aff, dic);
    },
    isCorrect(word) {
      return loaded().correct(lookupForm(word));
    },
    suggest(word, max) {
      return loaded().suggest(lookupForm(word)).slice(0, max);
    },
  };
}

export interface FetchAssetLoaderOptions {
  /** Where the affix file is served; absolute or relative to `origin`. */
  affUrl: string;
  /** Where the dictionary file is served; absolute or relative to `origin`. */
  dicUrl: string;
  /** The page's own origin (`self.location.origin` in the worker). */
  origin: string;
  fetchFn?: (url: string) => Promise<Response>;
}

function sameOriginUrl(url: string, origin: string): string {
  const resolved = new URL(url, origin);
  if (resolved.origin !== new URL(origin).origin) {
    throw new Error(
      `the dictionary file must come from the same origin as the app: ${resolved.origin}`,
    );
  }
  return resolved.href;
}

async function fetchText(
  url: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<string> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`fetching ${url} failed with status ${response.status}`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await response.arrayBuffer(),
  );
}

/**
 * Loader that fetches the two dictionary files as text. A URL on another
 * origin rejects before any request is made; a non-ok status rejects rather
 * than yielding an empty dictionary.
 */
export function createFetchAssetLoader(
  options: FetchAssetLoaderOptions,
): () => Promise<DictionaryAssets> {
  const fetchFn = options.fetchFn ?? ((url: string) => fetch(url));
  return async () => {
    const affUrl = sameOriginUrl(options.affUrl, options.origin);
    const dicUrl = sameOriginUrl(options.dicUrl, options.origin);
    const [aff, dic] = await Promise.all([
      fetchText(affUrl, fetchFn),
      fetchText(dicUrl, fetchFn),
    ]);
    return { aff, dic };
  };
}
