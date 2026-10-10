"use client";

import PairingScreen from "../../components/Sharing/PairingScreen";

/**
 * @module PairPage
 *
 * `/pair` — a sibling of the `app/(app)/` route group, like `app/login`. The
 * request gate (`proxy.ts`) lets an unpaired device load it; every other page
 * redirects here. It contains nothing about any project.
 */
export default function PairPage(): JSX.Element {
  return <PairingScreen />;
}
