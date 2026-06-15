/**
 * @module update-check
 *
 * Compares the running GetWrite version against the latest published GitHub
 * Release and assembles a typed result for the update notice. The network call,
 * semver comparison, and graceful-failure behaviour all live here so callers
 * (the API route) only deal with a single resolved result. Any failure —
 * offline, timeout, non-200, draft/pre-release, or unparseable body — resolves
 * to `{ updateAvailable: false }` and never throws.
 */
import { isNewer } from "./semver-compare";

/** Outcome of an update check. All optional fields are populated only when a release was read. */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
}

/** Subset of the GitHub release asset shape we rely on. */
interface GithubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

/** Subset of the GitHub `releases/latest` payload we rely on. */
interface GithubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

/** A fetch-compatible function, injectable for testing. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface CheckForUpdateOptions {
  /** The running app version. */
  currentVersion: string;
  /** GitHub repo slug, e.g. `saboteur-works/getwrite`. */
  repo: string;
  /** Host platform, as `process.platform` (`darwin` | `win32` | `linux`). */
  platform: NodeJS.Platform;
  /** Override the fetch implementation (tests). Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /** Request timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
}

const NO_UPDATE: UpdateCheckResult = { updateAvailable: false };

/** File-name fragments that identify an installer for each platform. */
const PLATFORM_ASSET_PATTERNS: Record<string, RegExp> = {
  darwin: /\.dmg$|mac|darwin/i,
  win32: /\.exe$|\.msi$|win/i,
  linux: /\.appimage$|\.deb$|\.rpm$|linux/i,
};

function stripV(tag: string): string {
  return tag.replace(/^v/i, "");
}

/** Selects the first asset matching the platform, or `null` if none match. */
function pickDownloadUrl(
  assets: GithubReleaseAsset[],
  platform: NodeJS.Platform,
): string | null {
  const pattern = PLATFORM_ASSET_PATTERNS[platform];
  for (const asset of assets) {
    const name = typeof asset.name === "string" ? asset.name : "";
    const url =
      typeof asset.browser_download_url === "string"
        ? asset.browser_download_url
        : "";
    if (!url) {
      continue;
    }
    if (!pattern || pattern.test(name)) {
      return url;
    }
  }
  return null;
}

/**
 * Checks for a newer release. Never throws; failures resolve to
 * `{ updateAvailable: false }`.
 */
export async function checkForUpdate(
  options: CheckForUpdateOptions,
): Promise<UpdateCheckResult> {
  const {
    currentVersion,
    repo,
    platform,
    fetchImpl = fetch,
    timeoutMs = 5000,
  } = options;

  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return NO_UPDATE;
    }

    const release = (await response.json()) as GithubRelease;
    if (release.draft === true || release.prerelease === true) {
      return NO_UPDATE;
    }
    if (typeof release.tag_name !== "string") {
      return NO_UPDATE;
    }

    const latestVersion = stripV(release.tag_name);
    const releaseUrl =
      typeof release.html_url === "string" ? release.html_url : "";

    if (!isNewer(latestVersion, currentVersion)) {
      return { updateAvailable: false, currentVersion, latestVersion };
    }

    const assets = Array.isArray(release.assets)
      ? (release.assets as GithubReleaseAsset[])
      : [];
    const downloadUrl = pickDownloadUrl(assets, platform) ?? releaseUrl;

    return {
      updateAvailable: true,
      currentVersion,
      latestVersion,
      releaseUrl,
      downloadUrl,
    };
  } catch {
    return NO_UPDATE;
  } finally {
    clearTimeout(timer);
  }
}
