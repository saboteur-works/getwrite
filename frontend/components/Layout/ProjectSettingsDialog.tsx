"use client";

import React, { useEffect, useState } from "react";
import {
  Type,
  PenLine,
  Tag,
  LayoutList,
  Target,
  Ban,
  Users,
  Lock,
  CalendarClock,
  LayoutGrid,
  SpellCheck,
  Puzzle,
  PanelLeftOpen,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
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
import DailyWordGoalField from "./DailyWordGoalField";
import WordCountGoalField from "./WordCountGoalField";
import GoalFilterSection from "./GoalFilterSection";
import type { FilterChipField } from "../QueryBuilder/FilterChip";
import type { ResourceOption } from "../Sidebar/controls/ResourceRefInput";
import { notifyWritingLogGoalChanged } from "../../src/lib/writing-log-signal";
import NoiseWordsSettingsTab from "./NoiseWordsSettingsTab";
import SpellingSettingsTab from "./SpellingSettingsTab";
import MentionHighlightDurationField from "./MentionHighlightDurationField";
import EntityFeatureToggles from "../preferences/EntityFeatureToggles";
import RelationshipTypesSettings from "../preferences/RelationshipTypesSettings";
import SubtypesSettings from "../preferences/SubtypesSettings";
import StatusesSettings from "../preferences/StatusesSettings";
import ProjectEncryptionPanel from "../preferences/ProjectEncryptionPanel";
import ModuleSwitchSection from "../Modules/ModuleSwitchSection";
import TimelineViewToggle from "../preferences/TimelineViewToggle";
import OrganizerCardBodySettings from "../preferences/OrganizerCardBodySettings";
import {
  readSettingsRailHidden,
  writeSettingsRailHidden,
} from "../../src/lib/settings-rail-preference";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";

/**
 * Reports a Writing Goals save to whoever holds the project's config, with the
 * saved value (`null` when cleared), so a reopened dialog shows it (D-14).
 */
export type ProjectGoalSavedHandler = (
  ...args:
    | [key: "dailyWordGoal" | "wordCountGoal", goal: number | null]
    | [key: "goalFilter", goal: unknown]
) => void;

/** Stable empty list so an omitted `goalFilterFields` does not re-seed the builder. */
const NO_GOAL_FILTER_FIELDS: FilterChipField[] = [];

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
  /** Server-validated id of the active project — required to render the daily writing goal field (Feature 59, FR-6). */
  projectId?: string;
  /** Currently saved `dailyWordGoal`, if any. */
  initialDailyWordGoal?: number;
  /** Currently saved project-wide `wordCountGoal`, if any. */
  initialWordCountGoal?: number;
  /** Called after a Writing Goals field saves, so the owner of the project's config can update it (D-14). */
  onProjectGoalSaved?: ProjectGoalSavedHandler;
  /** Currently saved `config.goalFilter`, if any (Feature 98, FR-19). */
  initialGoalFilter?: unknown;
  /** The project's query-builder field list for the goal filter section. */
  goalFilterFields?: FilterChipField[];
  /** Resource typeahead options for the goal filter's resource-ref chips. */
  resolveGoalFilterResourceOptions?: (
    refFolder: string | undefined,
    includeSubfolders?: boolean,
  ) => ResourceOption[];
  /** Folder typeahead options for the goal filter's folder-ref chips. */
  resolveGoalFilterFolderOptions?: () => ResourceOption[];
  /**
   * Currently saved `config.mentionHighlightDurationSeconds`, if any
   * (Entity mention navigation, Task 10). Omitted when the project has
   * never set a value; `MentionHighlightDurationField` falls back to its
   * own 2-second default in that case.
   */
  initialMentionHighlightDurationSeconds?: number;
}

type ProjectSettingsTab =
  | "editor"
  | "default-revision-name"
  | "tags"
  | "metadata"
  | "timeline"
  | "organizer"
  | "writing-goals"
  | "spelling"
  | "noise-words"
  | "entities"
  | "modules"
  | "encryption";

interface ProjectSettingsTabOption {
  value: ProjectSettingsTab;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
}

const DEFAULT_TAB: ProjectSettingsTab = "editor";

/**
 * Shared styling for each settings panel: a bordered card that scrolls
 * internally, mirroring the editor pane in ProjectTypesManagerPage so every
 * section sits in the same visual frame rather than growing the dialog.
 */
const PANEL_CLASS =
  "min-h-0 overflow-y-auto rounded-lg border border-gw-border bg-gw-chrome2 p-3 md:p-5";

const TAB_OPTIONS: ProjectSettingsTabOption[] = [
  { value: "editor", label: "Editor", icon: Type },
  {
    value: "default-revision-name",
    label: "Default Revision Name",
    icon: PenLine,
  },
  { value: "tags", label: "Manage Tags", icon: Tag },
  { value: "metadata", label: "Metadata", icon: LayoutList },
  { value: "timeline", label: "Timeline", icon: CalendarClock },
  { value: "organizer", label: "Organizer", icon: LayoutGrid },
  { value: "writing-goals", label: "Writing Goals", icon: Target },
  { value: "spelling", label: "Spelling", icon: SpellCheck },
  { value: "noise-words", label: "Noise Words", icon: Ban },
  { value: "entities", label: "Entities", icon: Users },
  { value: "modules", label: "Modules", icon: Puzzle },
  { value: "encryption", label: "Project Encryption", icon: Lock },
];

/**
 * Consolidated "Project Settings" surface: one Dialog with a vertical, left-hand
 * tab rail switching between the previously-separate settings modals plus the Writing Goals
 * section.
 *
 * Below 768px (CSS only, `.settings-tabs` in `getwrite-utilities.css`) the rail
 * is a strip of icons. "Show section names" expands it over the panel, which
 * keeps its width; choosing a tab, Escape or a tap outside collapses it.
 * "Hide sections" in the header removes the rail so the panel fills the
 * dialog; that choice is remembered per device
 * (`settings-rail-preference.ts`). At 768px and wider the two buttons are
 * hidden and the rail is the full list, as before.
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
  projectId,
  initialDailyWordGoal,
  initialWordCountGoal,
  onProjectGoalSaved,
  initialGoalFilter,
  goalFilterFields = NO_GOAL_FILTER_FIELDS,
  resolveGoalFilterResourceOptions,
  resolveGoalFilterFolderOptions,
  initialMentionHighlightDurationSeconds,
}: ProjectSettingsDialogProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>(DEFAULT_TAB);
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isRailHidden, setIsRailHidden] = useState(false);
  const hasProjectPath = Boolean(projectPath);

  // Each open starts with the rail collapsed and re-reads the remembered
  // hidden choice (read in an effect, not during render, so the prerender
  // and the first client render agree).
  useEffect(() => {
    if (!open) return;
    setIsRailExpanded(false);
    setIsRailHidden(readSettingsRailHidden());
  }, [open]);

  function setRailHidden(isHidden: boolean): void {
    setIsRailHidden(isHidden);
    setIsRailExpanded(false);
    writeSettingsRailHidden(isHidden);
  }

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
      <DialogContent
        maxWidth="max-w-[900px]"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          // Escape closes an expanded rail first, then the dialog.
          if (!isRailExpanded) return;
          event.preventDefault();
          setIsRailExpanded(false);
        }}
      >
        <div className="flex h-[85vh] flex-col gap-4 p-4 md:gap-6 md:p-6 lg:p-8">
          {/* A plain div, not <header>: a <header> that is not inside
              sectioning content maps to the `banner` landmark, and
              role="dialog" is not sectioning content — so this title row
              became a second banner alongside the app top bar
              (ShellSettingsMenu.tsx's .appshell-topbar), which axe-core
              flags as `landmark-no-duplicate-banner`. The dialog is already
              named by its DialogTitle. */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold text-gw-primary md:text-2xl">
                Project Settings
              </DialogTitle>
              <p className="hidden text-sm text-gw-secondary md:block">
                Configure editor typography, tags, and metadata for this
                project.
              </p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <button
                type="button"
                onClick={() => setRailHidden(!isRailHidden)}
                aria-pressed={isRailHidden}
                aria-label="Hide sections"
                title={isRailHidden ? "Show sections" : "Hide sections"}
                className="settings-rail-hide h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gw-border bg-transparent text-gw-primary transition-colors duration-150 hover:bg-gw-chrome2"
              >
                <PanelLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 rounded-md border border-gw-primary bg-transparent px-3 py-2 text-sm font-medium text-gw-primary transition-colors duration-150 hover:bg-gw-chrome2"
              >
                Close
              </button>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as ProjectSettingsTab);
              setIsRailExpanded(false);
            }}
            orientation="vertical"
            className={[
              "settings-tabs min-h-0 flex-1",
              isRailExpanded ? "settings-tabs--expanded" : "",
              isRailHidden ? "settings-tabs--rail-hidden" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isRailExpanded ? (
              <div
                className="settings-rail-scrim"
                aria-hidden="true"
                onClick={() => setIsRailExpanded(false)}
              />
            ) : null}
            <div className="settings-rail">
              <button
                type="button"
                className="settings-rail-toggle"
                aria-expanded={isRailExpanded}
                aria-label={
                  isRailExpanded ? "Hide section names" : "Show section names"
                }
                onClick={() => setIsRailExpanded(!isRailExpanded)}
              >
                {isRailExpanded ? (
                  <PanelLeftClose size={20} aria-hidden="true" />
                ) : (
                  <PanelLeftOpen size={20} aria-hidden="true" />
                )}
              </button>
              <TabsList aria-label="Project settings sections">
                {TAB_OPTIONS.map((opt) => (
                  <TabsTrigger
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.value === "tags" && !hasProjectPath}
                  >
                    <opt.icon size={14} aria-hidden="true" />
                    <span className="settings-tab-label">{opt.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent
              value="editor"
              forceMount
              className={`${PANEL_CLASS} flex flex-col gap-8`}
            >
              <HeadingSettingsModal
                initialHeadings={initialHeadings}
                onClose={handleClose}
                onSave={onSaveHeadingSettings}
                closeOnSave={false}
              />
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

            <TabsContent
              value="metadata"
              forceMount
              className={`${PANEL_CLASS} flex flex-col gap-6`}
            >
              <SubtypesSettings />
              <StatusesSettings />
              <SchemaManager onClose={handleClose} />
            </TabsContent>

            <TabsContent value="timeline" forceMount className={PANEL_CLASS}>
              <TimelineViewToggle />
            </TabsContent>

            <TabsContent value="organizer" forceMount className={PANEL_CLASS}>
              <OrganizerCardBodySettings />
            </TabsContent>

            <TabsContent
              value="writing-goals"
              forceMount
              className={PANEL_CLASS}
            >
              {projectId ? (
                <>
                  <DailyWordGoalField
                    projectId={projectId}
                    initialGoal={initialDailyWordGoal}
                    onSaved={(goal) =>
                      onProjectGoalSaved?.("dailyWordGoal", goal)
                    }
                  />
                  <WordCountGoalField
                    projectId={projectId}
                    initialGoal={initialWordCountGoal}
                    onSaved={(goal) =>
                      onProjectGoalSaved?.("wordCountGoal", goal)
                    }
                  />
                  <GoalFilterSection
                    projectId={projectId}
                    storedFilter={initialGoalFilter}
                    fields={goalFilterFields}
                    resolveResourceOptions={resolveGoalFilterResourceOptions}
                    resolveFolderOptions={resolveGoalFilterFolderOptions}
                    onSaved={(goalFilter) => {
                      notifyWritingLogGoalChanged();
                      onProjectGoalSaved?.("goalFilter", goalFilter);
                    }}
                  />
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="spelling" forceMount className={PANEL_CLASS}>
              {projectId ? <SpellingSettingsTab /> : null}
            </TabsContent>

            <TabsContent value="noise-words" forceMount className={PANEL_CLASS}>
              {projectId ? (
                <NoiseWordsSettingsTab projectId={projectId} />
              ) : null}
            </TabsContent>

            <TabsContent
              value="entities"
              forceMount
              className={`${PANEL_CLASS} flex flex-col gap-6`}
            >
              {projectId ? (
                <>
                  <EntityFeatureToggles />
                  <RelationshipTypesSettings />
                  <MentionHighlightDurationField
                    projectId={projectId}
                    initialDurationSeconds={
                      initialMentionHighlightDurationSeconds
                    }
                  />
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="modules" forceMount className={PANEL_CLASS}>
              {projectId ? <ModuleSwitchSection projectId={projectId} /> : null}
            </TabsContent>

            <TabsContent value="encryption" forceMount className={PANEL_CLASS}>
              <ProjectEncryptionPanel />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
