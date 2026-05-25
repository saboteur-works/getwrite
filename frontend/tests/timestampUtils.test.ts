import { describe, it, expect } from "vitest";
import { formatRelativeTimestamp } from "../src/lib/timestamp-utils";

describe("formatRelativeTimestamp", () => {
  const now = Date.now();

  it("returns 'just now' for undefined", () => {
    expect(formatRelativeTimestamp(undefined, now)).toBe("just now");
  });

  it("returns 'just now' for an unparseable string", () => {
    expect(formatRelativeTimestamp("not-a-date", now)).toBe("just now");
  });

  it("returns 'just now' for timestamps less than 5 seconds ago", () => {
    const ts = new Date(now - 3000).toISOString();
    expect(formatRelativeTimestamp(ts, now)).toBe("just now");
  });

  it("returns '{n}s ago' for 5–59 seconds", () => {
    const ts = new Date(now - 30000).toISOString();
    expect(formatRelativeTimestamp(ts, now)).toBe("30s ago");
  });

  it("returns '{n}m ago' for 1–59 minutes", () => {
    const ts = new Date(now - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTimestamp(ts, now)).toBe("5m ago");
  });

  it("returns '{n}h ago' for 1–23 hours", () => {
    const ts = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTimestamp(ts, now)).toBe("3h ago");
  });

  it("returns '{n}d ago' for 1–6 days", () => {
    const ts = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTimestamp(ts, now)).toBe("4d ago");
  });

  it("returns toLocaleDateString() for timestamps 7 or more days ago", () => {
    const date = new Date(now - 10 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTimestamp(date.toISOString(), now)).toBe(
      date.toLocaleDateString(),
    );
  });

  it("defaults now to Date.now() when called with one argument", () => {
    const ts = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    expect(formatRelativeTimestamp(ts)).toBe("2m ago");
  });
});
