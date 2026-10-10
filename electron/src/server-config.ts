/**
 * Single source for the embedded Next.js server's port and local origin
 * (FR-25). The server's `PORT` env, the window load URL, the navigation guard
 * and the readiness check all read from here; nothing may depend on the value.
 *
 * The address the server listens on is not decided here: it comes from
 * `buildServerBindEnv` in `./sharing/sharing-mode` (FR-34).
 */

/** The port the embedded Next.js server listens on. */
export const PORT = 3000;

/**
 * The loopback address. `main.ts` does not read this: the server's bind
 * address comes from `buildServerBindEnv`, which uses its own loopback value
 * when sharing is not in effect.
 */
export const HOSTNAME = "127.0.0.1";

/** The origin the desktop window uses to reach the local server. */
export function localOrigin(port: number): string {
  return `http://localhost:${port}`;
}
