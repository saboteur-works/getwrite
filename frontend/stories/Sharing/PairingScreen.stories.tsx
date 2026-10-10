import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import PairingScreen from "../../components/Sharing/PairingScreen";
import {
  PAIRING_CODE_WRONG,
  NOT_PAIRED_EXPLANATION,
} from "../../components/Sharing/sharing-copy";

const meta: Meta<typeof PairingScreen> = {
  title: "Sharing/PairingScreen",
  component: PairingScreen,
  parameters: { a11y: { test: "error" } },
  args: { onPaired: () => undefined },
};

export default meta;

type Story = StoryObj<typeof PairingScreen>;

/** Idle: the explanation and the empty code field. */
export const Idle: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(NOT_PAIRED_EXPLANATION)).toBeInTheDocument();
  },
};

/** A wrong code: the server answers 400 `wrong` (fetch stubbed, no network). */
export const WrongCode: Story = {
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ ok: false, reason: "wrong" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Pairing code"), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "Pair" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      PAIRING_CODE_WRONG,
    );
  },
};
