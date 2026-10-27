/**
 * @module known-words
 *
 * Pure known-word set for the spell checker (FR-17, FR-18). Decides whether a
 * word is known from the project's two spelling lists, the optional user word
 * list (Feature 96) and the entity alias table. The dictionary half of the decision is the engine's own, behind the
 * engine seam; nothing here calls an engine.
 *
 * - Lists and entity terms match ignoring case; apostrophes normalise to `'`.
 * - An entity name or alias is known whole, and each word of a multi-word
 *   one is known (split by the same rule word extraction uses).
 * - An entity term also makes its possessive and plural known
 *   (`Aria's`, `Arias`), by the entity-detection suffix.
 * - Entity terms count whatever the `entities` flag says: the flag is not an
 *   input.
 * - Inputs are only read; nothing is written to either list.
 */
import type { EntityAliasTable } from "../models/entity-alias-table";
import { POSSESSIVE_OR_PLURAL_SUFFIX } from "../models/entity-detection";
import { findWordsInText } from "./extract-words";

/** Inputs for the known-word set. */
export interface KnownWordsInput {
  /** The project's added words (`spellingProjectWords`). */
  projectWords: readonly string[];
  /** The project's ignored words (`spellingIgnoredWords`). */
  ignoredWords: readonly string[];
  /**
   * The writer's personal dictionary (Feature 96, FR-3). Optional so callers
   * with no user list (the paired-device path) still compile; folded like the
   * project words.
   */
  userWords?: readonly string[];
  /** The entity alias table, from a read that rejects on failure. */
  aliasTable: EntityAliasTable;
}

/** A word-membership check over the lists and entity terms. */
export interface KnownWords {
  /** True when the word is on a list or is (a form of) an entity term. */
  has(word: string): boolean;
}

/** Splits a word into a stem and an optional possessive/plural suffix. */
const STEM_AND_SUFFIX = new RegExp(
  `^(.+?)${POSSESSIVE_OR_PLURAL_SUFFIX}$`,
  "iu",
);

function fold(word: string): string {
  return word.replace(/’/gu, "'").toLowerCase();
}

function addTermWords(into: Set<string>, term: string): void {
  into.add(fold(term.trim()));
  for (const found of findWordsInText(term)) {
    into.add(fold(found.word));
    for (const part of found.parts) into.add(fold(part.word));
  }
}

/** Builds the known-word set. The inputs are read, never modified. */
export function createKnownWords(input: KnownWordsInput): KnownWords {
  const listed = new Set<string>();
  for (const word of input.projectWords) listed.add(fold(word));
  for (const word of input.ignoredWords) listed.add(fold(word));
  for (const word of input.userWords ?? []) listed.add(fold(word));

  const entityTerms = new Set<string>();
  for (const entry of Object.values(input.aliasTable.entities)) {
    for (const term of [entry.name, ...entry.aliases]) {
      addTermWords(entityTerms, term);
    }
  }

  return {
    has(word: string): boolean {
      const folded = fold(word);
      if (listed.has(folded) || entityTerms.has(folded)) return true;
      const stem = STEM_AND_SUFFIX.exec(folded)?.[1];
      return stem !== undefined && entityTerms.has(stem);
    },
  };
}
