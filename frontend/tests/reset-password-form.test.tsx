import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResetPasswordForm, {
  type ResetPasswordFormProps,
} from "../components/Auth/ResetPasswordForm";

type ResetPasswordEmailFn = NonNullable<
  ResetPasswordFormProps["resetPasswordEmail"]
>;

describe("ResetPasswordForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the new password with the token and shows success", async () => {
    const resetPasswordEmail = vi
      .fn<ResetPasswordEmailFn>()
      .mockResolvedValue({ data: { status: true }, error: null });
    render(
      <ResetPasswordForm
        token="tok-123"
        resetPasswordEmail={resetPasswordEmail}
      />,
    );

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "new-correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(resetPasswordEmail).toHaveBeenCalledWith({
        newPassword: "new-correct-horse",
        token: "tok-123",
      });
      expect(screen.getByText(/password updated/i)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /go to log in/i })).toBeTruthy();
  });

  it("shows a failure message for an invalid or expired token", async () => {
    const resetPasswordEmail = vi
      .fn<ResetPasswordEmailFn>()
      .mockResolvedValue({
        data: null,
        error: { status: 400, code: "INVALID_TOKEN", message: "Invalid token" },
      });
    render(
      <ResetPasswordForm
        token="expired-tok"
        resetPasswordEmail={resetPasswordEmail}
      />,
    );

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "new-correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/password updated/i)).toBeNull();
  });
});
