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

/**
 * Shared styling for each settings panel: a bordered card that scrolls
 * internally, mirroring the editor pane in ProjectTypesManagerPage so every
 * section sits in the same visual frame rather than growing the dialog.
 */
const PANEL_CLASS =
  "min-h-0 overflow-y-auto rounded-lg border border-gw-border bg-gw-chrome2 p-5";

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
 * Consolidated "Project Settings" surface: one Dialog with a vertical, left-hand
 * tab rail switching between the five previously-separate settings modals.
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
      <DialogContent maxWidth="max-w-[900px]" aria-describedby={undefined}>
        <div className="flex h-[85vh] flex-col gap-6 p-6 lg:p-8">
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-semibold text-gw-primary">
                Project Settings
              </DialogTitle>
              <p className="text-sm text-gw-secondary">
                Configure editor typography, tags, and metadata for this
                project.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-md border border-gw-primary bg-transparent px-3 py-2 text-sm font-medium text-gw-primary transition-colors duration-150 hover:bg-gw-chrome2"
            >
              Close
            </button>
          </header>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ProjectSettingsTab)}
            orientation="vertical"
            className="min-h-0 flex-1"
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

            <TabsContent value="headings" forceMount className={PANEL_CLASS}>
              <HeadingSettingsModal
                initialHeadings={initialHeadings}
                onClose={handleClose}
                onSave={onSaveHeadingSettings}
                closeOnSave={false}
              />
            </TabsContent>

            <TabsContent value="body-text" forceMount className={PANEL_CLASS}>
              <BodySettingsModal
                initialBody={initialBodySettings}
                onClose={handleClose}
                onSave={onSaveBodySettings}
                closeOnSave={false}
              />
            </TabsContent>

            <TabsContent
              value="default-revision-name"
              forceMount
              className={PANEL_CLASS}
            >
              <DefaultRevisionNameModal
                initialName={initialDefaultRevisionName}
                onClose={handleClose}
                onSave={onSaveDefaultRevisionName}
                closeOnSave={false}
              />
            </TabsContent>

            <TabsContent value="tags" forceMount className={PANEL_CLASS}>
              {projectPath ? (
                <TagsManagerModal
                  projectPath={projectPath}
                  onClose={handleClose}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="metadata" forceMount className={PANEL_CLASS}>
              <SchemaManager onClose={handleClose} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
