import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PairingScreen from "../../components/Sharing/PairingScreen";
import {
  NOT_PAIRED_EXPLANATION,
  PAIRING_CODE_UNUSABLE,
  PAIRING_CODE_WRONG,
  PAIRING_UNREACHABLE,
} from "../../components/Sharing/sharing-copy";

const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function submit(code: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Pairing code"), code);
  await user.click(screen.getByRole("button", { name: "Pair" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PairingScreen", () => {
  it("renders the not-paired explanation and makes no request on load", () => {
    render(<PairingScreen onPaired={() => undefined} />);
    expect(screen.getByText(NOT_PAIRED_EXPLANATION)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has a labelled one-time-code input", () => {
    render(<PairingScreen onPaired={() => undefined} />);
    const input = screen.getByLabelText("Pairing code") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.maxLength).toBe(6);
  });

  it("posts { code } as JSON to /api/sharing/pair and calls onPaired on success", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    const onPaired = vi.fn();
    render(<PairingScreen onPaired={onPaired} />);
    await submit("123456");
    await waitFor(() => expect(onPaired).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sharing/pair");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init.body))).toEqual({ code: "123456" });
  });

  it("navigates to / with window.location.assign by default", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<PairingScreen />);
    await submit("123456");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it.each([
    ["wrong", 400, PAIRING_CODE_WRONG],
    ["unusable", 400, PAIRING_CODE_UNUSABLE],
  ])(
    "shows the %s message, announced, described, focused",
    async (reason, status, message) => {
      fetchMock.mockResolvedValue(reply(status, { ok: false, reason }));
      const onPaired = vi.fn();
      render(<PairingScreen onPaired={onPaired} />);
      await submit("123456");
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(message);
      const input = screen.getByLabelText("Pairing code");
      expect(input.getAttribute("aria-describedby")).toContain(alert.id);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(onPaired).not.toHaveBeenCalled();
    },
  );

  it("shows the unreachable message on a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<PairingScreen onPaired={() => undefined} />);
    await submit("123456");
    expect((await screen.findByRole("alert")).textContent).toBe(
      PAIRING_UNREACHABLE,
    );
    expect(screen.getByLabelText("Pairing code")).toBeTruthy();
  });

  it("shows the unreachable message on a non-JSON reply", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>oops</html>", { status: 502 }),
    );
    render(<PairingScreen onPaired={() => undefined} />);
    await submit("123456");
    expect((await screen.findByRole("alert")).textContent).toBe(
      PAIRING_UNREACHABLE,
    );
  });

  it("shows the unreachable message on a server error, not the unusable-code message", async () => {
    fetchMock.mockResolvedValue(reply(500, { ok: false, reason: "unusable" }));
    render(<PairingScreen onPaired={() => undefined} />);
    await submit("123456");
    expect((await screen.findByRole("alert")).textContent).toBe(
      PAIRING_UNREACHABLE,
    );
  });

  it("clears the previous error on a new submit", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(400, { ok: false, reason: "wrong" }))
      .mockResolvedValueOnce(reply(200, { ok: true }));
    const onPaired = vi.fn();
    render(<PairingScreen onPaired={onPaired} />);
    await submit("111111");
    await screen.findByRole("alert");
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Pairing code"));
    await user.type(screen.getByLabelText("Pairing code"), "222222");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await waitFor(() => expect(onPaired).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses no red colour in the component or page source", () => {
    for (const file of [
      "components/Sharing/PairingScreen.tsx",
      "app/pair/page.tsx",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\bred\b|text-red|bg-red|border-red|gw-red/i);
    }
  });

  it("does not import the server-side sharing modules", () => {
    for (const file of [
      "components/Sharing/PairingScreen.tsx",
      "app/pair/page.tsx",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/src\/lib\/sharing/);
    }
  });
});
