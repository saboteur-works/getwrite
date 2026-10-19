---
title: Headings
order: 70
summary: Apply heading levels in the editor and set how each level looks for a project.
---

# Headings

The editor has six heading levels, and you can set how each one looks per project.

## Using headings

The editor's toolbar has buttons **Heading 1** to **Heading 6**. Put the cursor in a line and click one to make that line a heading of that level.

## Customizing heading styles

Open the gear menu in the app shell, choose **Project Settings**, and select the **Editor** tab. The **Heading Styles** section is at the top of that tab, above **Body Text Styles**. Heading styles are saved per project and appear in the editor right after you click **Save Changes**.

Not yet in a release (merged after 2.2.0).

For each heading level you can set:

- **Font Size** — the size of the heading, in pixels.
- **Font Family** — the typeface, typed into a text field that suggests 17 typefaces (Inter, Merriweather, Playfair Display, Lato, Source Serif 4, Playwrite IE, Fascinate Inline, Arial, Courier New, Garamond, Georgia, Helvetica, Palatino, Tahoma, Times New Roman, Trebuchet MS, Verdana).
- **Font Weight** — Use default, Normal or Bold.
- **Letter Spacing** — spacing between letters, in `em`.
- **Color** — a custom heading color, set with the color control next to the pipette button.

The section lists H1 to H3 and an **Add H4** button; **Add H5** and **Add H6** appear in turn. Each added level has a **Remove** button (for example **Remove H4**). H1 to H3 have none.

Changes are staged in the dialog as you edit: the editor does not change until you click **Save Changes**. **Discard changes** puts this section back to what was last saved and leaves Project Settings open; other sections keep their unsaved edits. **Body Text Styles** and **Default Revision Name** have the same button.

A heading with a custom color kept that color when the theme was switched to dark; headings without one changed with the theme.

## Warnings and limits

- In the runs this page was verified from, saving **Body Text Styles** after saving **Heading Styles** left project.json with an empty `headings` set (two runs). In one of them the editor's H1 was 40px again and the dialog read 40 after a reload. A later change (unreleased) makes a Body Text Styles save keep the stored headings; this change was re-checked on the web app with the same steps and the observation no longer occurred; the desktop app was not re-checked.
- **Save Changes** left the dialog open.
- Clicking the pipette button changed nothing visible in the browser used for this check; the color was set through the color control itself.
- An added level with nothing set is not kept when you save; the section says so ("No styles set, so this level is not kept when you save.") until you set a style. After saving with H4 set to 22 and H5 left empty, a reload listed H1 to H4 only.
- The toolbar showed buttons Heading 1 to Heading 6 from the start, whether or not H4 to H6 had been added.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 0343e19a.
