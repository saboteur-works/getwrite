/**
 * Unit tests for `isHostedAuthActive()` — the single source of truth for
 * whether GetWrite's hosted authentication path (better-auth + PostgreSQL)
 * is active for this process (FR5/FR10, `specs/features/auth-provider.md`).
 *
 * `server-only` is mocked because Vitest runs outside Next.js's bundler
 * "react-server" condition that normally makes the real package a no-op on
 * the server; imported directly (as it is here), it unconditionally throws
 * to guard against client-bundle inclusion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isHostedAuthActive } from "../../src/lib/auth/auth-config";

describe("isHostedAuthActive", () => {
  let savedDatabaseUrl: string | undefined;
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    savedSecret = process.env.BETTER_AUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
  });

  afterEach(() => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = savedSecret;
  });

  it("is false when neither DATABASE_URL nor BETTER_AUTH_SECRET is set", () => {
    expect(isHostedAuthActive()).toBe(false);
  });

  it("is false when only DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    expect(isHostedAuthActive()).toBe(false);
  });

  it("is false when only BETTER_AUTH_SECRET is set", () => {
    process.env.BETTER_AUTH_SECRET = "secret-value";
    expect(isHostedAuthActive()).toBe(false);
  });

  it("is false when either is set to an empty string", () => {
    process.env.DATABASE_URL = "";
    process.env.BETTER_AUTH_SECRET = "secret-value";
    expect(isHostedAuthActive()).toBe(false);
  });

  it("is true when both DATABASE_URL and BETTER_AUTH_SECRET are set", () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.BETTER_AUTH_SECRET = "secret-value";
    expect(isHostedAuthActive()).toBe(true);
  });

  it("re-reads env fresh on every call (toggled mid-test)", () => {
    expect(isHostedAuthActive()).toBe(false);

    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.BETTER_AUTH_SECRET = "secret-value";
    expect(isHostedAuthActive()).toBe(true);

    delete process.env.BETTER_AUTH_SECRET;
    expect(isHostedAuthActive()).toBe(false);
  });
});
