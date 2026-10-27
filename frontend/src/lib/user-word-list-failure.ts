/**
 * @module user-word-list-failure
 *
 * Plain-language wording for a failed read of the writer's own word list
 * (Feature 96). The transport reports a machine `reason` (`corrupt`,
 * `unreadable`, `http`, …) and the server's developer-facing message; neither
 * is shown to the writer. A failure keeps its own sentence, so it never reads
 * as an empty list (`docs/standards/failure-visibility.md`).
 */

/** Why the list could not be read, as one short sentence for the writer. */
function failureDetail(reason: string | null): string {
  switch (reason) {
    case "corrupt":
      return "Its file is damaged and couldn't be read.";
    case "unreadable":
      return "Its file couldn't be read.";
    case "http":
    case "unavailable":
    case "network":
      return "It couldn't be reached.";
    default:
      return "Something went wrong while reading it.";
  }
}

/** The full sentence shown for a failed read of the user word list. */
export function userWordListFailureText(reason: string | null): string {
  return `Your dictionary could not be loaded. ${failureDetail(reason)}`;
}
