// Last Updated: 2026-09-13

/**
 * Minimal ambient type declarations for the `mammoth` DOCX-to-HTML
 * conversion package (FR-16).
 *
 * `mammoth@1.12.3` ships no TypeScript declarations of its own, and no
 * `@types/mammoth` package exists on npm (verified 2026-09-13). Per
 * `docs/standards/typescript-implementation.md`'s no-`any` rule, this file
 * declares only the narrow API surface `mammoth-to-tiptap.ts` actually
 * calls (`convertToHtml`'s `{ buffer }` input form and its
 * `{ value, messages }` result shape), rather than a full/general-purpose
 * typing of the package.
 */
declare module "mammoth" {
  /**
   * One conversion message mammoth emits while converting a document —
   * typically a warning about a feature (an unrecognized paragraph/run
   * style, an image conversion failure, etc.) it could not fully convert.
   */
  export interface MammothMessage {
    readonly type: string;
    readonly message: string;
  }

  /** The result of {@link convertToHtml}. */
  export interface MammothConvertResult {
    readonly value: string;
    readonly messages: readonly MammothMessage[];
  }

  /** The subset of `mammoth`'s input-source options this importer uses —
   * an in-memory buffer, since the DOCX bytes are already read via
   * `io.ts`'s `StorageAdapter` before conversion. */
  export interface MammothInput {
    readonly buffer?: Buffer;
    readonly path?: string;
  }

  export function convertToHtml(
    input: MammothInput,
  ): Promise<MammothConvertResult>;
}
