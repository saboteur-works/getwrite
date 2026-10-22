export const FONT_OPTIONS = [
  { label: "Inter", value: "Inter", weights: "400;500;700" },
  { label: "Merriweather", value: "Merriweather", weights: "400;700" },
  { label: "Playfair Display", value: "Playfair+Display", weights: "400;700" },
  { label: "Lato", value: "Lato", weights: "400;700" },
  { label: "Source Serif 4", value: "Source+Serif+4", weights: "400;600" },
  { label: "Playwrite IE", value: "Playwrite+IE", weights: "100..400" },
  { label: "Fascinate Inline", value: "Fascinate+Inline", weights: "400" },
];

/**
 * Feature 91, Task 6 (FR-2, FR-8): the per-family font catalogue and the single
 * exported, ordered font list. `FONT_OPTIONS` above stays until Task 21.
 * Pure data: nothing here reads installed fonts or the platform.
 */
export type FontKind = "bundled" | "system" | "generic";

export interface FontWeightOption {
  readonly weight: number;
  readonly label: string;
}

export interface FontFamilyEntry {
  /** The label shown in the list and the stored value for this family. */
  readonly label: string;
  readonly kind: FontKind;
  /** Shipped weights; empty for system and generic families. */
  readonly weights: readonly FontWeightOption[];
  /** True where a 400 italic face is shipped as well. */
  readonly italic400?: boolean;
}

const THIN: FontWeightOption = { weight: 100, label: "Thin" };
const EXTRA_LIGHT: FontWeightOption = { weight: 200, label: "ExtraLight" };
const LIGHT: FontWeightOption = { weight: 300, label: "Light" };
const REGULAR: FontWeightOption = { weight: 400, label: "Regular" };
const MEDIUM: FontWeightOption = { weight: 500, label: "Medium" };
const SEMIBOLD: FontWeightOption = { weight: 600, label: "Semibold" };
const BOLD: FontWeightOption = { weight: 700, label: "Bold" };

const bundled = (
  label: string,
  weights: readonly FontWeightOption[],
  italic400?: boolean,
): FontFamilyEntry =>
  italic400
    ? { label, kind: "bundled", weights, italic400 }
    : { label, kind: "bundled", weights };

const unbundled = (
  label: string,
  kind: "system" | "generic",
): FontFamilyEntry => ({ label, kind, weights: [] });

/** The one ordered font list (FR-8). "Other..." is separate: OTHER_FONT_OPTION. */
export const FONT_FAMILY_LIST: readonly FontFamilyEntry[] = [
  bundled("Inter", [REGULAR, MEDIUM, BOLD]),
  bundled("Merriweather", [REGULAR, BOLD]),
  bundled("Playfair Display", [REGULAR, BOLD]),
  bundled("Lato", [REGULAR, BOLD]),
  bundled("Source Serif 4", [REGULAR, SEMIBOLD]),
  bundled("Playwrite IE", [THIN, EXTRA_LIGHT, LIGHT, REGULAR]),
  bundled("Fascinate Inline", [REGULAR]),
  bundled("IBM Plex Sans", [REGULAR, BOLD]),
  bundled("IBM Plex Sans Condensed", [REGULAR, BOLD]),
  bundled("IBM Plex Mono", [REGULAR, MEDIUM]),
  bundled("IBM Plex Serif", [REGULAR, MEDIUM, BOLD], true),
  unbundled("Arial", "system"),
  unbundled("Georgia", "system"),
  unbundled("Times New Roman", "system"),
  unbundled("Courier New", "system"),
  unbundled("Verdana", "system"),
  unbundled("Trebuchet MS", "system"),
  unbundled("serif", "generic"),
  unbundled("sans-serif", "generic"),
  unbundled("monospace", "generic"),
];

/** The free-text choice shown in the settings forms only; not a list entry. */
export const OTHER_FONT_OPTION = "Other...";
