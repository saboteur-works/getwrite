export type HelpTab =
    | "overview"
    | "projects"
    | "resources"
    | "editor"
    | "organizer"
    | "types"
    | "preferences";

export type HelpRichTextPart =
    | string
    | {
          kind: "strong" | "em" | "kbd";
          text: string;
      };

export interface HelpParagraphBlock {
    type: "paragraph";
    content: HelpRichTextPart[];
}

export interface HelpHeadingBlock {
    type: "heading";
    content: HelpRichTextPart[];
}

export interface HelpTipCardBlock {
    type: "tip-card";
    title?: string;
    items: HelpRichTextPart[][];
}

export type HelpContentBlock =
    | HelpParagraphBlock
    | HelpHeadingBlock
    | HelpTipCardBlock;

export interface HelpTabDefinition {
    id: HelpTab;
    label: string;
    blocks: HelpContentBlock[];
}

const strong = (text: string): HelpRichTextPart => ({ kind: "strong", text });
const em = (text: string): HelpRichTextPart => ({ kind: "em", text });
const kbd = (text: string): HelpRichTextPart => ({ kind: "kbd", text });

export const HELP_TABS: HelpTabDefinition[] = [
    {
        id: "overview",
        label: "Getting Started",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "GetWrite is a web-based writing application for creative projects - novels, serial fiction, poetry, scripts, and more. Everything lives inside a ",
                    strong("project"),
                    ", which organises your content into folders and files called ",
                    strong("resources"),
                    ".",
                ],
            },
            {
                type: "tip-card",
                title: "Quick workflow",
                items: [
                    [
                        "Open GetWrite -> the ",
                        strong("Start Page"),
                        " lets you create, open, or manage projects.",
                    ],
                    [
                        "Select a project to enter the ",
                        strong("Create Interface"),
                        " with sidebar, work area, and metadata panel.",
                    ],
                    [
                        "Click any resource in the sidebar to open it in the work area.",
                    ],
                    [
                        "Right-click a resource for copy, duplicate, delete, and export options.",
                    ],
                    [
                        "Use the settings menu (gear icon) to access preferences and project type management.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Three-pane layout"],
            },
            {
                type: "paragraph",
                content: [
                    "The interface is divided into three columns: a collapsible ",
                    strong("Resource Tree"),
                    " on the left, the central ",
                    strong("Work Area"),
                    ", and a collapsible ",
                    strong("Metadata Panel"),
                    " on the right. Drag the dividers to resize panes, or click the arrow buttons to collapse them.",
                ],
            },
            {
                type: "heading",
                content: ["Keyboard shortcuts"],
            },
            {
                type: "tip-card",
                items: [
                    [kbd("Esc"), " - close open menus and modals."],
                    [
                        "Standard text-editor shortcuts (",
                        kbd("Cmd/Ctrl + Z"),
                        " undo, ",
                        kbd("Cmd/Ctrl + Shift + Z"),
                        " redo) work in the editor.",
                    ],
                ],
            },
        ],
    },
    {
        id: "projects",
        label: "Projects",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "A ",
                    strong("project"),
                    " is a self-contained writing workspace stored as a folder on disk. Each project has a top-level folder named after the project, plus any subfolders you or the project type template created.",
                ],
            },
            {
                type: "heading",
                content: ["Creating a project"],
            },
            {
                type: "paragraph",
                content: [
                    "From the Start Page, click ",
                    strong("Create New Project"),
                    ". You will be asked to choose a ",
                    strong("project type"),
                    " (which determines the initial folder structure) and give the project a name.",
                ],
            },
            {
                type: "heading",
                content: ["Managing projects"],
            },
            {
                type: "tip-card",
                title: "Start page actions",
                items: [
                    [strong("Open"), " - opens an existing project from disk."],
                    [strong("Copy"), " - duplicates the project folder."],
                    [strong("Rename"), " - renames the project display name."],
                    [
                        strong("Delete"),
                        " - removes the project (",
                        em("cannot be undone"),
                        ").",
                    ],
                    [
                        strong("Package"),
                        " - exports the project as a portable zip file.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Special folders"],
            },
            {
                type: "paragraph",
                content: [
                    "Some folders have semantic meaning: ",
                    strong("Characters"),
                    ", ",
                    strong("Locations"),
                    ", ",
                    strong("Items"),
                    ", ",
                    strong("Front Matter"),
                    ", and ",
                    strong("Back Matter"),
                    ". Files placed inside these folders can be linked to other resources via the Metadata Panel. The ",
                    strong("Workspace"),
                    " folder is always at the top of the tree and cannot be moved, renamed, or deleted.",
                ],
            },
        ],
    },
    {
        id: "resources",
        label: "Resources & Files",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "A ",
                    strong("resource"),
                    " is any file or folder inside your project. Resources can be text documents, images, or audio files. Each resource has a stable identity independent of its folder path or display name.",
                ],
            },
            {
                type: "heading",
                content: ["Resource types"],
            },
            {
                type: "tip-card",
                items: [
                    [
                        strong("Text"),
                        " - rich-text document editable in the editor.",
                    ],
                    [
                        strong("Image"),
                        " - displayed in the work area; resolution and Exif data shown in the metadata panel.",
                    ],
                    [
                        strong("Audio"),
                        " - play/pause/scrub widget; duration and type shown in metadata.",
                    ],
                    [
                        strong("Folder"),
                        " - groups other resources; selecting a folder opens its contents in the work area.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Revisions"],
            },
            {
                type: "paragraph",
                content: [
                    "Every resource maintains a linear revision history. The most recent revision is the canonical (active) one. You can view previous revisions from the Metadata Panel. Editing a previous revision will prompt a warning; saving it promotes it to the newest revision. The canonical revision cannot be deleted.",
                ],
            },
            {
                type: "heading",
                content: ["Drag and drop reordering"],
            },
            {
                type: "paragraph",
                content: [
                    "Resources and folders can be reordered inside the Resource Tree via drag and drop. Their order in the tree is reflected in the Organizer View.",
                ],
            },
        ],
    },
    {
        id: "editor",
        label: "Editor",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "When a text resource is selected, the Work Area renders a rich-text editor. Changes are ",
                    strong("auto-saved continuously"),
                    " - there is no manual save step. Auto-save overwrites the current revision without creating a new one.",
                ],
            },
            {
                type: "tip-card",
                title: "Editor features",
                items: [
                    [
                        "Inline formatting: bold, italic, underline, and more via the toolbar or keyboard shortcuts.",
                    ],
                    [
                        "Full undo/redo history is kept per-session (cleared on reload).",
                    ],
                    [
                        "Word count, character count, and paragraph count are shown in the footer.",
                    ],
                    [
                        "Switching away without saving a manually edited earlier revision prompts a discard/save dialog.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Diff view"],
            },
            {
                type: "paragraph",
                content: [
                    "Switch to ",
                    strong("Diff View"),
                    " from the view switcher to compare two revisions of a resource side-by-side.",
                ],
            },
            {
                type: "heading",
                content: ["Folder text view"],
            },
            {
                type: "paragraph",
                content: [
                    "Selecting a folder containing only text resources renders all documents sequentially with dividers. Each document saves independently.",
                ],
            },
        ],
    },
    {
        id: "organizer",
        label: "Organizer View",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "The ",
                    strong("Organizer View"),
                    " presents the contents of a selected folder as cards arranged left-to-right, top-to-bottom, matching the Resource Tree order.",
                ],
            },
            {
                type: "tip-card",
                title: "Card content",
                items: [
                    ["Text files show a trimmed preview of their content."],
                    ["Image files show a thumbnail."],
                    ["Audio files show an inline player."],
                    [
                        "Toggle the card body between its default content and the resource's notes using the button in the view header.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Filtering"],
            },
            {
                type: "paragraph",
                content: [
                    "Filter cards by ",
                    strong("Status"),
                    ", ",
                    strong("Character"),
                    ", ",
                    strong("Location"),
                    ", or ",
                    strong("Word Count"),
                    " using the filter controls at the top of the Organizer View.",
                ],
            },
            {
                type: "paragraph",
                content: [
                    "Mixed-content folders (for example, text and images together) switch to Organizer View automatically when selected.",
                ],
            },
        ],
    },
    {
        id: "types",
        label: "Project Types",
        blocks: [
            {
                type: "paragraph",
                content: [
                    strong("Project Types"),
                    " are templates that define the initial folder structure created when a new project is started. Examples include Novel, Serial Fiction, or Script.",
                ],
            },
            {
                type: "heading",
                content: ["Managing project types"],
            },
            {
                type: "paragraph",
                content: [
                    "Open ",
                    strong("Project Type Manager"),
                    " from the settings menu (gear icon). From there you can create new types, edit existing ones, configure default folders and resources, and delete types you no longer need.",
                ],
            },
            {
                type: "tip-card",
                title: "What a project type defines",
                items: [
                    ["A unique ID and display name."],
                    [
                        "A description shown when selecting a project type during creation.",
                    ],
                    [
                        "Default top-level folders and their contents created automatically for new projects.",
                    ],
                ],
            },
        ],
    },
    {
        id: "preferences",
        label: "Preferences",
        blocks: [
            {
                type: "paragraph",
                content: [
                    "Open ",
                    strong("User Preferences"),
                    " from the settings menu (gear icon) to customise the look and feel of GetWrite.",
                ],
            },
            {
                type: "heading",
                content: ["Appearance options"],
            },
            {
                type: "tip-card",
                items: [
                    [
                        strong("Color mode"),
                        " - Light, Dark, or follow the system default. The quick toggle in the settings menu flips between light and dark immediately.",
                    ],
                    [
                        strong("Density"),
                        " - Comfortable or Compact layout spacing.",
                    ],
                    [
                        strong("Reduced motion"),
                        " - Disables non-essential animations.",
                    ],
                ],
            },
            {
                type: "heading",
                content: ["Persistence"],
            },
            {
                type: "paragraph",
                content: [
                    "Preferences are stored globally in your browser and, when a project is open, also saved to the project's own configuration file so the same settings apply on every device you use to open that project.",
                ],
            },
        ],
    },
];
