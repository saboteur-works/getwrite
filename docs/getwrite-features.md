# GetWrite Features

## Projects

A project is a self-contained writing workspace stored as a folder on disk. Each project has a top-level folder named after the project, plus any subfolders you or the project type template created.

### Creating a project

From the Start Page, click Create New Project. You will be asked to choose a project type (which determines the initial folder structure) and give the project a name.

## Custom Project Types

Project Types are templates that define the initial folder structure created when a new project is started. Examples include Novel, Serial Fiction, or Script.

Managing project types

Open **Project Type Manager** from the settings menu (gear icon). From there you can create new types, edit existing ones, configure default folders and resources, and delete types you no longer need.

### What a project type defines

- A unique ID and display name.
- A description shown when selecting a project type during creation.
- Default top-level folders and their contents created automatically for new projects.

## Start Page - Projects, at a glance

When users open GetWrite, they're presented with a list of their current projects, and the total amount of projects and resources they've created. They can also create, delete, rename, or compile projects.

## Resource Tree

Projects are represented by a Resource Tree, allowing users to create, modify, and organize their files with a familiar interface.

## Rich Text Editing

GetWrite features a rich text editor with a focus on getting the work done.

## Resources & Files

A resource is any file or folder inside your project. Resources can be text documents, images, or audio files. Each resource has a stable identity independent of its folder path or display name.

### Resource Types

- **Text** - rich-text document editable in the editor.
- **Image** - displayed in the work area; resolution and Exif data shown in the metadata panel.
- **Audio** - play/pause/scrub widget; duration and type shown in metadata.
- **Folder** - groups other resources; selecting a folder opens its contents in the work area.

### Revisions

Every resource maintains a linear revision history. The most recent revision is the canonical (active) one. You can view previous revisions from the Metadata Panel. Editing a previous revision will prompt a warning; saving it promotes it to the newest revision. The canonical revision cannot be deleted.

### Drag and drop reordering

Resources and folders can be reordered inside the Resource Tree via drag and drop. Their order in the tree is reflected in the Organizer View.

## The Editor

When a text resource is selected, the Work Area renders a rich-text editor.

### Editor features

- Inline formatting: bold, italic, underline, and more via the toolbar or keyboard shortcuts.
- Full undo/redo history is kept per-session (cleared on reload).
- Word count, character count, and paragraph count are shown in the footer.
- Switching away without saving a manually edited earlier revision prompts a discard/save dialog.

### Views

Writing is only one part of the process: a lot of us also want views that help us visualize our work from a higher level. GetWrite include four views for various focuses intended to give writers a better view.

#### Organizer

The Organizer View presents the contents of a selected folder as cards arranged left-to-right, top-to-bottom, matching the Resource Tree order.

##### Card content

- Text files show a trimmed preview of their content.
- Image files show a thumbnail.
- Audio files show an inline player.
- Toggle the card body between its default content and the resource's notes using the button in the view header.

##### Filtering

Filter cards by metadata using the filter controls at the top of the Organizer View.

Mixed-content folders (for example, text and images together) switch to Organizer View automatically when selected.

#### Data

The Data view shows users a high level breakdown of their project such as: how many files it contains, its word count, and a list of files the user has recently edited.

#### Diff

The Diff view allows users to compare different versions of their work, showing exactly what has been added, removed, or modified between revisions.

#### Timeline

The Timeline view presents users with a visual timeline of the files they've added Date/Time and Duration to. Users can zoom in and out to see where their work spans minutes to decades, making epic sagas and biographies a matter of keeping the dates tidy.

### Search

Users can search their resources by name for quick navigation with `command+k`.

## Metadata

### Metadata Sidebar

The right side of the Work Area holds a collapsible sidebar for metadata related to the file the user is working with. All files can include the following Metadata:

- Notes: Freeform, general text notes.
- Status: The state of the file, according to the user's personal workflow. This can be defined by the user and defaults to 'Draft', 'In Progress', and 'Published'.
- Date/Time/Duration: Users can define dates, times, and durations of files (such as with scenes in a story), enabling a timeline.
- Custom Medata: Users are able to associated files with another via Metadata Providers, explained below.

### Metadata Providers

Folders can be Metadata Providers (such as Characters, Locations, Items, etc), allowing users to create links between documents and gain a better understanding of the web of entities in their works.

### Compiling Projects

Users can compile projects, either from the start screen or within the projects themselves.
