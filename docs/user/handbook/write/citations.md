---
title: Citations
order: 67
summary: Describe each Source once, then compile a PDF or DOCX with numbered notes and a bibliography built from your citations.
---

# Citations

When you [cite a Source](annotations.md#cite-a-source), GetWrite remembers which passage it supports. With **Citations** switched on, you can also describe each Source once (its author, title, date and so on) and have the compile turn every citation into a numbered note, followed by a bibliography of the Sources you cited.

Citations here are for the file you compile. They don't change your text in the editor.

## Coming in the next release

### Turn Citations on

Citations are off until you switch them on for a project.

1. Open **Project Settings** and choose the **Modules** tab.
2. Select **Enable Citations**.

A **Citation fields** section appears in the sidebar of each Source, and a **Citations** switch appears in the Compile dialog. Clear **Enable Citations** to hide both. Your entries stay stored, and they show again when you switch Citations back on.

Citations work without the **Sources** module being on. A [project type](../organize/project-types.md#start-new-projects-with-modules-on) can start new projects with Citations already on. A project that already exists is never changed by its project type.

### Enter a Source's fields

1. Open the Source and find **Citation fields** in the sidebar.
2. Under **Reference type**, choose **Book**, **Article (journal)**, **Web page** or **Interview**.
3. Fill in the fields. Every field is optional, so you can save a Source before it is complete.
4. Stop typing. The fields save by themselves a moment after your last change, and a message below the fields says **Citation fields saved.** There is no Save button. If a date is not a real date or is later than today, the field says why and nothing is saved until you correct it. If you open another Source while a field is still wrong, that change is not saved. A message names the Source and has a **Dismiss** button. If you close the sidebar or switch Citations off at that moment, no message appears and the change is not saved.

Each type has its own fields.

| Reference type        | Fields                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| **Book**              | Authors, Editors, Title, Edition, Publisher, Place, Date, URL, Accessed |
| **Article (journal)** | Authors, Title, Journal, Volume, Issue, Page range, Date, URL, Accessed |
| **Web page**          | Authors, Title, Website, Publisher, Date, URL, Accessed                 |
| **Interview**         | Interviewee, Interviewer, Title, Medium, Place, Date, URL               |

**Authors**, **Editors**, **Interviewee** and **Interviewer** can hold several people. Choose **Add**, then choose **Person** (a family name and a given name) or **Organisation** (one name). Choose **Remove** to take a row out. A field holds up to 500 characters, and each of these lists up to 50 people.

**Date** and **Accessed** take a year, a year and month, or a full date: `2024`, `2024-05` or `2024-05-17`. The date must be a real date, and it can't be later than today. GetWrite refuses anything else and tells you.

If you change the reference type, the form shows the fields of the new type.

### See what a Source still needs

Below **Reference type**, a line tells you what the bundled style still needs for that type.

- It reads **Still needs:** followed by the missing details, such as "Authors, Date".
- When nothing is missing, it reads **Nothing is missing for this style.**

The line updates as you type, before you save. These are the details the style needs for each type:

| Reference type        | The style needs                 |
| --------------------- | ------------------------------- |
| **Book**              | Authors, Title, Publisher, Date |
| **Article (journal)** | Authors, Title, Journal, Date   |
| **Web page**          | Title, Website, Date, URL       |
| **Interview**         | Interviewee, Interviewer, Date  |

The compile reads what you have saved, so save your changes first.

On Android the section shows "Citation fields can be edited on desktop and web" and has no fields to fill in.

### Compile with citations

Only a PDF or a DOCX can carry citations.

1. Open the **Compile Project** dialog, as described in [Compiling Projects](../protect-and-finish/compiling.md).
2. Under **Compile as**, choose **pdf** or **docx**.
3. Select the **Citations** switch. **Citation style** becomes available and shows **Chicago notes and bibliography, en-US**, the one style GetWrite includes.
4. Choose **Compile (n)**.

If you choose **txt** or **md**, the switch is off and a line below it reads "Citations are available for PDF and DOCX". The same line appears on Android, whatever format you choose. If you compile from the [Start Page](../organize/start-page.md) and GetWrite can't read the project's settings there, the line reads "Open the project to turn on citations". Open the project and compile from inside it.

The switch is not part of the **Compile Entity Resources** dialog.

Only citations in the documents you tick are included. A Source cited in a document you left out is not.

### The check before the compile

When Citations is on, GetWrite checks your citations before it compiles. If every citation is complete, the compile starts. If not, a **Check citations before compiling** dialog opens first. It says how many citations there are and how many Sources are incomplete, for example "5 citations, 2 Sources incomplete", then lists each Source once with its number of citations and the reason:

- **Removed:** the Source is in Trash or has been deleted.
- **Incomplete: missing** followed by the details the style needs, such as "Date". A date that is stored but is not a real date, or is later than today, counts as missing. GetWrite doesn't change the stored date.
- **Could not be checked:** GetWrite couldn't read the Source.

A Source you never filled in is listed as incomplete too.

Choose **Proceed** to compile anyway, or **Cancel** to go back to the Compile dialog without compiling. To fix a Source first, choose **Cancel**, fix it, and compile again.

If the check itself can't run, the dialog says so and offers only **Cancel**.

### What the file contains

Each citation becomes a numbered note that follows the cited passage.

- **In a PDF**, each note is printed at the bottom of the page that holds its number. GetWrite keeps the same amount of space free at the bottom of every page for the notes, so a PDF compiled with citations can run to more pages than the same PDF without them.
- **In a DOCX**, each note is a footnote in the file. The program you open the file in decides which page shows it.

A citation that can't be written in full still appears. It ends with a visible marker, **[citation incomplete: Source name]**, in the same place in a PDF and a DOCX. A Source with no name reads **[citation incomplete: unnamed Source]**. Nothing is skipped, so you can search the file for "citation incomplete" to find every one.

After the last document, the file has a **Bibliography** listing the Sources you cited, each once. With no citations, there is no bibliography and no notes. An interview is cited in its note but isn't listed in the bibliography, and GetWrite doesn't tell you.

If a citation's passage is no longer in its document, the compile fails, makes no file, and shows a **Compile failed** message that says which citation. To fix it, open the document and re-attach the citation to a passage (see [Annotations](annotations.md)), or delete the citation.

### Good to know

- GetWrite includes one style, so a compiled file always has numbered notes and a bibliography.
- Switching **Enable Citations** off doesn't delete or change anything you entered.

## Related

- [Annotations](annotations.md) — Cite a passage of a document to a Source.
- [Resources](../protect-and-finish/resources.md#sources-and-attachments) — Create a Source and add its files.
- [Compiling Projects](../protect-and-finish/compiling.md) — The Compile dialog and its other options.
