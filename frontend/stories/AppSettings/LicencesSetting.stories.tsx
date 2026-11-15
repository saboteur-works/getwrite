import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import LicencesSetting from "../../components/AppSettings/LicencesSetting";

const meta: Meta<typeof LicencesSetting> = {
  title: "AppSettings/LicencesSetting",
  component: LicencesSetting,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof LicencesSetting>;

/** The engine, the Chicago style and the en-US locale, as text with no link. */
export const Default: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Licences" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expect(canvas.queryByRole("link")).toBeNull();
  },
};
