/**
 * Unit tests for `src/lib/auth/email.ts` — the `nodemailer` SMTP transport
 * wired into better-auth's `sendVerificationEmail`/`sendResetPassword`
 * callbacks (FR11/FR13/FR14, `specs/features/auth-provider.md`).
 *
 * `nodemailer` is mocked: no real SMTP connection is attempted. `server-only`
 * is mocked for the same reason as `auth-config.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { createTransportMock, sendMailMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { createTransportMock, sendMailMock };
});
vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

import {
  sendVerificationEmail,
  sendResetPassword,
  __resetEmailTransportForTests,
  SmtpNotConfiguredError,
} from "../../src/lib/auth/email";

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;
const savedEnv: Record<string, string | undefined> = {};

const testUser = {
  id: "u-1",
  email: "writer@example.com",
  name: "Writer",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as never;

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  createTransportMock.mockClear();
  sendMailMock.mockClear();
  __resetEmailTransportForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  __resetEmailTransportForTests();
});

function setValidSmtpEnv(overrides: Partial<Record<string, string>> = {}) {
  process.env.SMTP_HOST = overrides.SMTP_HOST ?? "smtp.example.com";
  process.env.SMTP_PORT = overrides.SMTP_PORT ?? "587";
  process.env.SMTP_USER = overrides.SMTP_USER ?? "mailer";
  process.env.SMTP_PASS = overrides.SMTP_PASS ?? "secret";
  process.env.SMTP_FROM =
    overrides.SMTP_FROM ?? "GetWrite <noreply@example.com>";
}

describe("sendVerificationEmail / sendResetPassword", () => {
  it("throws SmtpNotConfiguredError and never builds a transport when SMTP env is missing", async () => {
    await expect(
      sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow(SmtpNotConfiguredError);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("throws SmtpNotConfiguredError for sendResetPassword too, without building a transport", async () => {
    await expect(
      sendResetPassword({
        user: testUser,
        url: "https://getwrite.example.com/reset?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow(SmtpNotConfiguredError);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  describe("with valid SMTP env", () => {
    beforeEach(() => setValidSmtpEnv());

    it("builds the transport from SMTP_* env, secure:false for port 587", async () => {
      await sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=abc",
        token: "abc",
      });
      expect(createTransportMock).toHaveBeenCalledWith({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: { user: "mailer", pass: "secret" },
      });
    });

    it("sets secure:true for port 465", async () => {
      setValidSmtpEnv({ SMTP_PORT: "465" });
      await sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=abc",
        token: "abc",
      });
      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });

    it("sends a verification email with the expected to/subject/body", async () => {
      await sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=abc",
        token: "abc",
      });
      expect(sendMailMock).toHaveBeenCalledWith({
        from: "GetWrite <noreply@example.com>",
        to: "writer@example.com",
        subject: "Verify your GetWrite email",
        text: expect.stringContaining(
          "https://getwrite.example.com/verify?token=abc",
        ),
      });
    });

    it("sends a reset-password email with the expected to/subject/body", async () => {
      await sendResetPassword({
        user: testUser,
        url: "https://getwrite.example.com/reset?token=xyz",
        token: "xyz",
      });
      expect(sendMailMock).toHaveBeenCalledWith({
        from: "GetWrite <noreply@example.com>",
        to: "writer@example.com",
        subject: "Reset your GetWrite password",
        text: expect.stringContaining(
          "https://getwrite.example.com/reset?token=xyz",
        ),
      });
    });

    it("memoizes the transport across calls, and __resetEmailTransportForTests clears it", async () => {
      await sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=1",
        token: "1",
      });
      await sendResetPassword({
        user: testUser,
        url: "https://getwrite.example.com/reset?token=2",
        token: "2",
      });
      expect(createTransportMock).toHaveBeenCalledOnce();

      __resetEmailTransportForTests();
      await sendVerificationEmail({
        user: testUser,
        url: "https://getwrite.example.com/verify?token=3",
        token: "3",
      });
      expect(createTransportMock).toHaveBeenCalledTimes(2);
    });
  });
});
