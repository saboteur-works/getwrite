import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useModuleEnabled } from "../../components/Modules/useModuleEnabled";

/** Shows the module state the hook reports; set flags with `parameters.modules`. */
function ModuleState({ moduleId }: { moduleId: string }): JSX.Element {
  const isEnabled = useModuleEnabled(moduleId);
  return (
    <p>
      The {moduleId} module is {isEnabled ? "on" : "off"}.
    </p>
  );
}

const meta: Meta<typeof ModuleState> = {
  title: "Modules/useModuleEnabled",
  component: ModuleState,
  args: { moduleId: "sources" },
};

export default meta;

type Story = StoryObj<typeof ModuleState>;

/** No `config.modules` entry: the module reads as on (OQ-13). */
export const Absent: Story = {};

export const On: Story = { parameters: { modules: { sources: true } } };

export const Off: Story = { parameters: { modules: { sources: false } } };
