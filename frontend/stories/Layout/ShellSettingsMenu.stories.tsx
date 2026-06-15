import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ShellSettingsMenu from "../../components/Layout/ShellSettingsMenu";
import { action } from "storybook/actions";

const meta = {
  title: "Layout/ShellSettingsMenu",
  component: ShellSettingsMenu,
} satisfies Meta<typeof ShellSettingsMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

const noop = action("noop");

export const Default: Story = {
  render: () => (
    <div className="bg-gw-chrome min-h-[80px]">
      <ShellSettingsMenu
        projectName="The Long Winter"
        isDarkMode={false}
        isOpen={false}
        isProjectMenuOpen={false}
        hasProject={true}
        onToggleOpen={noop}
        onClose={noop}
        onToggleProjectMenuOpen={noop}
        onCloseProjectMenu={noop}
        onAction={action("onAction")}
      />
    </div>
  ),
};

export const NoProject: Story = {
  render: () => (
    <div className="bg-gw-chrome min-h-[80px]">
      <ShellSettingsMenu
        isDarkMode={false}
        isOpen={false}
        isProjectMenuOpen={false}
        hasProject={false}
        onToggleOpen={noop}
        onClose={noop}
        onToggleProjectMenuOpen={noop}
        onCloseProjectMenu={noop}
        onAction={action("onAction")}
      />
    </div>
  ),
};

export const SettingsMenuOpen: Story = {
  render: () => (
    <div className="bg-gw-chrome min-h-[320px]">
      <ShellSettingsMenu
        projectName="The Long Winter"
        isDarkMode={false}
        isOpen={true}
        isProjectMenuOpen={false}
        hasProject={true}
        onToggleOpen={noop}
        onClose={noop}
        onToggleProjectMenuOpen={noop}
        onCloseProjectMenu={noop}
        onAction={action("onAction")}
        appVersion="0.2.49"
      />
    </div>
  ),
};

export const ProjectMenuOpen: Story = {
  render: () => (
    <div className="bg-gw-chrome min-h-[120px]">
      <ShellSettingsMenu
        projectName="The Long Winter"
        isDarkMode={false}
        isOpen={false}
        isProjectMenuOpen={true}
        hasProject={true}
        onToggleOpen={noop}
        onClose={noop}
        onToggleProjectMenuOpen={noop}
        onCloseProjectMenu={noop}
        onAction={action("onAction")}
      />
    </div>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <div className="bg-gw-chrome min-h-[320px]">
      <ShellSettingsMenu
        projectName="A Dark Tale"
        isDarkMode={true}
        isOpen={true}
        isProjectMenuOpen={false}
        hasProject={true}
        onToggleOpen={noop}
        onClose={noop}
        onToggleProjectMenuOpen={noop}
        onCloseProjectMenu={noop}
        onAction={action("onAction")}
        appVersion="0.2.49"
      />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [isOpen, setIsOpen] = React.useState(true);
    const [lastAction, setLastAction] = React.useState("");
    return (
      <div className="bg-gw-chrome min-h-[320px]">
        <ShellSettingsMenu
          projectName="The Long Winter"
          isDarkMode={false}
          isOpen={isOpen}
          isProjectMenuOpen={false}
          hasProject={true}
          onToggleOpen={() => setIsOpen((p) => !p)}
          onClose={() => setIsOpen(false)}
          onToggleProjectMenuOpen={noop}
          onCloseProjectMenu={noop}
          onAction={(a) => setLastAction(a)}
        />
        <div data-testid="last-action" aria-hidden style={{ display: "none" }}>
          {lastAction}
        </div>
        <div data-testid="is-open" aria-hidden style={{ display: "none" }}>
          {String(isOpen)}
        </div>
      </div>
    );
  },
};
