import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DeviceNotPairedGuard from "../../components/Sharing/DeviceNotPairedGuard";
import PairingScreen from "../../components/Sharing/PairingScreen";
import { NOT_PAIRED_EXPLANATION } from "../../components/Sharing/sharing-copy";

const TARGET = "/pair?reason=unpaired";
const originalFetch = window.fetch;
const baseFetch = vi.fn<typeof fetch>();

function gated(): Response {
  return new Response("{}", {
    status: 401,
    headers: { "x-getwrite-gate": "not-paired" },
  });
}

beforeEach(() => {
  baseFetch.mockReset();
  window.fetch = baseFetch;
});
afterEach(() => {
  cleanup();
  window.fetch = originalFetch;
});

describe("DeviceNotPairedGuard", () => {
  it("navigates once to the pairing screen and still returns the response", async () => {
    const navigate = vi.fn();
    const response = gated();
    baseFetch.mockResolvedValue(response);
    render(<DeviceNotPairedGuard navigate={navigate} />);

    const first = await window.fetch("/api/projects");
    await window.fetch("/api/projects");
    expect(first).toBe(response);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(TARGET);
  });

  it("does not intercept a 401 without the gate header", async () => {
    const navigate = vi.fn();
    const response = new Response("{}", { status: 401 });
    baseFetch.mockResolvedValue(response);
    render(<DeviceNotPairedGuard navigate={navigate} />);
    expect(await window.fetch("/api/x")).toBe(response);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("passes 409 and 200 through unchanged", async () => {
    const navigate = vi.fn();
    const r409 = new Response("{}", { status: 409 });
    const r200 = new Response("{}", { status: 200 });
    baseFetch.mockResolvedValueOnce(r409).mockResolvedValueOnce(r200);
    render(<DeviceNotPairedGuard navigate={navigate} />);
    expect(await window.fetch("/a")).toBe(r409);
    expect(await window.fetch("/b")).toBe(r200);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("passes the request arguments to the original fetch and propagates its rejection", async () => {
    const failure = new TypeError("network");
    baseFetch.mockRejectedValue(failure);
    render(<DeviceNotPairedGuard navigate={vi.fn()} />);
    await expect(window.fetch("/a", { method: "POST" })).rejects.toBe(failure);
    expect(baseFetch).toHaveBeenCalledWith("/a", { method: "POST" });
  });

  it("restores the original fetch on unmount", () => {
    const { unmount } = render(<DeviceNotPairedGuard navigate={vi.fn()} />);
    expect(window.fetch).not.toBe(baseFetch);
    unmount();
    expect(window.fetch).toBe(baseFetch);
  });

  it("renders nothing and does not throw when window.fetch is absent", () => {
    // @ts-expect-error simulating an environment without fetch
    window.fetch = undefined;
    const { container } = render(<DeviceNotPairedGuard navigate={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the not-paired explanation on the pairing screen it navigates to", () => {
    render(<PairingScreen onPaired={() => undefined} />);
    expect(screen.getByText(NOT_PAIRED_EXPLANATION)).toBeTruthy();
  });
});
