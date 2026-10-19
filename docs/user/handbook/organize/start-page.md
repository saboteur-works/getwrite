---
title: Start Page
order: 20
summary: The first page of GetWrite, where you create, open, rename, delete, compile and import projects.
---

# Start Page

The Start Page is the first thing you see when you open GetWrite.

## Your projects at a glance

Every project you've created is listed here, along with running totals of how many projects, resources, and folders you've made.

## Projects that cannot be opened

A project whose `project.json` file cannot be used is listed as a card labelled "PROJECT · CANNOT BE OPENED" instead of being left out. The card is headed by the project's folder name (the folder names are UUIDs, so the heading is a UUID), gives a reason, and has no **Open** button. This is not in a release yet (merged after 2.2.0).

In a web run with three such projects beside one healthy one, the page showed the healthy project's card with its **Open project** button and three cannot-be-opened cards; the header tile read "1 active project". Opening the healthy project worked. The reasons observed, each followed by "The project's files are still on disk and unchanged.":

- A `project.json` that was not valid JSON: "Its project.json file is not valid JSON, so it cannot be opened."
- A `project.json` with `name` set to a number: "Its project.json file does not match the format GetWrite expects, so it cannot be opened."
- A `project.json` with its `id` key deleted: "Its project.json file is missing its id or creation date, so it cannot be opened."

The card also has two further reasons in its text, neither seen in the app. For a `project.json` that exists but cannot be read, the text is "Its project.json file exists but could not be read, so it cannot be opened." (reason `manifest-unreadable`); no such file was made in the run. For a project whose folders or resources cannot be read, the text is "Its folders or resources could not be read, so it cannot be opened." (reason `tree-unreadable`); no code in this build produces that reason, so it was not seen. Neither of these two texts adds the "files are still on disk and unchanged" sentence.

Not tried: a bad `folder.json` or resource file inside an otherwise healthy project. The card wording is working copy.

## Working with projects

From the Start Page you can act on a project without opening it first:

- **Create** a new project: select **Start a New Project**, give it a name and choose a [project type](project-types.md). The new project opens straight away.
- **Open** a project to start writing.
- **Rename** a project: open its **Manage** menu and choose **Rename**.
- **Delete** a project you no longer need: open its **Manage** menu, choose **Delete**, and confirm. The confirmation says the project and its resources are permanently removed.
- **Compile** a project into a single output: open its **Manage** menu and choose **Package**. See [Compiling Projects](../protect-and-finish/compiling.md).
- **Import** a Scrivener 3 project (created on a Mac) as a new GetWrite project — desktop app only. Choose the `.scriv` project, name the new project, and GetWrite carries over its folders and documents, then shows a report of anything it couldn't convert.
- **Import Word Document** — desktop app only. Choose a single `.docx` file or a folder of them, name the new project, and GetWrite converts the text (splitting a single file into one resource per heading, by default), then shows a report of anything it couldn't convert.
- **App Settings** — opens a standalone settings dialog that isn't tied to any one project and needs no login or account. It manages a list of global noise words: words "flagged as noise in every project". After a word was added there, an entity named with that word showed the noise-word note in a project (see [Entities View](../views/entity-roster.md)).
  Not yet in a release (merged after 2.2.0).

## Warnings and limits

- After you confirm **Delete**, the project's card was still listed two seconds later; it was gone after a reload.
- The **Package** dialog opened from the Start Page listed one of two resources in a test project; the resource at the project's root was missing from the list. The **Compile Project** dialog opened from inside the same project listed both.
- In the desktop app run unpackaged (Electron dev run), adding a word in **App Settings** showed "Could not save the noise-word list." and the list stayed empty. This was not observed in the web build, and a packaged build was not run. A later change (unreleased) makes the desktop noise-word handlers use the app's user-data folder in both builds; in the unpackaged desktop app, adding a word then succeeded, was listed, and was still listed after restarting the app. A packaged build was not re-checked for this.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit b9ddb83c.
