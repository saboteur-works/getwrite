---
title: Project Configuration
order: 220
summary: The project.json file in each project's folder, the keys it holds and the defaults a new project starts with.
---

# Project Configuration

Each project keeps its settings in a file called `project.json`. Most of them can be changed in **Project Settings**, and that is the safer way to change them. This page is for writers who want to read or edit the file in a text editor, or change it with a script.

## Find and edit the file

Each project is a folder with a generated name made of letters and numbers, not the project's name. It holds `project.json`, a `folders` folder and a `resources` folder. Open `project.json` in any text editor. It is plain JSON, so tools such as `jq` can change it too.

GetWrite reads the file when you open the project. In the browser, a change you make while the project is open shows after you reload the page and open the project again.

## Keys at the top level

- `name`: the project's name, shown on the Start Page and at the top of the window. It is required.
- `description`: a description you can add. GetWrite keeps it, but the Start Page doesn't show it.

## Keys inside `config`

- `statuses`: the choices in the sidebar's **Status** list, in the order given. For example, `["Outline", "First Draft", "Revised", "Final"]` gives those four choices.
- `subtypes`: your document subtypes, such as Scene or Chapter, in the order you set. Manage them in **Project Settings**, **Metadata** tab, where you can add them and move them up and down. The sidebar's **Subtype** list uses the same order.
- `features`: switches for the optional sidebar fields and views: `timeline`, `pov`, `synopsis`, `notes`, `timelineView`, `entities` and `entityHighlighting`, each `true` or `false`. A new project has no `features` key, so the optional fields are off. Each switch in the app saves its key straight away:
  - **Project Settings**, **Metadata** tab: Timeline, Point of View, Synopsis and Notes.
  - **Timeline** tab: **Enable Timeline view**. Switching it on also switches the Timeline fields on.
  - **Entities** tab: **Entities**, then **Entity highlighting**, which appears once **Entities** is on. Highlighting works only while `entities` is `true`.
- `organizerCardBody`: what each card in the Organizer shows under its title. Set it in **Project Settings**, **Organizer** tab, under **Card body source**. Choose **None**, **Text excerpt** or a field such as **Status** or **Synopsis**. A text excerpt is 200 characters long unless you set another length.
- `organizerArrangements`: the named layouts you saved in the Organizer, each with a name, a source, a choice for the rows and a choice for the columns. You make them in the Organizer, with **Arrangements** and **Save current…**, and a project holds up to 50. The key is not there until you save one. Edit it by hand with care: a layout with a mistake in it is listed as unavailable, not applied. See [Organizer View](../views/organizer.md#save-an-arrangement).
- `dailyWordGoal`: your daily word goal, a whole number of 0 or more. Set it in **Project Settings**, **Writing Goals** tab, under **Daily word goal**. See [Daily writing log](../write/writing-log.md). Sources do not count toward it unless the goal filter selects them.
- `wordCountGoal`: a word goal for the whole project, a whole number of 0 or more. Set it on the same tab, under **Total word-count goal**. The Data view shows your progress towards it. Sources do not count toward it unless the goal filter selects them.
- `compileDefaults` and `exportDefaults`: the documents the **Compile Project** and **Export** dialogs leave unticked when they open, each stored as `excludedResourceIds`, a list of document IDs. Save and clear them from the dialogs with **Save as default** and **Clear default**. Creating a Source adds its ID to `compileDefaults`, so it starts left out of compile. See [Compiling Projects](compiling.md#sources-in-compile-and-export).
- `customNoiseWords`: this project's own noise words, the words flagged when an entity's name or alias uses them. Manage them in **Project Settings**, **Noise Words** tab.
- `excludedGlobalNoiseWords`: words from your global noise-word list that this project leaves out. You manage the global list in **App Settings**, from the gear menu. Then, in this project's **Noise Words** tab, tick **Excluded in this project** beside a word. See [Entities View](../views/entity-roster.md).
- `tags` and `tagAssignments`: the project's tags, and which documents have them. Manage tags in **Project Settings**, **Manage Tags** tab, and give them to documents in the sidebar. A tag you add to `tags` by hand appears in **Manage Tags** after you open the project again.
- `maxRevisions` and `autoPrune`: a new project has these set to 50 and `true`, but they have no effect. GetWrite doesn't remove old revisions on its own, and the `getwrite-cli prune` command ignores these values. See [Revisions](revisions.md).

A goal for a single document isn't in `project.json`. Set it in that document's sidebar, under **Word count goal**.

## Make a project by hand

A project folder you make yourself shows on the Start Page if its `project.json` has at least an `id`, a `name` and a `createdAt` date. The folder's name doesn't have to match the `id`.

```json
{
  "id": "bbbbbbbb-0000-4000-8000-000000000003",
  "name": "My Novel Minimal",
  "createdAt": "2026-10-14T10:00:00.000Z",
  "maxRevisions": 50
}
```

## Good to know

- If a value inside `config` has the wrong type, such as `"statuses": "oops"`, the Start Page shows that project as a card that can't be opened. Your other projects still appear as usual. Correct the value in `project.json`, and the project appears as usual again. See [Start Page](../organize/start-page.md).
- A `project.json` with no `name` also shows as a card that can't be opened. The card says that the project's files are still on disk and unchanged.
- Writing `"timelineView": true` by hand doesn't switch the Timeline fields on. Use **Enable Timeline view** in the **Timeline** tab, which switches on both.

## Coming in the next release

- A new Blank project has no statuses. Add them in **Project Settings**, **Metadata** tab, under **Statuses**, where you can also remove them and change their order. They are saved in `config.statuses`.
- The sidebar's **Status** list starts with **No status**, followed by your statuses. A document has a status only once you choose one, and choosing **No status** removes it.
- With no statuses set, the sidebar says "No statuses yet. Add them in Project Settings, Metadata tab."
