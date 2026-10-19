---
title: Project Configuration
order: 220
summary: The project.json file in each project's folder, the keys it holds and the defaults a new project starts with.
---

# Project Configuration (user)

This guide explains how to configure a GetWrite project by editing the `project.json` file in the project's folder.

Where to find it

- Each project is a folder that holds `project.json` next to a `folders` folder and a `resources` folder. In a test the folder was named with a generated id, not with the project's name. Open the project folder and edit `project.json` with your editor.

Common fields

- `name` (required): The visible name of the project. A name changed in the file showed on the Start Page after the page was reloaded; a `project.json` with no `name` was not listed on the Start Page.
- `description` (optional): A description written into the file stayed there after the project was opened. The Start Page's project card did not show it.
- `config.maxRevisions` (default 50) and `config.autoPrune` (default true): a new Blank project's `project.json` held `"maxRevisions": 50` and `"autoPrune": true` inside `config`. They are stored, but the `getwrite-cli prune` command did not read them: see "Notes and tips". The app did not prune revisions on its own; see [Revisions](revisions.md).
- `config.statuses` (optional): Array of status strings available as options for all resources in the project. A new Blank project held an empty list and the sidebar's **Status** list offered Draft, In review and Published; with `["Outline", "First Draft", "Revised", "Final"]` written in and the project reopened, the **Status** list offered those four.
- `config.subtypes` (optional): Your list of document subtypes (for example Scene or Chapter), in the order you set. Manage it in **Project Settings**, **Metadata** tab, rather than by hand. After Scene, Chapter and Act were added there the list in the file read `["Scene","Chapter","Act"]`, and **Move Scene down** changed it to `["Chapter","Scene","Act"]`, the order the sidebar's **Subtype** list showed.

  Not yet in a release (merged after 2.2.0).

- `config.features` (optional): Per-project toggles for the optional built-in metadata fields and views — `timeline`, `pov`, `synopsis`, `notes`, `timelineView`, `entities`, and `entityHighlighting` (each a boolean). A new project had no `features` key and its sidebar showed no Synopsis, Notes or Timeline field; with only `synopsis: true` written by hand, the sidebar showed Synopsis and nothing else new. The toggles are set in the app: the **Built-in features** section of the Metadata tab (Timeline, Point of View, Synopsis, Notes), the **Enable Timeline view** switch in Project Settings' **Timeline** tab, and the **Entities** and **Entity highlighting** switches in Project Settings' **Entities** tab. Each switch wrote its key into `config.features` straight away. Switching **Enable Timeline view** on with **Timeline** off wrote both `timelineView: true` and `timeline: true`; `timelineView: true` written by hand without `timeline` left `timeline` absent, and the sidebar showed no Timeline fields. The **Entity highlighting** switch was only shown once **Entities** was on; with `entities` false and `entityHighlighting` true written in the file, no entity name was highlighted in the editor (with both on, one was).

  Not yet in a release (merged after 2.2.0).

- `config.organizerCardBody` (optional): What the Organizer view renders beneath each card's title. Choosing **None**, **Text excerpt** or **Status** in Project Settings' **Organizer** tab wrote `{ "source": "none" }`, `{ "source": "text-excerpt", "excerptLength": 200 }` (the length box held 200 and changed it to the number typed, for example 120) and `{ "source": "field", "fieldKey": "status" }`. The **Card body source** list also offered Synopsis, Notes, Point of View, Story Date, Duration (minutes) and Story End Date. With **Text excerpt** and length 40 the card showed the first 40 characters of the text followed by "…"; with **Status** it showed "Published" on a line of its own; with **None** it showed no extra line, the same as with no setting.

  Not yet in a release (merged after 2.2.0).

- `config.dailyWordGoal` (optional): Your daily word goal, a whole number of words (0 or more). Set it in **Project Settings**, **Writing Goals** tab ("Daily word goal", button **Save daily goal**) rather than by hand. A new project had no such key. Saving 500 wrote `500`; 0 was accepted and written as `0`; -5, 1.5 and abc were refused with "Enter a whole number of words, 0 or greater." and the stored value stayed; clearing the field and saving removed the key and showed "Daily goal cleared." It is separate from the total word-count goal: saving one did not change the other. See [Daily writing log](../write/writing-log.md).

  Not yet in a release (merged after 2.2.0).

- `config.wordCountGoal` (optional): A total word-count goal for the whole project, a whole number of words (0 or more). In the app, open **Project Settings**, go to the **Writing Goals** tab, and use the field below "Daily word goal", labeled "Total word-count goal" (button **Save word-count goal**). Leave the field empty and save to clear the goal (the key was removed). It accepted and refused the same values as the daily goal. It is separate from the per-day goal above and from the per-resource goal described next. In the Data view the project goal showed as a "Writing Goal" bar ("48 / 200 words · 24%") whose fill was near-black (rgb 10, 10, 10), not red.

  Not yet in a release (merged after 2.2.0).

- **Per-resource word-count goal** (not a `project.json` field — this one lives on the individual resource, in its metadata file, as `wordCountGoal`): a text resource has an optional word-count goal, set from that resource's own sidebar in a "Word count goal" section (typing 100 in its box stored `100`). Leave the field blank to clear it (the key was removed). With a goal set, a progress bar ("48 / 100 words · 48%") appears in that same section, filled near-black, not red. In the Data view's main area only the project goal's bar appeared (the resource goal's bar was in the sidebar), and the "By status" table listed no goal; the goal tracks only that one resource.

  Not yet in a release (merged after 2.2.0).

- `config.customNoiseWords` (optional): This project's own list of words that are flagged as noise-prone when they appear as an entity's name or alias. Manage it from **Project Settings → Noise Words**: adding "gloom" there wrote `["gloom"]`.
- `config.excludedGlobalNoiseWords` (optional): Specific words from the cross-project global noise-word list (managed in the standalone **App Settings** dialog, not Project Settings) that this project opts out of flagging. With "mirth" on the global list, the project's **Noise Words** tab listed it with a checkbox labelled "Excluded in this project"; ticking it wrote `["mirth"]` and unticking it wrote `[]`. See [Entities View](../views/entity-roster.md) for how a flagged name/alias is shown and dismissed.

  Not yet in a release (merged after 2.2.0).

Example with custom statuses (fields merged into the `project.json` of an existing project):

```json
{
  "name": "My Novel",
  "maxRevisions": 100,
  "config": { "statuses": ["Outline", "First Draft", "Revised", "Final"] }
}
```

With these values merged in, the project reopened with the four statuses; `maxRevisions` stayed at the top level of the file and `config.maxRevisions` stayed 50.

A `project.json` the Start Page lists needs more than a name. A folder holding only `{ "name": "My Novel Minimal", "maxRevisions": 50 }` was not listed, and neither was one that added an `id`. This one was listed, with the folder name not required to match the `id`:

```json
{
  "id": "bbbbbbbb-0000-4000-8000-000000000003",
  "name": "My Novel Minimal",
  "createdAt": "2026-10-14T10:00:00.000Z",
  "maxRevisions": 50
}
```

Another example, merged into an existing project:

```json
{
  "name": "Novel Draft",
  "description": "Work-in-progress novel",
  "maxRevisions": 200,
  "autoPrune": true
}
```

After the project was reopened, `name` and `description` were kept, `maxRevisions` 200 and `autoPrune` true stayed at the top level of the file, and `config.maxRevisions` (50) and `config.autoPrune` (true) were unchanged.

Notes and tips

- After changing `project.json` with the project open, the project's name in the header had not changed 2.5 seconds later. After reloading the page and opening the project again, the Start Page and the header showed the change.
- Changing a maxRevisions value in `project.json` did not change how many revisions `prune` kept. A document with 53 revisions went to 50 with `getwrite-cli prune <project>` whether the project was unmodified, had `config.maxRevisions` 3, had `config.maxRevisions` 3 and `config.autoPrune` false, or had top-level `maxRevisions` 3 and `autoPrune` false; `getwrite-cli prune <project> --max 5` left 5. `getwrite-cli prune --help` gave the `--max` option's default as 50. Use `getwrite-cli prune --max <n>` (see [Revisions](revisions.md)).
- A project whose `project.json` held a wrong-typed value in `config` (`"statuses": "oops"`, `"maxRevisions": "abc"` or `"features": { "timeline": "yes" }`) made the Start Page show no projects at all, the valid ones too, with the message "Some data couldn't be loaded correctly."; the browser's console named `projects.list: response failed validation`. A top-level `"maxRevisions": "abc"` had no such effect. Restoring the file brought the projects back. The web server's log held no line about it.

Advanced

- **Tags**: Project-scoped tags are kept in `config.tags` (a list of objects with an `id` and a `name`) and `config.tagAssignments` (resource id to a list of tag ids), and are managed through the Tags UI in the app. Creating "flashback" in **Manage Tags** wrote it to `config.tags`; switching it on for a document in the sidebar wrote the document's id and the tag's id to `config.tagAssignments`. A tag added to `config.tags` by hand appeared in **Manage Tags** after the project was reopened.

Help

- For CLI or scripting, treat `project.json` as a plain JSON file. `jq` (version 1.8.1 in the test) changed `name` and `config.statuses` in a project's `project.json`, and after a reload and reopening the project showed both changes.

## Warnings and limits

- A `project.json` with a wrong-typed value in `config` makes that project a "cannot be opened" card on the Start Page; the other projects still list and open (see [Start Page](../organize/start-page.md)).
- A `project.json` with `timelineView: true` written by hand without `timeline` did not switch the Timeline fields on; the app's switch wrote both.
- The Start Page's project card did not show a `description`.
- `maxRevisions` and `autoPrune` appear inside `config` in a new project; the same names at the top level of the file were kept but had no effect on `prune`.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit a07e14cc.
