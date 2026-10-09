"use client";

import { useEffect } from "react";

/**
 * @module Sharing/DeviceNotPairedGuard
 *
 * Home-network sharing (Feature 75, FR-20). The request gate answers a device
 * whose credential is missing or no longer valid with 401 and the header
 * `x-getwrite-gate: not-paired`. Without this guard an in-app `fetch` that
 * receives it would be read as a failed or empty load. On mount the guard wraps
 * `window.fetch` once so that such a response sends the person to the pairing
 * screen; every other response, and every rejection, passes through untouched.
 * The original `fetch` is restored on unmount.
 *
 * With sharing off the gate header is never sent, so the guard has no
 * observable effect. A 401 without the header (e.g. a locked workspace) is not
 * intercepted. Renders nothing.
 */

export const PAIR_REDIRECT_PATH = "/pair?reason=unpaired";

const GATE_HEADER = "x-getwrite-gate";
const NOT_PAIRED = "not-paired";

export interface DeviceNotPairedGuardProps {
  /** Navigation seam; defaults to `window.location.assign`. */
  navigate?: (path: string) => void;
}

function assignLocation(path: string): void {
  window.location.assign(path);
}

function isNotPaired(response: Response): boolean {
  return (
    response.status === 401 && response.headers.get(GATE_HEADER) === NOT_PAIRED
  );
}

export default function DeviceNotPairedGuard({
  navigate = assignLocation,
}: DeviceNotPairedGuardProps): null {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") {
      return undefined;
    }
    const originalFetch = window.fetch;
    let isNavigating = false;
    const guarded: typeof fetch = async (...args) => {
      const response = await originalFetch.apply(window, args);
      if (isNotPaired(response) && !isNavigating) {
        isNavigating = true;
        navigate(PAIR_REDIRECT_PATH);
      }
      return response;
    };
    window.fetch = guarded;
    return () => {
      if (window.fetch === guarded) window.fetch = originalFetch;
    };
  }, [navigate]);

  return null;
}
