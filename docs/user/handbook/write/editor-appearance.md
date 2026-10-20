---
title: Editor Appearance
order: 80
summary: What sets the look of the writing surface and the body text and heading settings you can change in a project.
---

# Editor Appearance

This guide covers what controls the look of the writing surface and what you can change yourself.

## What you can change

**Heading styles** are set in the **Editor** tab of **Project Settings** (gear menu), in the **Heading Styles** section: the size, font, weight, letter spacing and color of each heading level, per project. See [Headings](headings.md) for details.

**Body text** is set in the same tab, in the **Body Text Styles** section. It has **Font Family**, **Font Size**, **Line Height** and **Paragraph Spacing** fields and a **Save Changes** button. Saving 20px, Lato and a 30px paragraph spacing changed the paragraphs to 20px Lato with a 30px gap between them, and the values were the same after a reload.

Not yet in a release (merged after 2.2.0).

The editor toolbar also has a **Line Height** field. A paragraph's line height is unset until you set one from this field; an unset paragraph follows the project's body line height. The field shows the value in effect: the paragraph's own line height if it has one, otherwise the project's body line height (1.8 if the project sets none). It accepts any number greater than 0, with no 1.8 minimum; text that is empty, not a number, zero or negative is refused with "Line height must be a number greater than 0." and the paragraph is left as it was. The message stays under the field, and when you leave the field the box goes back to showing the value in effect rather than the refused text.

## Body text defaults

A new Blank project's body text:

- **Typeface:** IBM Plex Serif
- **Font size:** 15px
- **Line height:** 1.8. Paragraphs have no line height of their own, so they follow this value, and the toolbar's Line Height field shows it.
- **Paragraph spacing:** a 16px gap between paragraphs

A project type's template sets the body text when a project is created (checked by creating a project from a custom template file with the command-line tool). A template with Lato, 18px and a 40px paragraph spacing gave a project with 18px Lato and a 40px gap; a template line height of 2.4 was stored (before this change the paragraphs still rendered at 1.5; paragraphs now follow the body line height).

Text color follows the light or dark theme: paragraph text read rgb(26, 25, 22) in the light theme and rgb(245, 244, 240) after switching to dark.

## Warnings and limits

- The **Body Text Styles** line height must be a plain number of at least 1.8 (no upper limit), or empty to use 1.8. Anything lower, or a value such as `normal`, a percentage, or one with `em` or `px`, is refused with "Line height must be a number of at least 1.8."; the value you typed stays in the field, the message is announced as an alert, and nothing is saved. The value is refused, not rounded up.
- A paragraph with a line height of its own keeps it when the body line height changes. A stored paragraph line height of "1.5" (what older versions stamped on every paragraph) is read as unset, so those paragraphs now follow the body line height.
- Saving **Body Text Styles** after saving **Heading Styles** left project.json with an empty `headings` set (two runs); see [Headings](headings.md).

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 0343e19a. The line height behaviour above (Feature 90) was read from the code in `paragraph-leading.ts`, `editor-body-settings.ts` and `BodySettingsModal.tsx`. In a packaged build (Task 39 record in experiments.md), Body Text Styles refused "1.2" and "0" with the alert and saved nothing, and the toolbar Line Height field, after "0" was refused and the field was left (blur and Tab), showed 1.8 again with the message still shown and the paragraphs unchanged. The rest was not re-measured.
