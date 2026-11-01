---
title: Editor Appearance
order: 80
summary: What sets the look of the writing surface and the body text and heading settings you can change in a project.
---

# Editor Appearance

You can change how a project's text looks in **Project Settings**, and adjust single paragraphs from the editor's toolbar.

## Change your body text

Open **Project Settings** from the settings menu (the gear icon), select the **Editor** tab, and find **Body Text Styles**. It has these fields:

- **Font Family**: the same list as for headings. See [Choose a font](headings.md#choose-a-font).
- **Font Size**
- **Line Height**: a plain number of at least 1.8. Leave it empty to use 1.8.
- **Paragraph Spacing**: the gap between paragraphs, with its unit, such as `30px` or `2em`.

Select **Save Changes** to apply them.

If **Line Height** is below 1.8 or isn't a plain number, GetWrite says "Line height must be a number of at least 1.8." and saves nothing. What you typed stays in the field so you can correct it. Nothing is saved while a typed font name is refused, either.

**Heading Styles** is in the same tab. See [Headings](headings.md).

## Use the toolbar

The toolbar's font control lists the same fonts, without **Other...**. To use a font that isn't in the list, set it in **Project Settings**.

The font control and the font size field show the font and size of the text where your cursor is, so inside a heading they show the heading's style.

The toolbar's **Line Height** field changes one paragraph. It accepts any number greater than 0, so it can go below 1.8. Anything else brings up "Line height must be a number greater than 0." and leaves the paragraph as it was.

A paragraph without its own line height follows the project's. The field shows the value that applies to the paragraph. A paragraph you've set keeps its value when the project's line height changes.

## What a new project starts with

A new Blank project's body text is IBM Plex Serif at 15px, with a line height of 1.8 and a 16px gap between paragraphs.

A [project type](../organize/project-types.md) can set its own body text. A project made from that type starts with those settings.

Text color follows the light or dark theme.

## Good to know

- **Paragraph Spacing** needs a unit. GetWrite doesn't check this field, so a number on its own, such as `30`, removes the gap between paragraphs. Type `30px` instead.
