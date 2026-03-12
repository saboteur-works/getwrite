"use client";

/**
 * @module HelpPage
 *
 * In-app help reference explaining core GetWrite concepts and workflows.
 * Renders either as a standalone route or as a modal overlay (renderInModal).
 */

import React, { useState } from "react";
import { X, ChevronRight } from "lucide-react";

/**
 * Props accepted by {@link HelpPage}.
 */
interface HelpPageProps {
    /** Optional close handler used when rendered as a modal. */
    onClose?: () => void;
    /** Renders without page-level shell wrapper when true. */
    renderInModal?: boolean;
}

/**
 * Identifier for a help section tab.
 */
type HelpTab =
    | "overview"
    | "projects"
    | "resources"
    | "editor"
    | "organizer"
    | "types"
    | "preferences";

interface TabDef {
    id: HelpTab;
    label: string;
}

const TABS: TabDef[] = [
    { id: "overview", label: "Getting Started" },
    { id: "projects", label: "Projects" },
    { id: "resources", label: "Resources & Files" },
    { id: "editor", label: "Editor" },
    { id: "organizer", label: "Organizer View" },
    { id: "types", label: "Project Types" },
    { id: "preferences", label: "Preferences" },
];

/**
 * A labelled tip row shown inside a callout block.
 */
function Tip({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <li className="flex gap-2 text-sm text-slate-700 help-text">
            <ChevronRight
                size={14}
                className="mt-[3px] shrink-0 text-slate-400 help-icon"
                aria-hidden="true"
            />
            <span>{children}</span>
        </li>
    );
}

/**
 * A section heading inside a tab panel.
 */
function SectionHeading({
    children,
}: {
    children: React.ReactNode;
}): JSX.Element {
    return (
        <h3 className="text-sm font-semibold text-slate-900 mb-2 help-heading">
            {children}
        </h3>
    );
}

/**
 * A descriptive paragraph.
 */
function Para({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <p className="text-sm text-slate-600 leading-relaxed mb-4 help-text">
            {children}
        </p>
    );
}

/**
 * A callout card grouping a set of tips.
 */
function TipCard({
    title,
    children,
}: {
    title?: string;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 mb-4 help-card">
            {title ? (
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 help-label">
                    {title}
                </p>
            ) : null}
            <ul className="space-y-1.5">{children}</ul>
        </div>
    );
}

function OverviewTab(): JSX.Element {
    return (
        <div>
            <Para>
                GetWrite is a web-based writing application for creative
                projects — novels, serial fiction, poetry, scripts, and more.
                Everything lives inside a{" "}
                <strong className="font-semibold">project</strong>, which
                organises your content into folders and files called{" "}
                <strong className="font-semibold">resources</strong>.
            </Para>

            <TipCard title="Quick workflow">
                <Tip>
                    Open GetWrite → the <strong>Start Page</strong> lets you
                    create, open, or manage projects.
                </Tip>
                <Tip>
                    Select a project to enter the{" "}
                    <strong>Create Interface</strong> with sidebar, work area,
                    and metadata panel.
                </Tip>
                <Tip>
                    Click any resource in the sidebar to open it in the work
                    area.
                </Tip>
                <Tip>
                    Right-click a resource for copy, duplicate, delete, and
                    export options.
                </Tip>
                <Tip>
                    Use the settings menu (gear icon) to access preferences and
                    project type management.
                </Tip>
            </TipCard>

            <SectionHeading>Three-pane layout</SectionHeading>
            <Para>
                The interface is divided into three columns: a collapsible{" "}
                <strong>Resource Tree</strong> on the left, the central{" "}
                <strong>Work Area</strong>, and a collapsible{" "}
                <strong>Metadata Panel</strong> on the right. Drag the dividers
                to resize panes, or click the arrow buttons to collapse them.
            </Para>

            <SectionHeading>Keyboard shortcuts</SectionHeading>
            <TipCard>
                <Tip>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-xs font-mono help-kbd">
                        Esc
                    </kbd>{" "}
                    — close open menus and modals.
                </Tip>
                <Tip>
                    Standard text-editor shortcuts (
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-xs font-mono help-kbd">
                        Cmd/Ctrl + Z
                    </kbd>{" "}
                    undo,{" "}
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-xs font-mono help-kbd">
                        Cmd/Ctrl + Shift + Z
                    </kbd>{" "}
                    redo) work in the editor.
                </Tip>
            </TipCard>
        </div>
    );
}

function ProjectsTab(): JSX.Element {
    return (
        <div>
            <Para>
                A <strong>project</strong> is a self-contained writing workspace
                stored as a folder on disk. Each project has a top-level folder
                named after the project, plus any subfolders you or the project
                type template created.
            </Para>

            <SectionHeading>Creating a project</SectionHeading>
            <Para>
                From the Start Page, click <strong>Create New Project</strong>.
                You will be asked to choose a <strong>project type</strong>{" "}
                (which determines the initial folder structure) and give the
                project a name.
            </Para>

            <SectionHeading>Managing projects</SectionHeading>
            <TipCard title="Start page actions">
                <Tip>
                    <strong>Open</strong> — opens an existing project from disk.
                </Tip>
                <Tip>
                    <strong>Copy</strong> — duplicates the project folder.
                </Tip>
                <Tip>
                    <strong>Rename</strong> — renames the project display name.
                </Tip>
                <Tip>
                    <strong>Delete</strong> — removes the project (
                    <em>cannot be undone</em>).
                </Tip>
                <Tip>
                    <strong>Package</strong> — exports the project as a portable
                    zip file.
                </Tip>
            </TipCard>

            <SectionHeading>Special folders</SectionHeading>
            <Para>
                Some folders have semantic meaning: <strong>Characters</strong>,{" "}
                <strong>Locations</strong>, <strong>Items</strong>,{" "}
                <strong>Front Matter</strong>, and <strong>Back Matter</strong>.
                Files placed inside these folders can be linked to other
                resources via the Metadata Panel. The <strong>Workspace</strong>{" "}
                folder is always at the top of the tree and cannot be moved,
                renamed, or deleted.
            </Para>
        </div>
    );
}

function ResourcesTab(): JSX.Element {
    return (
        <div>
            <Para>
                A <strong>resource</strong> is any file or folder inside your
                project. Resources can be text documents, images, or audio
                files. Each resource has a stable identity independent of its
                folder path or display name.
            </Para>

            <SectionHeading>Resource types</SectionHeading>
            <TipCard>
                <Tip>
                    <strong>Text</strong> — rich-text document editable in the
                    editor.
                </Tip>
                <Tip>
                    <strong>Image</strong> — displayed in the work area;
                    resolution and Exif data shown in the metadata panel.
                </Tip>
                <Tip>
                    <strong>Audio</strong> — play/pause/scrub widget; duration
                    and type shown in metadata.
                </Tip>
                <Tip>
                    <strong>Folder</strong> — groups other resources; selecting
                    a folder opens its contents in the work area.
                </Tip>
            </TipCard>

            <SectionHeading>Revisions</SectionHeading>
            <Para>
                Every resource maintains a linear revision history. The most
                recent revision is the canonical (active) one. You can view
                previous revisions from the Metadata Panel. Editing a previous
                revision will prompt a warning; saving it promotes it to the
                newest revision. The canonical revision cannot be deleted.
            </Para>

            <SectionHeading>Drag and drop reordering</SectionHeading>
            <Para>
                Resources and folders can be reordered inside the Resource Tree
                via drag and drop. Their order in the tree is reflected in the
                Organizer View.
            </Para>
        </div>
    );
}

function EditorTab(): JSX.Element {
    return (
        <div>
            <Para>
                When a text resource is selected, the Work Area renders a
                rich-text editor. Changes are{" "}
                <strong>auto-saved continuously</strong> — there is no manual
                save step. Auto-save overwrites the current revision without
                creating a new one.
            </Para>

            <TipCard title="Editor features">
                <Tip>
                    Inline formatting: bold, italic, underline, and more via the
                    toolbar or keyboard shortcuts.
                </Tip>
                <Tip>
                    Full undo/redo history is kept per-session (cleared on
                    reload).
                </Tip>
                <Tip>
                    Word count, character count, and paragraph count are shown
                    in the footer.
                </Tip>
                <Tip>
                    Switching away without saving a manually edited earlier
                    revision prompts a discard/save dialog.
                </Tip>
            </TipCard>

            <SectionHeading>Diff view</SectionHeading>
            <Para>
                Switch to <strong>Diff View</strong> from the view switcher to
                compare two revisions of a resource side-by-side.
            </Para>

            <SectionHeading>Folder text view</SectionHeading>
            <Para>
                Selecting a folder containing only text resources renders all
                documents sequentially with dividers. Each document saves
                independently.
            </Para>
        </div>
    );
}

function OrganizerTab(): JSX.Element {
    return (
        <div>
            <Para>
                The <strong>Organizer View</strong> presents the contents of a
                selected folder as cards arranged left-to-right, top-to-bottom,
                matching the Resource Tree order.
            </Para>

            <TipCard title="Card content">
                <Tip>Text files show a trimmed preview of their content.</Tip>
                <Tip>Image files show a thumbnail.</Tip>
                <Tip>Audio files show an inline player.</Tip>
                <Tip>
                    Toggle the card body between its default content and the
                    resource&rsquo;s notes using the button in the view header.
                </Tip>
            </TipCard>

            <SectionHeading>Filtering</SectionHeading>
            <Para>
                Filter cards by <strong>Status</strong>,{" "}
                <strong>Character</strong>, <strong>Location</strong>, or{" "}
                <strong>Word Count</strong> using the filter controls at the top
                of the Organizer View.
            </Para>

            <Para>
                Mixed-content folders (e.g. text and images together) switch to
                Organizer View automatically when selected.
            </Para>
        </div>
    );
}

function TypesTab(): JSX.Element {
    return (
        <div>
            <Para>
                <strong>Project Types</strong> are templates that define the
                initial folder structure created when a new project is started.
                Examples include Novel, Serial Fiction, or Script.
            </Para>

            <SectionHeading>Managing project types</SectionHeading>
            <Para>
                Open <strong>Project Type Manager</strong> from the settings
                menu (gear icon). From there you can create new types, edit
                existing ones, configure default folders and resources, and
                delete types you no longer need.
            </Para>

            <TipCard title="What a project type defines">
                <Tip>A unique ID and display name.</Tip>
                <Tip>
                    A description shown when selecting a project type during
                    creation.
                </Tip>
                <Tip>
                    Default top-level folders and their contents created
                    automatically for new projects.
                </Tip>
            </TipCard>
        </div>
    );
}

function PreferencesTab(): JSX.Element {
    return (
        <div>
            <Para>
                Open <strong>User Preferences</strong> from the settings menu
                (gear icon) to customise the look and feel of GetWrite.
            </Para>

            <SectionHeading>Appearance options</SectionHeading>
            <TipCard>
                <Tip>
                    <strong>Color mode</strong> — Light, Dark, or follow the
                    system default. The quick toggle in the settings menu flips
                    between light and dark immediately.
                </Tip>
                <Tip>
                    <strong>Density</strong> — Comfortable or Compact layout
                    spacing.
                </Tip>
                <Tip>
                    <strong>Reduced motion</strong> — Disables non-essential
                    animations.
                </Tip>
            </TipCard>

            <SectionHeading>Persistence</SectionHeading>
            <Para>
                Preferences are stored globally in your browser and, when a
                project is open, also saved to the project&rsquo;s own
                configuration file so the same settings apply on every device
                you use to open that project.
            </Para>
        </div>
    );
}

const TAB_CONTENT: Record<HelpTab, () => JSX.Element> = {
    overview: OverviewTab,
    projects: ProjectsTab,
    resources: ResourcesTab,
    editor: EditorTab,
    organizer: OrganizerTab,
    types: TypesTab,
    preferences: PreferencesTab,
};

/**
 * Help page rendered either as a standalone route or as a modal overlay.
 *
 * @param props - {@link HelpPageProps}.
 * @returns Help page element.
 */
export default function HelpPage({
    onClose,
    renderInModal = false,
}: HelpPageProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<HelpTab>("overview");
    const ActiveContent = TAB_CONTENT[activeTab];

    const handleClose = (): void => {
        if (onClose) {
            onClose();
        }
    };

    const content = (
        <div className="help-layout">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 help-header">
                <div>
                    <h2 className="text-base font-semibold text-slate-900 help-heading">
                        Help &amp; Documentation
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 help-label">
                        Learn how to use GetWrite
                    </p>
                </div>
                {onClose ? (
                    <button
                        type="button"
                        onClick={handleClose}
                        className="appshell-close-button"
                        aria-label="Close help"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                ) : null}
            </div>

            {/* Body: sidebar nav + content */}
            <div className="flex min-h-0 flex-1">
                {/* Tab sidebar */}
                <nav
                    className="help-nav"
                    role="tablist"
                    aria-label="Help sections"
                >
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={`help-nav-item ${activeTab === tab.id ? "help-nav-item--active" : ""}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {/* Content panel */}
                <div
                    role="tabpanel"
                    aria-label={`${TABS.find((t) => t.id === activeTab)?.label ?? ""} help content`}
                    className="help-content"
                >
                    <ActiveContent />
                </div>
            </div>
        </div>
    );

    if (renderInModal) {
        return content;
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-start justify-center p-8">
            <div className="w-[min(860px,100%)] rounded-xl border border-slate-200 bg-white shadow-sm">
                {content}
            </div>
        </div>
    );
}
