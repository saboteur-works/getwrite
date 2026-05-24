import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceContextMenu from "../../components/ResourceTree/ResourceContextMenu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "../../components/common/UI/ContextMenu";

const meta: Meta<typeof ResourceContextMenu> = {
  title: "Tree/ResourceContextMenu",
  component: ResourceContextMenu,
};

export default meta;

type Story = StoryObj<typeof ResourceContextMenu>;

export const Default: Story = {
  args: {
    resourceId: "res_123",
    resourceName: "Sample Resource",
    onClose: () => undefined,
    onAction: (action: string) => console.log("action", action),
  },
  render: (args) => (
    <ResourceContextMenu {...args}>
      <div
        style={{
          padding: 16,
          border: "1px dashed #ccc",
          cursor: "context-menu",
        }}
      >
        Right-click here to open the context menu
      </div>
    </ResourceContextMenu>
  ),
};

export const Open: Story = {
  render: () => {
    return (
      <ContextMenu defaultOpen>
        <ContextMenuTrigger asChild>
          <div
            style={{
              padding: 16,
              border: "1px dashed #ccc",
              cursor: "context-menu",
            }}
          >
            Right-click here (menu pre-opened)
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="resource-context-menu">
          <ContextMenuLabel className="resource-context-menu-header">
            Sample Resource
          </ContextMenuLabel>
          <ContextMenuItem
            className="resource-context-menu-item"
            onSelect={() => console.log("create")}
          >
            Create
          </ContextMenuItem>
          <ContextMenuItem
            className="resource-context-menu-item"
            onSelect={() => console.log("rename")}
          >
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="resource-context-menu-item"
            onSelect={() => console.log("delete")}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
};

export const Interactive: Story = {
  render: () => {
    const Wrapper = () => {
      const [lastAction, setLastAction] = React.useState<string | null>(null);

      return (
        <div style={{ padding: 80 }}>
          <div data-testid="outside" style={{ padding: 40, marginBottom: 16 }}>
            Outside area (click here to close)
          </div>
          <ContextMenu
            modal={false}
            onOpenChange={(open) => {
              if (!open) setLastAction((prev) => prev);
            }}
          >
            <ContextMenuTrigger asChild>
              <div
                data-testid="trigger"
                style={{
                  padding: 16,
                  border: "1px dashed #ccc",
                  cursor: "context-menu",
                }}
              >
                Right-click here to open the context menu
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent
              role="menu"
              aria-label="Resource options"
              className="resource-context-menu"
            >
              <ContextMenuLabel className="resource-context-menu-header">
                Sample Resource
              </ContextMenuLabel>
              {(
                [
                  "create",
                  "rename",
                  "copy",
                  "duplicate",
                  "delete",
                  "export",
                ] as const
              ).map((action) => (
                <ContextMenuItem
                  key={action}
                  className={`resource-context-menu-item${action === "delete" ? " resource-context-menu-item-danger" : ""}`}
                  role="menuitem"
                  onSelect={() => setLastAction(action)}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </ContextMenuItem>
              ))}
            </ContextMenuContent>
          </ContextMenu>
          <div
            data-testid="last-action"
            aria-hidden
            style={{ display: "none" }}
          >
            {lastAction}
          </div>
        </div>
      );
    };

    return <Wrapper />;
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId("trigger");

    // Right-click the trigger to open the menu at a real cursor position.
    await userEvent.pointer({ target: trigger, keys: "[MouseRight]" });

    // Menu portals to document.body — search the full document.
    const bodyScope = within(document.body);
    const menu = await bodyScope.findByRole("menu");
    expect(menu).toBeTruthy();

    const outside = canvas.getByTestId("outside");
    await userEvent.click(outside);

    await waitFor(() => {
      expect(menu).not.toBeInTheDocument();
    });
  },
};
