/**
 * Feature 80, Task 10 (FR-11 a): before forking, check that nothing listens on
 * the port on any address; refuse with a plain message naming the port.
 * Ports used here are never 3000 or 7340.
 */
import { describe, expect, it } from "vitest";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PROBE_ADDRESSES,
  checkPortFree,
  createPortGuard,
  decidePortCheck,
  isAddressInUseOutput,
  portCheckFailedMessage,
  portInUseMessage,
  probePort,
  type ProbeAddress,
  type ProbeOutcome,
  type ProbeResult,
} from "../src/port-in-use";
import { PORT } from "../src/server-config";
import { runLaunchSequence } from "../src/sharing/server-launch";

const FREE: ProbeOutcome = { kind: "free" };
const BUSY: ProbeOutcome = { kind: "in-use" };

function results(
  busy: ProbeAddress[],
  overrides: Partial<Record<ProbeAddress, ProbeOutcome>> = {},
): ProbeResult[] {
  return PROBE_ADDRESSES.map((address) => ({
    address,
    outcome: overrides[address] ?? (busy.includes(address) ? BUSY : FREE),
  }));
}

describe("decidePortCheck", () => {
  it("probes the four addresses the spec names", () => {
    expect([...PROBE_ADDRESSES]).toEqual(["127.0.0.1", "::1", "0.0.0.0", "::"]);
  });

  it("starts when nothing listens anywhere", () => {
    expect(decidePortCheck(results([]))).toEqual({ action: "start" });
  });

  it.each(PROBE_ADDRESSES.map((a) => [a]))(
    "refuses a listener on only %s",
    (address) => {
      expect(decidePortCheck(results([address]))).toEqual({
        action: "refuse",
        reason: "in-use",
        addresses: [address],
      });
    },
  );

  it("refuses several listeners and names each address", () => {
    expect(decidePortCheck(results(["127.0.0.1", "::"]))).toEqual({
      action: "refuse",
      reason: "in-use",
      addresses: ["127.0.0.1", "::"],
    });
  });

  it("does not read an unexpected probe error as free", () => {
    const decision = decidePortCheck(
      results([], { "127.0.0.1": { kind: "error", code: "EACCES" } }),
    );
    expect(decision).toEqual({
      action: "refuse",
      reason: "unchecked",
      failures: [{ address: "127.0.0.1", code: "EACCES" }],
    });
  });

  it("does not read an IPv4 address-family error as free", () => {
    const decision = decidePortCheck(
      results([], { "0.0.0.0": { kind: "error", code: "EAFNOSUPPORT" } }),
    );
    expect(decision.action).toBe("refuse");
  });

  it.each(["EAFNOSUPPORT", "EADDRNOTAVAIL", "EPROTONOSUPPORT"])(
    "treats %s on both IPv6 addresses as 'this host has no IPv6', not a block",
    (code) => {
      const missing: ProbeOutcome = { kind: "error", code };
      expect(
        decidePortCheck(results([], { "::1": missing, "::": missing })),
      ).toEqual({ action: "start" });
    },
  );

  it("still refuses a busy IPv4 address on a host with no IPv6", () => {
    const missing: ProbeOutcome = { kind: "error", code: "EAFNOSUPPORT" };
    expect(
      decidePortCheck(
        results(["127.0.0.1"], { "::1": missing, "::": missing }),
      ),
    ).toMatchObject({ action: "refuse", reason: "in-use" });
  });

  it("refuses an IPv6 error that is not an address-family error", () => {
    expect(
      decidePortCheck(
        results([], { "::1": { kind: "error", code: "EMFILE" } }),
      ),
    ).toMatchObject({ action: "refuse", reason: "unchecked" });
  });

  it("reports in-use ahead of an unrelated probe error", () => {
    expect(
      decidePortCheck(
        results(["::"], { "127.0.0.1": { kind: "error", code: "EACCES" } }),
      ),
    ).toMatchObject({ action: "refuse", reason: "in-use" });
  });

  it("refuses when no probe result was produced", () => {
    expect(decidePortCheck([]).action).toBe("refuse");
  });
});

describe("checkPortFree", () => {
  it("probes each address one at a time, in order, on the given port", async () => {
    const calls: string[] = [];
    let running = 0;
    let overlapped = false;
    const decision = await checkPortFree(41234, async (port, address) => {
      running += 1;
      if (running > 1) overlapped = true;
      calls.push(`${address}:${port}`);
      await Promise.resolve();
      running -= 1;
      return FREE;
    });
    expect(decision).toEqual({ action: "start" });
    expect(calls).toEqual([
      "127.0.0.1:41234",
      "::1:41234",
      "0.0.0.0:41234",
      ":::41234",
    ]);
    expect(overlapped).toBe(false);
  });

  it("turns a probe that throws into a visible error, not 'free'", async () => {
    const decision = await checkPortFree(41234, async () => {
      throw new Error("boom");
    });
    expect(decision.action).toBe("refuse");
  });
});

describe("probePort (real sockets, a port the test picks)", () => {
  async function pickFreeLoopbackPort(): Promise<number> {
    const s = net.createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const { port } = s.address() as net.AddressInfo;
    await new Promise<void>((r) => s.close(() => r()));
    return port;
  }

  it("reports free for an unused port and leaves it bindable", async () => {
    const port = await pickFreeLoopbackPort();
    expect(await probePort(port, "127.0.0.1")).toEqual(FREE);
    const again = net.createServer();
    await new Promise<void>((r) => again.listen(port, "127.0.0.1", r));
    await new Promise<void>((r) => again.close(() => r()));
  });

  it("reports in-use for a loopback listener on the same address", async () => {
    const port = await pickFreeLoopbackPort();
    const holder = net.createServer();
    await new Promise<void>((r) => holder.listen(port, "127.0.0.1", r));
    try {
      expect(await probePort(port, "127.0.0.1")).toEqual(BUSY);
    } finally {
      await new Promise<void>((r) => holder.close(() => r()));
    }
  });

  it("reports an error code, not free, for an address the host cannot bind", async () => {
    const port = await pickFreeLoopbackPort();
    // 203.0.113.0/24 is documentation space; no interface holds it.
    const outcome = await probePort(port, "203.0.113.7" as ProbeAddress);
    expect(outcome.kind).toBe("error");
  });
});

describe("messages", () => {
  const port = 41234;

  it("names the port, says another program uses it, hints, and says GetWrite did not start", () => {
    const text = portInUseMessage(port);
    expect(text).toContain("41234");
    expect(text).toMatch(/another program/i);
    expect(text).toMatch(/GetWrite did not start/i);
    expect(text).toMatch(/netstat|lsof|ss /);
    expect(text).not.toMatch(/\b(3000|7340)\b/);
  });

  it("has no secret-looking, path or markup characters that break the data URL", () => {
    for (const text of [
      portInUseMessage(port),
      portCheckFailedMessage(port, [{ address: "127.0.0.1", code: "EACCES" }]),
    ]) {
      expect(text).not.toMatch(/[<>%#\\/]/);
      expect(text).not.toMatch(/\d{6}/);
    }
  });

  it("says the check could not be done, naming port, address and code", () => {
    const text = portCheckFailedMessage(port, [
      { address: "::1", code: "EACCES" },
    ]);
    expect(text).toContain("41234");
    expect(text).toContain("EACCES");
    expect(text).toMatch(/GetWrite did not start/i);
  });

  it("derives no second port from the constant", () => {
    const text = portInUseMessage(port);
    const numbers = text.match(/\d+/g) ?? [];
    expect(new Set(numbers)).toEqual(new Set([String(port)]));
    const real = portInUseMessage(PORT).match(/\d+/g) ?? [];
    expect(new Set(real)).toEqual(new Set([String(PORT)]));
  });
});

describe("isAddressInUseOutput (the race: the child's own bind failed)", () => {
  const port = 41234;
  it("recognises Next's EADDRINUSE line for this port", () => {
    expect(
      isAddressInUseOutput(
        `Error: listen EADDRINUSE: address already in use :::${port}`,
        port,
      ),
    ).toBe(true);
    expect(
      isAddressInUseOutput(
        `listen EADDRINUSE: address already in use 0.0.0.0:${port}`,
        port,
      ),
    ).toBe(true);
  });
  it("does not match another port, a longer port, or other output", () => {
    expect(isAddressInUseOutput("EADDRINUSE :::41235", port)).toBe(false);
    expect(isAddressInUseOutput("EADDRINUSE :::412345", port)).toBe(false);
    expect(isAddressInUseOutput(`ready on :::${port}`, port)).toBe(false);
    expect(isAddressInUseOutput("EACCES permission denied", port)).toBe(false);
  });
});

describe("createPortGuard", () => {
  const port = 41234;

  it("preflight returns undefined when the port is free", async () => {
    const guard = createPortGuard({ port, probe: async () => FREE });
    expect(await guard.preflight()).toBeUndefined();
  });

  it("preflight returns the in-use message when anything holds the port", async () => {
    const guard = createPortGuard({
      port,
      probe: async (_p, address) => (address === "::" ? BUSY : FREE),
    });
    expect(await guard.preflight()).toBe(portInUseMessage(port));
  });

  it("preflight returns the could-not-check message on an unexpected error", async () => {
    const guard = createPortGuard({
      port,
      probe: async (_p, address) =>
        address === "0.0.0.0" ? { kind: "error", code: "EACCES" } : FREE,
    });
    const text = await guard.preflight();
    expect(text).toContain("EACCES");
    expect(text).toContain("41234");
  });

  it("uses the in-use message for a child exit after its bind failed, and not otherwise", () => {
    const guard = createPortGuard({ port, probe: async () => FREE });
    expect(guard.stopMessage("Server exited unexpectedly (code 1)")).toBe(
      "Server exited unexpectedly (code 1)",
    );
    guard.observeOutput("some ordinary line");
    expect(guard.stopMessage("Server exited unexpectedly (code 1)")).toBe(
      "Server exited unexpectedly (code 1)",
    );
    guard.observeOutput(
      `Error: listen EADDRINUSE: address already in use :::${port}`,
    );
    expect(guard.stopMessage("Server exited unexpectedly (code 1)")).toBe(
      portInUseMessage(port),
    );
  });

  it("retains only a boolean: the observed text is not kept or returned", () => {
    const guard = createPortGuard({ port, probe: async () => FREE });
    guard.observeOutput(`EADDRINUSE :::${port} secret-token-xyz`);
    expect(JSON.stringify(guard)).not.toContain("secret-token-xyz");
    expect(guard.stopMessage("fallback")).not.toContain("secret-token-xyz");
  });
});

describe("launch ordering when the port check fails", () => {
  it("shows the message and never confirms, installs the secret or loads", async () => {
    const calls: string[] = [];
    const shown: string[] = [];
    await runLaunchSequence({
      portBlocked: () => "blocked message",
      confirmServer: async () => {
        calls.push("confirm");
      },
      installWindowSecret: () => {
        calls.push("install");
      },
      loadLocalOrigin: () => {
        calls.push("load");
      },
      showFailure: (m) => shown.push(m),
    });
    expect(calls).toEqual([]);
    expect(shown).toEqual(["blocked message"]);
  });

  it("proceeds as before when portBlocked is absent or returns nothing", async () => {
    for (const portBlocked of [undefined, () => undefined]) {
      const calls: string[] = [];
      await runLaunchSequence({
        portBlocked,
        confirmServer: async () => {
          calls.push("confirm");
        },
        installWindowSecret: () => {
          calls.push("install");
        },
        loadLocalOrigin: () => {
          calls.push("load");
        },
        showFailure: () => calls.push("fail"),
      });
      expect(calls).toEqual(["confirm", "install", "load"]);
    }
  });
});

describe("main.ts wiring", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "main.ts"),
    "utf8",
  );

  it("checks the port before it forks the server", () => {
    const preflight = source.indexOf("portGuard.preflight()");
    const fork = source.indexOf("serverProcess = startServer(dirs)");
    expect(preflight).toBeGreaterThan(-1);
    expect(fork).toBeGreaterThan(preflight);
  });

  it("does not fork when the check refused", () => {
    expect(source).toMatch(/if \(portRefusal\) \{[\s\S]*?return;[\s\S]*?\}/);
  });

  it("feeds the server's output to the guard and routes exit messages through it", () => {
    expect(source).toContain("portGuard.observeOutput(");
    expect(source).toContain("portGuard.stopMessage(");
  });

  it("keeps the single-instance lock call", () => {
    expect(source).toContain("app.requestSingleInstanceLock()");
  });
});
