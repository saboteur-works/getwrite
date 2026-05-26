/**
 * Boots the GetWrite Next.js app for showcase capture and tears it down again.
 *
 * The app is started in dev mode with `GETWRITE_PROJECTS_DIR` pointed at the
 * chosen projects directory (default: the committed fixture), so the running
 * instance serves exactly the data we want to capture. The dev server is
 * spawned in its own process group so it — and the child processes Next spawns
 * — can be killed reliably on teardown.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from this file's location (scripts/showcase/..). */
export const REPO_ROOT = path.resolve(here, "..", "..");

/** Frontend workspace directory — the cwd the Next dev server runs in. */
export const FRONTEND_DIR = path.join(REPO_ROOT, "frontend");

/** Default projects directory served during capture. */
export const DEFAULT_PROJECTS_DIR = path.join(here, "fixture", "projects");

const DEFAULT_PORT = 3999;
const DEFAULT_READY_TIMEOUT_MS = 90_000;

export interface BootOptions {
  /** Directory of GetWrite projects to serve. */
  projectsDir: string;
  /** Port to run the dev server on. */
  port?: number;
  /** Max time to wait for the server to respond before failing. */
  readyTimeoutMs?: number;
}

export interface BootedApp {
  /** Base URL the running app is reachable at, e.g. http://localhost:3999. */
  baseUrl: string;
  /** Stops the dev server and its child processes. Safe to call once. */
  stop: () => Promise<void>;
}

/** Polls the server until it responds or the deadline/child-exit aborts. */
async function waitForServer(
  baseUrl: string,
  timeoutMs: number,
  child: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let childExited = false;
  child.once("exit", () => {
    childExited = true;
  });

  while (Date.now() < deadline) {
    if (childExited) {
      throw new Error("Dev server process exited before becoming ready");
    }
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      // Any HTTP response means the server is accepting connections.
      if (res.status > 0) return;
    } catch {
      // Not listening yet; retry after a short delay.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Dev server did not become ready within ${timeoutMs}ms at ${baseUrl}`,
  );
}

/**
 * Starts the Next.js dev server and resolves once it is serving requests.
 */
export async function bootApp(options: BootOptions): Promise<BootedApp> {
  const port = options.port ?? DEFAULT_PORT;
  const baseUrl = `http://localhost:${port}`;
  const projectsDir = path.resolve(options.projectsDir);

  console.log(`[showcase] booting app on ${baseUrl}`);
  console.log(`[showcase] GETWRITE_PROJECTS_DIR=${projectsDir}`);

  const child = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      GETWRITE_PROJECTS_DIR: projectsDir,
      PORT: String(port),
      BROWSER: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  child.stdout?.on("data", (d) => process.stdout.write(`[next] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (child.pid === undefined || child.exitCode !== null) return;

    const exited = new Promise<void>((resolve) => child.once("exit", resolve));
    try {
      // Negative pid targets the whole process group (detached: true).
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    // Force-kill if it does not exit promptly.
    const forced = setTimeout(() => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, 5_000);
    await exited;
    clearTimeout(forced);
    console.log("[showcase] app stopped");
  };

  try {
    await waitForServer(
      baseUrl,
      options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
      child,
    );
  } catch (err) {
    await stop();
    throw err;
  }

  console.log("[showcase] app is ready");
  return { baseUrl, stop };
}
