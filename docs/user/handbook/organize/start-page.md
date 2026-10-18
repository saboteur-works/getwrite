---
title: Start Page
order: 20
summary: The first page of GetWrite, where you create, open, rename, delete, compile and import projects.
---

# Start Page

The Start Page is the first thing you see when you open GetWrite.

## Your projects at a glance

Every project you've created is listed here, along with running totals of how many projects, resources, and folders you've made.

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
