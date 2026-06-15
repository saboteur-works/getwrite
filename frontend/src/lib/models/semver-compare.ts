/**
 * @module semver-compare
 *
 * Minimal semantic-version comparison for the update notice. Compares only the
 * `MAJOR.MINOR.PATCH` core; a leading `v` and any pre-release/build suffix
 * (everything from the first `-` or `+`) are ignored. Pre-release ordering is
 * intentionally not modelled — the update notice does not target pre-releases.
 */

/** Parses `MAJOR.MINOR.PATCH` into a numeric tuple, or `null` if unparseable. */
function parseCore(version: string): [number, number, number] | null {
  const core = version.trim().replace(/^v/i, "").split(/[-+]/, 1)[0];
  const parts = core.split(".");
  const nums: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = parts[i] ?? "0";
    if (!/^\d+$/.test(raw)) {
      return null;
    }
    nums.push(Number(raw));
  }
  return [nums[0], nums[1], nums[2]];
}

/**
 * Reports whether `candidate` is a strictly greater version than `baseline`.
 *
 * Returns `false` when either input cannot be parsed, so callers never need to
 * guard against thrown errors.
 *
 * @param candidate - The version to test (e.g. the latest release).
 * @param baseline - The version to compare against (e.g. the running version).
 */
export function isNewer(candidate: string, baseline: string): boolean {
  const a = parseCore(candidate);
  const b = parseCore(baseline);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) {
      return true;
    }
    if (a[i] < b[i]) {
      return false;
    }
  }
  return false;
}
