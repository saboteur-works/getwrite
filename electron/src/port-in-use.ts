/**
 * @module port-in-use
 *
 * Feature 80, FR-11 (a): before the server is forked, check that nothing
 * listens on the port on any address, and if something does, refuse to start
 * with a plain message naming the port. There is no fallback port: the
 * displayed addresses, the Host allowlist and the window secret's target all
 * stay on the one constant.
 *
 * Three parts, kept apart: a pure decision over probe results
 * (`decidePortCheck`), a thin I/O probe (`probePort`), and a small guard
 * (`createPortGuard`) that `main.ts` holds. The guard also recognises the race
 * (the child's own bind failing after a free check) from its output.
 */
import net from "node:net";

/** The addresses probed: both loopbacks and both wildcards. */
export const PROBE_ADDRESSES = ["127.0.0.1", "::1", "0.0.0.0", "::"] as const;
export type ProbeAddress = (typeof PROBE_ADDRESSES)[number];

/** What binding one address told us. */
export type ProbeOutcome =
  | { kind: "free" }
  | { kind: "in-use" }
  | { kind: "error"; code: string };

export interface ProbeResult {
  address: ProbeAddress;
  outcome: ProbeOutcome;
}

export interface ProbeFailure {
  address: string;
  code: string;
}

export type PortDecision =
  | { action: "start" }
  | { action: "refuse"; reason: "in-use"; addresses: string[] }
  | { action: "refuse"; reason: "unchecked"; failures: ProbeFailure[] };

/**
 * Errors that mean the host has no such address family. A machine without
 * IPv6 answers a bind on `::1` or `::` with one of these, and no listener can
 * exist on a family the host lacks, so on an IPv6 address they count as "not
 * applicable", not as a failure to check (an IPv6-less machine must not be
 * blocked). On an IPv4 address the same codes are treated as unexpected. That
 * these are the codes such hosts return is read from the platform's
 * documented behaviour, not measured on a host without IPv6.
 */
const NO_IPV6_CODES: ReadonlySet<string> = new Set([
  "EAFNOSUPPORT",
  "EADDRNOTAVAIL",
  "EPROTONOSUPPORT",
]);

function isIpv6(address: string): boolean {
  return address.includes(":");
}

/**
 * Decides start or refuse. A listener on any address refuses. Any other
 * error, and an empty result list, also refuse: an unexpected probe error is
 * never read as "free", and the message says the check could not be done.
 */
export function decidePortCheck(results: ProbeResult[]): PortDecision {
  const busy = results
    .filter((r) => r.outcome.kind === "in-use")
    .map((r) => r.address);
  if (busy.length > 0) {
    return { action: "refuse", reason: "in-use", addresses: busy };
  }
  const failures: ProbeFailure[] = [];
  for (const { address, outcome } of results) {
    if (outcome.kind !== "error") continue;
    if (isIpv6(address) && NO_IPV6_CODES.has(outcome.code)) continue;
    failures.push({ address, code: outcome.code });
  }
  if (results.length === 0) {
    failures.push({ address: "any", code: "NO_PROBE_RESULT" });
  }
  if (failures.length > 0) {
    return { action: "refuse", reason: "unchecked", failures };
  }
  return { action: "start" };
}

/**
 * Tries to bind `address:port` and closes at once. A listener already there
 * (EADDRINUSE) is "in-use"; any other failure is an error carrying its code.
 */
export function probePort(
  port: number,
  address: ProbeAddress,
): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(
        error.code === "EADDRINUSE"
          ? { kind: "in-use" }
          : { kind: "error", code: error.code ?? "UNKNOWN" },
      );
    });
    server.listen({ port, host: address, exclusive: true }, () => {
      server.close(() => resolve({ kind: "free" }));
    });
  });
}

export type Probe = (
  port: number,
  address: ProbeAddress,
) => Promise<ProbeOutcome>;

/**
 * Probes every address one at a time (a wildcard bind and a specific bind
 * made together can collide with each other), then decides. A probe that
 * throws becomes an error result, never "free".
 */
export async function checkPortFree(
  port: number,
  probe: Probe = probePort,
): Promise<PortDecision> {
  const results: ProbeResult[] = [];
  for (const address of PROBE_ADDRESSES) {
    let outcome: ProbeOutcome;
    try {
      outcome = await probe(port, address);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      outcome = { kind: "error", code: code ?? "PROBE_THREW" };
    }
    results.push({ address, outcome });
  }
  return decidePortCheck(results);
}

// WORKING COPY: the two messages below are not yet reviewed by the owner.
// Plain wording, no markup characters (they are shown through a data URL), no
// path, secret or code.

/** The message when something else holds the port. */
export function portInUseMessage(port: number): string {
  return [
    `GetWrite did not start. Port ${port} is already in use by another program on this computer, so GetWrite cannot run its local server.`,
    "Close the other program and open GetWrite again.",
    `To find which program holds the port, look for port ${port} in a list of listening programs (a terminal command such as netstat, lsof or ss shows it).`,
  ].join("\n\n");
}

/** The message when the check itself could not be completed. */
export function portCheckFailedMessage(
  port: number,
  failures: ProbeFailure[],
): string {
  const detail = failures.map((f) => `${f.address} gave ${f.code}`).join(", ");
  return [
    `GetWrite did not start. It could not check whether port ${port} is free (${detail}).`,
    "Close other programs that may be using the port and open GetWrite again.",
  ].join("\n\n");
}

/**
 * True when server output says its own bind to this port failed. Matches the
 * line Next prints, for example `listen EADDRINUSE: address already in use
 * :::<port>`, and only for this port.
 */
export function isAddressInUseOutput(text: string, port: number): boolean {
  return new RegExp(`EADDRINUSE[^\\n]*:${port}(?!\\d)`).test(text);
}

export interface PortGuard {
  /** The refusal message, or undefined when the port is free. */
  preflight: () => Promise<string | undefined>;
  /** Feed the forked server's output; only a yes/no is kept. */
  observeOutput: (chunk: string) => void;
  /** The message for a stopped server: the port message after a bind failure. */
  stopMessage: (fallback: string) => string;
}

export function createPortGuard(options: {
  port: number;
  probe?: Probe;
}): PortGuard {
  const { port, probe } = options;
  let bindFailed = false;
  return {
    preflight: async () => {
      const decision = await checkPortFree(port, probe);
      if (decision.action === "start") return undefined;
      return decision.reason === "in-use"
        ? portInUseMessage(port)
        : portCheckFailedMessage(port, decision.failures);
    },
    observeOutput: (chunk) => {
      if (isAddressInUseOutput(chunk, port)) bindFailed = true;
    },
    stopMessage: (fallback) => (bindFailed ? portInUseMessage(port) : fallback),
  };
}
