"use client";
/**
 * @module Layout/UpdateNotice
 *
 * Container for the update notice. On mount it asks the server once whether a
 * newer release is available (the server gates this to the desktop build), then
 * renders {@link UpdateNoticeBanner} unless the user has already dismissed or
 * skipped that version. Dismiss and Skip both persist the version via
 * {@link module:update-notice-suppression} and hide the banner for the session.
 *
 * Rendering nothing is the correct outcome on the web build and on any failed
 * check — both resolve to `updateAvailable: false`.
 */
import { useEffect, useState } from "react";
import UpdateNoticeBanner from "./UpdateNoticeBanner";
import { fetchUpdateCheck } from "../../src/store/update-check-transport-service";
import type { UpdateCheckResult } from "../../src/lib/models/update-check";
import {
  isSuppressed,
  setSuppressedVersion,
} from "../../src/lib/update-notice-suppression";

/** Self-fetching update notice; renders the banner only when an update is actionable. */
export default function UpdateNotice(): JSX.Element | null {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [isHidden, setHidden] = useState<boolean>(false);

  useEffect(() => {
    let isActive = true;
    void fetchUpdateCheck().then((res) => {
      if (isActive) {
        setResult(res);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  if (
    isHidden ||
    !result?.updateAvailable ||
    !result.latestVersion ||
    isSuppressed(result.latestVersion)
  ) {
    return null;
  }

  const suppress = (): void => {
    if (result.latestVersion) {
      setSuppressedVersion(result.latestVersion);
    }
    setHidden(true);
  };

  return (
    <UpdateNoticeBanner
      latestVersion={result.latestVersion}
      releaseUrl={result.releaseUrl ?? ""}
      downloadUrl={result.downloadUrl ?? ""}
      onDismiss={suppress}
      onSkip={suppress}
    />
  );
}
