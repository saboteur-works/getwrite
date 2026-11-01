---
title: Start Page
order: 20
summary: The first page of GetWrite, where you create, open, rename, delete, compile and import projects.
---

# Start Page

The Start Page is the first thing you see when you open GetWrite. It lists your projects and shows how many projects, resources and folders you have.

## Create a project

1. Select **Start a New Project**.
2. Give the project a name.
3. Choose a [project type](project-types.md), built-in or one you saved.

The new project opens straight away.

## Open, rename, delete or package a project

- **Open** a project with its **Open project** button.
- **Rename** a project: open its **Manage** menu and choose **Rename**.
- **Delete** a project: open its **Manage** menu, choose **Delete**, and confirm. The confirmation says the project and its resources are permanently removed.
- **Package** a project into a single file: open its **Manage** menu and choose **Package**. See [Compiling Projects](../protect-and-finish/compiling.md).

## Import from Scrivener or Word

In the desktop app, **Import Scrivener 3 Project** and **Import Word Document** sit in a row beneath **Start a New Project**. The browser version doesn't have them.

- **Import Scrivener 3 Project** brings in a Scrivener 3 project made on a Mac. Choose the `.scriv` project, name the new project, and select **Start**. GetWrite carries over its folders and documents, then shows a report of anything it couldn't convert.
- **Import Word Document** brings in a single `.docx` file, or a folder of them. Choose the file or folder, name the new project, and select **Start**. By default, GetWrite starts a new document at each Heading 1. You can choose another heading level, or **Don't split**. A report then lists anything it couldn't convert.

## Projects that can't be opened

If a project's `project.json` file is damaged or can't be read, the Start Page still lists the project. It appears as a card labelled **Project · Cannot be opened**, headed by the project's folder name instead of its own name. The card says what is wrong, and it has no **Open project** button. Your other projects still open as usual.

When the file is damaged, the card adds "The project’s files are still on disk and unchanged." GetWrite doesn't change the project's files.

## Change App Settings

Open **App Settings** from the settings menu (the gear icon), just below **User Preferences**. It's there whether or not a project is open. These settings apply to every project on this device, and they need no login or account.

**Global noise words** are words "flagged as noise in every project". If an entity's name is one of these words, the entity shows a note that its name also reads as a common English word. See [Entities View](../views/entity-roster.md).

### Keep GetWrite running after you close its window (Mac)

In the desktop app on a Mac, **App Settings** has a **When the window closes** section with the switch **Keep GetWrite running after its window is closed**.

- When it's off, which is the default, closing the window quits GetWrite.
- When it's on, GetWrite keeps running after you close its window. Click GetWrite's Dock icon to open the window again, or press Cmd+Q to quit.

A change to the switch takes effect the next time you close the window.

## Good to know

- In the browser, a project you delete can stay listed on the Start Page. Reload the page to remove it from the list.
