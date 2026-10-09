import type { NextRequest, NextResponse } from "next/server";

import { runGate } from "./src/lib/sharing/gate";

/**
 * Home-network sharing gate (Feature 75). Runs for every request; with sharing
 * off it only forwards. All logic lives in `src/lib/sharing/gate.ts`.
 */
export function proxy(request: NextRequest): Promise<NextResponse> {
  return runGate(request, process.env);
}
