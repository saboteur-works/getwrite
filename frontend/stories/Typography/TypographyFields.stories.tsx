import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import TypographyFields, {
  type TypographyFieldKey,
  type TypographyValues,
} from "../../components/typography/TypographyFields";

const ALL: readonly TypographyFieldKey[] = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "letterSpacing",
];

interface HarnessProps {
  initial: TypographyValues;
  disabled?: boolean;
}

function Harness({ initial, disabled }: HarnessProps): JSX.Element {
  const [values, setValues] = useState<TypographyValues>(initial);
  return (
    <div className="p-4">
      <TypographyFields
        label="H2"
        idPrefix="h2"
        fields={ALL}
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        allowOther
        disabled={disabled}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Typography/TypographyFields",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Default: Story = {
  args: { initial: {} },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("spinbutton", { name: "H2 Font Size" }),
    ).toHaveValue(null);
  },
};

export const ValueSet: Story = {
  args: {
    initial: {
      fontFamily: "Playwrite IE",
      fontSize: "28px",
      fontWeight: "300",
      color: "#336699",
      letterSpacing: "0.05em",
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("spinbutton", { name: "H2 Font Size" }),
    ).toHaveValue(28);
    await expect(
      canvas.getByRole("combobox", { name: "H2 Font Weight" }),
    ).toHaveValue("300");
  },
};

export const UnlistedFamily: Story = {
  args: {
    initial: {
      fontFamily: "Garamond",
      fontSize: "1.5rem",
      fontWeight: "lighter",
      color: "red",
      letterSpacing: "2px",
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "H2 Font Family other name" }),
    ).toHaveValue("Garamond");
    await expect(canvas.getByText("Current value: 1.5rem")).toBeVisible();
  },
};

export const OtherWithHint: Story = {
  args: { initial: { fontFamily: "Garamond" } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(
      within(canvasElement).getByText(
        "If this font isn't installed on this device, text shows in IBM Plex Serif.",
      ),
    ).toBeVisible();
  },
};

export const OtherError: Story = {
  args: { initial: { fontFamily: "Garamond" } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", {
      name: "H2 Font Family other name",
    });
    await userEvent.type(field, ",");
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};

/** Every input supports `disabled`; recorded here. */
export const Disabled: Story = {
  args: { initial: { fontFamily: "Lato", fontSize: "20px" }, disabled: true },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(
      within(canvasElement).getByRole("spinbutton", { name: "H2 Font Size" }),
    ).toBeDisabled();
  },
};

function BodyHarness(): JSX.Element {
  const [values, setValues] = useState<TypographyValues>({
    lineHeight: "1.8",
    paragraphSpacing: "16px",
  });
  return (
    <div className="p-4">
      <TypographyFields
        label="Body"
        idPrefix="body"
        fields={["lineHeight", "paragraphSpacing"]}
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
    </div>
  );
}

/** Body-only inputs; a line height below 1.8 shows the refusal and keeps the typed value. */
export const LineHeightError: Story = {
  render: () => <BodyHarness />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Body Line Height" });
    await userEvent.clear(field);
    await userEvent.type(field, "1.5");
    await expect(field).toHaveValue("1.5");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Line height must be a number of at least 1.8.",
    );
  },
};
