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

function Wrapper(
    props: Omit<
        React.ComponentProps<typeof ShellSettingsMenu>,
        "menuRef" | "projectMenuRef"
    >,
) {
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const projectMenuRef = React.useRef<HTMLDivElement | null>(null);
    return (
        <ShellSettingsMenu
            {...props}
            menuRef={menuRef}
            projectMenuRef={projectMenuRef}
        />
    );
}

export const Default: Story = {
    render: () => (
        <div className="bg-gw-chrome min-h-[80px]">
            <Wrapper
                projectName="The Long Winter"
                isDarkMode={false}
                isOpen={false}
                isProjectMenuOpen={false}
                hasProject={true}
                onToggleOpen={noop}
                onToggleProjectMenuOpen={noop}
                onOpenPreferences={noop}
                onOpenHeadingSettings={noop}
                onOpenBodySettings={noop}
                onOpenDefaultRevisionNameSettings={noop}
                onOpenProjectTypeManager={noop}
                onOpenTagsManager={noop}
                onToggleColorMode={noop}
                onOpenHelp={noop}
                onCloseProject={noop}
                onOpenCompile={noop}
            />
        </div>
    ),
};

export const NoProject: Story = {
    render: () => (
        <div className="bg-gw-chrome min-h-[80px]">
            <Wrapper
                isDarkMode={false}
                isOpen={false}
                isProjectMenuOpen={false}
                hasProject={false}
                onToggleOpen={noop}
                onToggleProjectMenuOpen={noop}
                onOpenPreferences={noop}
                onOpenHeadingSettings={noop}
                onOpenBodySettings={noop}
                onOpenDefaultRevisionNameSettings={noop}
                onOpenProjectTypeManager={noop}
                onOpenTagsManager={noop}
                onToggleColorMode={noop}
                onOpenHelp={noop}
                onCloseProject={noop}
                onOpenCompile={noop}
            />
        </div>
    ),
};

export const SettingsMenuOpen: Story = {
    render: () => (
        <div className="bg-gw-chrome min-h-[320px]">
            <Wrapper
                projectName="The Long Winter"
                isDarkMode={false}
                isOpen={true}
                isProjectMenuOpen={false}
                hasProject={true}
                onToggleOpen={noop}
                onToggleProjectMenuOpen={noop}
                onOpenPreferences={noop}
                onOpenHeadingSettings={noop}
                onOpenBodySettings={noop}
                onOpenDefaultRevisionNameSettings={noop}
                onOpenProjectTypeManager={noop}
                onOpenTagsManager={noop}
                onToggleColorMode={noop}
                onOpenHelp={noop}
                onCloseProject={noop}
                onOpenCompile={noop}
            />
        </div>
    ),
};

export const ProjectMenuOpen: Story = {
    render: () => (
        <div className="bg-gw-chrome min-h-[120px]">
            <Wrapper
                projectName="The Long Winter"
                isDarkMode={false}
                isOpen={false}
                isProjectMenuOpen={true}
                hasProject={true}
                onToggleOpen={noop}
                onToggleProjectMenuOpen={noop}
                onOpenPreferences={noop}
                onOpenHeadingSettings={noop}
                onOpenBodySettings={noop}
                onOpenDefaultRevisionNameSettings={noop}
                onOpenProjectTypeManager={noop}
                onOpenTagsManager={noop}
                onToggleColorMode={noop}
                onOpenHelp={noop}
                onCloseProject={noop}
                onOpenCompile={noop}
            />
        </div>
    ),
};

export const DarkMode: Story = {
    render: () => (
        <div className="bg-gw-chrome min-h-[320px]">
            <Wrapper
                projectName="A Dark Tale"
                isDarkMode={true}
                isOpen={true}
                isProjectMenuOpen={false}
                hasProject={true}
                onToggleOpen={noop}
                onToggleProjectMenuOpen={noop}
                onOpenPreferences={noop}
                onOpenHeadingSettings={noop}
                onOpenBodySettings={noop}
                onOpenDefaultRevisionNameSettings={noop}
                onOpenProjectTypeManager={noop}
                onOpenTagsManager={noop}
                onToggleColorMode={noop}
                onOpenHelp={noop}
                onCloseProject={noop}
                onOpenCompile={noop}
            />
        </div>
    ),
};

export const Interactive: Story = {
    render: () => {
        const menuRef = React.useRef<HTMLDivElement | null>(null);
        const projectMenuRef = React.useRef<HTMLDivElement | null>(null);
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastAction, setLastAction] = React.useState("");
        return (
            <div className="bg-gw-chrome min-h-[320px]">
                <ShellSettingsMenu
                    projectName="The Long Winter"
                    isDarkMode={false}
                    isOpen={isOpen}
                    menuRef={menuRef}
                    projectMenuRef={projectMenuRef}
                    isProjectMenuOpen={false}
                    hasProject={true}
                    onToggleOpen={() => setIsOpen((p) => !p)}
                    onToggleProjectMenuOpen={noop}
                    onOpenPreferences={() => setLastAction("preferences")}
                    onOpenHeadingSettings={() =>
                        setLastAction("heading-settings")
                    }
                    onOpenBodySettings={() => setLastAction("body-settings")}
                    onOpenDefaultRevisionNameSettings={() =>
                        setLastAction("default-revision-name")
                    }
                    onOpenProjectTypeManager={() =>
                        setLastAction("project-types")
                    }
                    onOpenTagsManager={() => setLastAction("tags-manager")}
                    onToggleColorMode={() => setLastAction("color-mode")}
                    onOpenHelp={() => setLastAction("help")}
                    onCloseProject={() => setLastAction("close-project")}
                    onOpenCompile={() => setLastAction("compile")}
                />
                <div
                    data-testid="last-action"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastAction}
                </div>
                <div
                    data-testid="is-open"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(isOpen)}
                </div>
            </div>
        );
    },
};
