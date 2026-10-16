---
title: Metadata Queries & Smart Folders
order: 110
summary: Build queries over a project's metadata with filter chips and save them as smart folders.
---

# Metadata Queries & Smart Folders

Your documents carry structured information — point-of-view, status, story dates, word counts, custom fields, and more (see [Metadata](metadata.md)). **Metadata queries** let you ask questions of that information: _show me every scene from Mara's POV under 500 words._ Save a query and it becomes a **smart folder**, listed under Smart folders in the sidebar; click it to run the query and see what currently matches.

## Metadata queries vs. search

GetWrite has two ways to find things:

- **[Search](../write/search.md)** (`Cmd+K` on the Mac, where it was run) is for quickly jumping to a document when you know roughly what it's called.
- **Metadata queries** are for filtering your project by what documents _are_ — their status, POV, dates, length, and relationships — and for saving those filters to reuse.

## Building a query

Smart folders live in the **Smart folders** section of the sidebar, below the resource tree. Click the **+** there to start a new query and open the query builder, which appears above the Data view: a group set to **All of** or **Any of**, one empty chip `FIELD…`, and the buttons **+ Add condition**, **+ Add group** and **Save query**.

You build a query from **filter chips**. Each chip is one condition and reads left to right:

> **Status** **is** **Draft**

To add a condition, add a chip and choose:

1. **A field** — what to filter on: the field button opens a list with a **Search fields…** box (see [Queryable fields](#queryable-fields) below).
2. **An operator** — how to compare it; the choices adapt to the field (see [Operators](#operators-by-field-type)).
3. **A value** — what to compare against. The control depends on the field and operator: a text box, a number box, a date box (two for **is between**; **in the last** takes an amount and a unit of days, weeks or months), a list of the field's allowed values, a multi-select list, or a search box that suggests resources. The Yes/No operators **is true** and **is false** have no value control.

While you build a query, the list below the builder still showed every resource; the results appear when you save the query and open it as a smart folder.

### Combining conditions with AND / OR

Chips sit in groups. Each group has a select set to **All of** (every condition must match, AND) or **Any of** (at least one must match, OR), and a pill between groups reads **AND** and switches to **OR** when clicked. Two levels are available — chips in groups, and groups joined together; **+ Add group** was the only control for nesting. That is enough to express filters like:

> POV **is** Mara **AND** ( Status **is** Draft **OR** Status **is** In review )

Built this way, the query returned the two scenes with POV Mara and status Draft or In review, and not a scene with POV Elena.

## Queryable fields

The field list holds your metadata fields and some built-in attributes.

**Your metadata fields** — Synopsis, Notes, Status, Point of View, Story Date, Duration (minutes) and Story End Date, and any [custom fields](metadata.md) you've added. The built-in fields are listed even where they are switched off in the project.

**Built-in document attributes** — properties every resource has:

| Field               | What it filters on                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **Type**            | Whether the resource is text, image, audio, or a folder (the value list holds those four). |
| **Folder**          | Which folder the resource lives in (the value box suggests folders).                       |
| **Word Count**      | Length of a text document, in words.                                                       |
| **Character Count** | Length of a text document, in characters.                                                  |
| **Created At**      | When the resource was created.                                                             |
| **Updated At**      | When the resource was last changed; a resource that was never edited has no date here.     |
| **Statuses**        | A field separate from the sidebar's Status; see Warnings and limits.                       |
| **Tags**            | A field for tags; see Warnings and limits.                                                 |
| **Linked From**     | Other resources that link _to_ this one.                                                   |
| **Links To**        | Resources this one links _to_.                                                             |

`Linked From` and `Links To` let you follow the links in your project. A link here is a `[[Title]]` link in a document's text or a reference to another resource in a field: with `Scene D` containing `[[Scene A]]`, **Linked From includes Scene D** returned Scene A and **Links To includes Scene A** returned Scene D; **Links To includes Mara** returned a scene whose only link to Mara was its POV field.

## Operators by field type

Different field types offer different operators. Every field's list also includes **is empty** and **has any value**, which are the way to queries like _scenes without a POV_ or _resources missing a status_.

| Field type                                                      | Operators                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Text** (e.g. Notes, Synopsis)                                 | is · is not · contains · does not contain · starts with · matches regex · is empty · has any value                          |
| **Number** (e.g. Word Count)                                    | equals · does not equal · is less than · is at most · is greater than · is at least · is between · is empty · has any value |
| **Date** (e.g. Story Date, Created At)                          | is on · is before · is after · is between · in the last · is empty · has any value                                          |
| **Yes/No**                                                      | is true · is false · is empty · has any value                                                                               |
| **Single choice / single reference** (e.g. Status, POV)         | is · is not · is any of · is none of · is empty · has any value                                                             |
| **Multiple choice / multiple references** (e.g. Tags, Statuses) | includes · does not include · includes all of · includes any of · includes none of · is empty · has any value               |

## Saving as a smart folder

Once a query does what you want, select **Save query**, give it a name and save it. It then appears as a **smart folder** in the sidebar, marked with a search icon.

Click a smart folder any time to run it and see what currently matches. The list is not refreshed by itself: after a resource was changed so that it stopped matching a smart folder called _Needs a POV_, the open list still showed it until the folder was clicked again.

Hover a smart folder to **edit** it (refine the query) or **delete** it. Editing opens the query builder pre-filled with the saved conditions. Delete removes the smart folder at once, with no confirmation.

## Advanced mode

A query whose logic goes beyond the two levels of grouping the chip builder supports opens with the banner "Query uses advanced nesting — chip editing is disabled" and a button **Edit in advanced mode** (the builder had no way to make such a query; one was written into the project's `meta/queries` folder by hand to run this). In advanced mode you edit the query directly as JSON (its underlying structure) in a text box, with the buttons **Back to chip view** and **Cancel**. **Back to chip view** refused while the JSON was still nested beyond two levels ("Query uses nesting beyond two levels — edit it to use only simple conditions before restoring chip view."); after the JSON was replaced with a two-level query it showed that query as three chips in two groups.

## Examples

A few questions you can answer with a saved smart folder:

- **Find a specific set of scenes** — _POV is Mara_ AND _Word Count is less than 500_ returned the one Mara scene of 50 words and not the one of 600.
- **Story-time slice** — _Story Date is between_ two in-story dates (two date boxes, **From date** and **To date**) returned the scenes dated inside the range and not one dated after it. Pairs with the [Timeline view](../views/timeline.md).
- **Quality control** — _Status is empty_ to catch documents with no stored status, or _POV is empty_ to find resources with no point of view set.
- **Staleness** — _Updated At is before_ a given date: with a date far in the future it returned every edited resource, with a date before the project existed none.
- **Co-occurrence** — a custom multi-value field with _includes all of_ two values: see Warnings and limits for what it returned.

## Warnings and limits

- **includes all of** returned the same scenes as **includes any of**: with one scene holding Alpha and Beta, one holding only Alpha and one holding only Beta, **includes all of Alpha, Beta** returned all three scenes, not just the one holding both. A later change (unreleased) makes **includes all of** return only the scene holding every listed value, and a saved folder that stored the old shape is read that way without being rewritten (it reopens as **includes all of**); re-checked on the web app (a standalone build of the unreleased branch, 2026-10-16): **includes all of Alpha, Beta** returned only the scene holding both, **includes any of** returned all three, and the saved folder reopened as **includes all of**.
- The date operators **is on** and **in the last** returned no resources in the cases tried: **Created At in the last** 1 day, 7 days, 1 week and 1 month, and **Updated At in the last** 1 day, for resources created or edited minutes earlier, and **Created At is on** the creation date. **is before** and **is after** returned the expected resources. A later change (unreleased) works **in the last** out when the folder is opened, as a rolling span (a day is 24 hours, a week 7 days, a month a calendar month), and makes **is on** on Created At and Updated At match by calendar day in the time zone of the machine running the query (a hosted server, or a device in another zone, uses the server's day; custom date fields are unchanged); a saved **in the last** reopens as **in the last**, and choosing **in the last** saves the 7 days it displays. re-checked on the web app (a standalone build of the unreleased branch, 2026-10-16): **Created At in the last** 1 day, 7 days, 1 week and 1 month and **Updated At in the last** 1 day returned the resources created or edited minutes earlier, **Created At is on** today returned all of them, a saved 7-days folder reopened as **in the last** 7 days, and an untouched **in the last** chip saved 7 days. Not re-checked: the time-zone limit (server and browser were on one machine).
- A later change (unreleased) also makes **is before**, **is after** and **is between** on Created At and Updated At compare by calendar day in that same zone: **is after** a date leaves out that date, **is before** a date includes 23:59 the day before, and **is between** includes both end dates. A saved folder using these operators on those two fields can return different resources at day boundaries than it did. Re-checked on the web app (same build) with resources created today: **Created At is after** today returned nothing, **is before** today returned nothing, **is before** tomorrow returned all. Not re-checked in the app: **is between**, and resources just either side of local midnight (unit tests only).
- **starts with** was saved as a pattern that was not anchored to the start (the stored query uses the regex operator). A later change (unreleased) makes it match only the beginning of the text, ignoring case, with the typed text taken literally rather than as a pattern; it reopens as **starts with**. A folder saved before the change keeps its old pattern and is not rewritten, and **matches regex** is unchanged. Re-checked on the web app (same build): over "Alpha one", "the alpha" and "ALPHA.x", **starts with** alpha returned the first and last, and **starts with** alpha. returned only the last (the dot taken literally); it was saved as a regex match for ^alpha marked case-insensitive and reopened as **starts with**.
- A smart folder's list is not refreshed when a resource changes; click the folder again (see above).
- The **Tags** chip has a search box that suggests resources, not tags: typing the name of an existing tag offered nothing, and a tag could not be chosen; a query on a tag could not be built this way. A later change (unreleased) makes the value box for **includes** and **does not include** on Tags offer the project's tags. The operators **includes any of**, **includes all of** and **includes none of** on Tags still take a plain text **Values** box. Pressing Enter in the value box commits nothing (from the code and tests; not re-checked in the app). Re-checked on the web app (same build): the value box suggested the tag "flashback" for "flash" and nothing for resource names, **includes** flashback returned the two tagged scenes and saved the tag's id and name, and **includes any of** showed a plain **Values** text box.
- **Statuses includes Draft** returned no resources while **Status is Draft** returned the two with that status in the sidebar. They are separate fields. This is unchanged by the later change below: the **Statuses** field still reads only the statuses configured for the project.
- In a new Blank project the **Status** chip's value list was empty, although the sidebar offers Draft, In review and Published; the list showed those values once the project's `config.statuses` held them. A later change (unreleased) makes the Status chip, the sidebar Status control and the Organizer's status filter read one list: the project's configured statuses, or Draft, In review and Published when none are configured. That list is only read, never written to the project's configuration. Re-checked on the web app (same build) in a new Blank project: the Status chip and the sidebar Status control both offered Draft, In review and Published, the **Statuses** chip still offered only "select…", and `config.statuses` stayed empty. The Organizer part was not re-checked in the app (its tab was disabled with no folder selected; unit tests only).
- A resource whose sidebar Status shows Draft but was never changed has no stored status, and **Status is empty** matched such resources.
- A reference chip (for example Point of View) whose typed name matches no suggestion was saved as plain text: in a unit-level check **is** then returned nothing and **is not** returned everything. This was kept as a known failure and is not fixed; whether the app lets you reach this state was not measured.
- Delete on a smart folder asks for no confirmation.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 78c47ac6.
