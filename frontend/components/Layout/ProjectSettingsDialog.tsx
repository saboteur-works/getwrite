"use client";

import React, { useState } from "react";
import { Type, PenLine, Tag, LayoutList } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../common/UI/Tabs/Tabs";
import HeadingSettingsModal from "../preferences/HeadingSettingsModal";
import BodySettingsModal from "../preferences/BodySettingsModal";
import DefaultRevisionNameModal from "../preferences/DefaultRevisionNameModal";
import TagsManagerModal from "../common/TagsManagerModal";
import SchemaManager from "../SchemaManager/SchemaManager";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";

export interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialHeadings?: EditorHeadingMap;
  onSaveHeadingSettings: (headings: EditorHeadingMap) => Promise<void>;
  initialBodySettings?: EditorBodyConfig;
  onSaveBodySettings: (body: EditorBodyConfig) => Promise<void>;
  initialDefaultRevisionName: string;
  onSaveDefaultRevisionName: (name: string) => Promise<void>;
  /** Root path of the active project — required to render the Tags section (FR11). */
  projectPath?: string;
}

type ProjectSettingsTab =
  | "headings"
  | "body-text"
  | "default-revision-name"
  | "tags"
  | "metadata";

interface ProjectSettingsTabOption {
  value: ProjectSettingsTab;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
}

const DEFAULT_TAB: ProjectSettingsTab = "headings";

const TAB_OPTIONS: ProjectSettingsTabOption[] = [
  { value: "headings", label: "Heading Styles", icon: Type },
  { value: "body-text", label: "Body Text Styles", icon: Type },
  {
    value: "default-revision-name",
    label: "Default Revision Name",
    icon: PenLine,
  },
  { value: "tags", label: "Manage Tags", icon: Tag },
  { value: "metadata", label: "Metadata", icon: LayoutList },
];

/**
 * Consolidated "Project Settings" surface: one Dialog with a horizontal tab
 * bar switching between the five previously-separate settings modals.
 * Every panel stays mounted for the dialog's lifetime (forceMount) so
 * in-progress edits survive tab switches. Saving in any one section does
 * not close the dialog; closing the dialog (its own close, Escape, backdrop)
 * closes everything at once.
 */
export default function ProjectSettingsDialog({
  open,
  onOpenChange,
  initialHeadings,
  onSaveHeadingSettings,
  initialBodySettings,
  onSaveBodySettings,
  initialDefaultRevisionName,
  onSaveDefaultRevisionName,
  projectPath,
}: ProjectSettingsDialogProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>(DEFAULT_TAB);
  const hasProjectPath = Boolean(projectPath);

  function handleClose(): void {
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
        <DialogTitle>Project Settings</DialogTitle>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ProjectSettingsTab)}
        >
          <TabsList aria-label="Project settings sections">
            {TAB_OPTIONS.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                disabled={opt.value === "tags" && !hasProjectPath}
              >
                <opt.icon size={14} aria-hidden="true" />
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="headings" forceMount>
            <HeadingSettingsModal
              initialHeadings={initialHeadings}
              onClose={handleClose}
              onSave={onSaveHeadingSettings}
              closeOnSave={false}
            />
          </TabsContent>

          <TabsContent value="body-text" forceMount>
            <BodySettingsModal
              initialBody={initialBodySettings}
              onClose={handleClose}
              onSave={onSaveBodySettings}
              closeOnSave={false}
            />
          </TabsContent>

          <TabsContent value="default-revision-name" forceMount>
            <DefaultRevisionNameModal
              initialName={initialDefaultRevisionName}
              onClose={handleClose}
              onSave={onSaveDefaultRevisionName}
              closeOnSave={false}
            />
          </TabsContent>

          <TabsContent value="tags" forceMount>
            {projectPath ? (
              <TagsManagerModal
                projectPath={projectPath}
                onClose={handleClose}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="metadata" forceMount>
            <SchemaManager onClose={handleClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
