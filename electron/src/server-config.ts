/**
 * Single source for the embedded Next.js server's port and local origin
 * (FR-25). The server bind env, the window load URL, the navigation guard and
 * the readiness check all read from here; nothing may depend on the value.
 */

/** The port the embedded Next.js server listens on. */
export const PORT = 3000;

/** The loopback hostname the server binds to. */
export const HOSTNAME = "127.0.0.1";

/** The origin the desktop window uses to reach the local server. */
export function localOrigin(port: number): string {
  return `http://localhost:${port}`;
}
