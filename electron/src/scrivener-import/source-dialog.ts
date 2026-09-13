/**
 * Native-picker options for choosing a Scrivener project to import.
 *
 * A `.scriv` project is a directory on every platform, but macOS registers it
 * as a package (`com.apple.package`), and an open panel treats packages as
 * files: with only `openDirectory`, every `.scriv` is greyed out and cannot be
 * picked. On macOS the picker therefore selects files filtered to `.scriv`;
 * elsewhere a `.scriv` is an ordinary folder and is picked as a directory.
 *
 * Kept free of Electron globals so it is testable with plain Vitest.
 */

/** The subset of Electron's `OpenDialogOptions` this picker sets. */
export interface ScrivenerSourceDialogOptions {
  title: string;
  buttonLabel: string;
  properties: Array<"openFile" | "openDirectory">;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/**
 * Builds the open-dialog options for picking a `.scriv` project.
 *
 * @param platform - The running platform, as reported by `process.platform`.
 * @returns Options to pass to `dialog.showOpenDialog`.
 */
export function scrivenerSourceDialogOptions(
  platform: NodeJS.Platform,
): ScrivenerSourceDialogOptions {
  const base = {
    title: "Choose a Scrivener project to import",
    buttonLabel: "Import",
  };
  if (platform === "darwin") {
    return {
      ...base,
      properties: ["openFile"],
      filters: [{ name: "Scrivener Project", extensions: ["scriv"] }],
    };
  }
  return { ...base, properties: ["openDirectory"] };
}
