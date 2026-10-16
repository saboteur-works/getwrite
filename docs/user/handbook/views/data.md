---
title: Data View
order: 130
summary: A project dashboard with resource and word totals, a table of resources by status, and a list of resources.
---

# Data View

The Data View is a dashboard for a project. Its heading reads "<project name> Overview", and it shows:

- **Resources** — how many resources the project contains. Text documents and images were counted; a folder was not.
- **Total words** — the words across the project's text documents (695 for documents of 600, 50, 40 and 5 words).
- A **Resources** list of the project's resources, each with its kind, word count and "Updated … ago". The list is sorted by last edit, newest first; the **Last edited** and **Name** buttons switch the sort. Resources of 50 words or fewer are listed first under **Needs content**, then the rest (a 50-word document was under **Needs content**, a 51-word one was not).

## By status

Not yet in a release (merged after 2.2.0).

The **By status** section shows how your text resources are spread across the project's statuses. It is a table with three columns: **Status**, **Resources** and **Words**. Each row means: this many text resources currently have this status, holding this many words between them (in a test, two documents of 50 and 40 words gave "Draft | 2 | 90").

- Rows appear in the order of the project's status list, including statuses no resource uses yet (shown as 0). Reordering the list changed the rows' order.
- A status a resource carries that is no longer in the project's list gets its own row, labeled "<value> (not in the current list)", after the configured statuses.
- Resources that have not been given a status are counted in the final **No status** row.
- If the project has no statuses configured, the section says: "No statuses are configured for this project, so every resource shows under No status."
- A project with no text resources shows "No text resources yet." instead of the table.

Only text resources are counted, across the whole project. The section says so: "Text resources only, across the whole project. Not affected by the selected smart folder." Selecting a smart folder left the By status table unchanged; the **Resources** and **Total words** figures at the top did follow the smart folder (2 resources and 90 words for a smart folder matching two documents).

The section also says: "Word counts for some older resources may read low."

## Warnings and limits

- In the runs this page was verified from, after choosing a **Status** on a resource in a test project, the By status table showed 0 words for that resource (the resource's word count in its metadata file was 0); after a reload it showed 10, the number of words in the document. A later change (unreleased) stops the Status choice from storing that 0; this is shown by tests and has not been re-checked in the running app.
- The sidebar shows "Draft" for a resource that was never given a status; the By status table counted such resources under **No status**.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
