import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/common/UI/Tabs/Tabs";

const meta: Meta = { title: "Common/UI/Tabs" };

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("edit");
    return (
      <Tabs value={value} onValueChange={setValue}>
        <TabsList aria-label="Example tabs">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <p style={{ padding: 16 }}>Edit panel content.</p>
        </TabsContent>
        <TabsContent value="preview">
          <p style={{ padding: 16 }}>Preview panel content.</p>
        </TabsContent>
        <TabsContent value="settings">
          <p style={{ padding: 16 }}>Settings panel content.</p>
        </TabsContent>
      </Tabs>
    );
  },
};

export const WithForceMount: Story = {
  name: "With forceMount (preserves state across tabs)",
  render: () => {
    const [value, setValue] = useState("edit");
    const [draft, setDraft] = useState("");
    return (
      <Tabs value={value} onValueChange={setValue}>
        <TabsList aria-label="Tabs with a forceMount panel">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" forceMount>
          <div style={{ padding: 16 }}>
            <label htmlFor="story-draft-input">
              Type here, switch tabs, then come back — your text stays.
            </label>
            <input
              id="story-draft-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ display: "block", marginTop: 8 }}
            />
          </div>
        </TabsContent>
        <TabsContent value="preview" forceMount>
          <p style={{ padding: 16 }}>
            This panel stays mounted too; switching away only CSS-hides it
            instead of unmounting it.
          </p>
        </TabsContent>
      </Tabs>
    );
  },
};

export const WithDisabledTab: Story = {
  render: () => {
    const [value, setValue] = useState("edit");
    return (
      <Tabs value={value} onValueChange={setValue}>
        <TabsList aria-label="Tabs with a disabled option">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="diff" disabled>
            Diff
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <p style={{ padding: 16 }}>Edit panel content.</p>
        </TabsContent>
        <TabsContent value="preview">
          <p style={{ padding: 16 }}>Preview panel content.</p>
        </TabsContent>
      </Tabs>
    );
  },
};
