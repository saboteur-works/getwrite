/**
 * @module encryption-guard
 *
 * Shared pre-flight check every CLI command that reads or writes a project's
 * on-disk files must run before touching anything.
 *
 * The CLI binds no encrypting adapter — it has no keyring, ever. So on a
 * project that has opted into encryption, every file the CLI opens is a
 * sealed envelope whose body begins `GWE\0`, not the JSON the command
 * expects. Depending on the command, reading through that unexamined is
 * either destructive (a rebuild step silently working from empty/garbage
 * data and overwriting the real file with the result), a plaintext leak (a
 * write lands unsealed inside an otherwise-sealed project), or merely
 * misleading (a read that fails closed reports "nothing to do" as if that
 * were a true, clean state).
 *
 * `doctor.ts` got this right first — this helper is that same check,
 * factored out so the next command inherits it instead of hand-rolling its
 * own. Four independently pasted `isProjectEncrypted` checks is exactly how
 * a fifth command shipping without one happens; one shared gate closes that
 * off.
 */
import { isProjectEncrypted } from "@gw/core";

/**
 * Checks whether `root` is an encrypted project and, if so, prints a
 * command-specific explanation and returns the exit code the caller should
 * use.
 *
 * Callers should `await` this before any read or write against the project
 * and return immediately (without touching the filesystem) whenever it
 * resolves non-null.
 *
 * @param root - The project root to check.
 * @param commandName - The command's own name, used to prefix the printed
 *   message (matching each command's existing `[commandName] ...` log
 *   convention).
 * @param whatItCannotDo - A sentence (or few) describing, in this command's
 *   own terms, what it would otherwise have done to the project and why
 *   that can't safely happen against sealed files. Appended after the
 *   shared explanation of *why* the project is unreadable.
 * @returns `3` if `root` is encrypted (the caller should stop and return
 *   this as its exit code), or `null` if the project is not encrypted and
 *   the caller should proceed normally.
 */
export async function guardAgainstEncryptedProject(
  root: string,
  commandName: string,
  whatItCannotDo: string,
): Promise<3 | null> {
  if (!(await isProjectEncrypted(root))) {
    return null;
  }

  console.error(
    `[${commandName}] Cannot run against ${root}: this project is encrypted.\n` +
      "Its files are sealed on disk — the CLI has no keyring and cannot read " +
      "or write through the encryption. " +
      whatItCannotDo +
      "\n" +
      "Export a plaintext copy (Project Settings -> Encryption) and run " +
      `${commandName} against that, or unlock and re-run once ${commandName} ` +
      "supports a passphrase.",
  );
  return 3;
}
