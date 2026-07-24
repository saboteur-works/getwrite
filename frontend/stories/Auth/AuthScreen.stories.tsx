import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AuthScreen from "../../components/Auth/AuthScreen";

/**
 * Stub auth actions so stories never attempt a real network call against
 * `/api/auth/*` — Storybook has no better-auth backend running. Mirrors
 * `AuthScreen`'s own "injected props default to the real client" design:
 * these stories simply supply different stub implementations via args.
 */
const resolveSuccess = async () => ({ data: {}, error: null });
const resolveUnverified = async () => ({
  data: null,
  error: {
    status: 403,
    code: "EMAIL_NOT_VERIFIED",
    message: "Email not verified",
  },
});
const resolveGenericFailure = async () => ({
  data: null,
  error: {
    status: 401,
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  },
});

const meta: Meta<typeof AuthScreen> = {
  title: "Auth/AuthScreen",
  component: AuthScreen,
  parameters: {
    docs: {
      description: {
        component:
          "Login/signup/forgot-password UI for GetWrite's hosted auth (Slice 6, FR21). " +
          "Auth actions are injected props defaulting to the real better-auth client " +
          "(`auth-client.ts`); these stories supply stubs so no real network call is made.",
      },
    },
  },
  args: {
    signInEmail: resolveSuccess,
    signUpEmail: resolveSuccess,
    requestPasswordResetEmail: resolveSuccess,
    onAuthenticated: () => console.log("authenticated"),
  },
};

export default meta;

type Story = StoryObj<typeof AuthScreen>;

export const LoginDefault: Story = {};

export const LoginUnverifiedError: Story = {
  args: { signInEmail: resolveUnverified },
};

export const LoginGenericError: Story = {
  args: { signInEmail: resolveGenericFailure },
};
