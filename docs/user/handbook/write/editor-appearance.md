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

The editor toolbar also has a **Line Height** field. It accepted 1.2 and 0.5 and the paragraph's line height changed to match.

## Body text defaults

A new Blank project's body text:

- **Typeface:** IBM Plex Serif
- **Font size:** 15px
- **Line height:** the paragraphs rendered at 1.5, and the toolbar's Line Height field read 1.5. The project's stored body setting reads 1.8.
- **Paragraph spacing:** a 16px gap between paragraphs

A project type's template sets the body text when a project is created (checked by creating a project from a custom template file with the command-line tool). A template with Lato, 18px and a 40px paragraph spacing gave a project with 18px Lato and a 40px gap; a template line height of 2.4 was stored, and the paragraphs rendered at 1.5.

Text color follows the light or dark theme: paragraph text read rgb(26, 25, 22) in the light theme and rgb(245, 244, 240) after switching to dark.

## Warnings and limits

- The **Body Text Styles** line height is stored (1 and 2.2 were saved) but did not change the rendered line height, which stayed at 1.5. The toolbar **Line Height** field did change it, down to 0.5 (10px at 20px).
- Saving **Body Text Styles** after saving **Heading Styles** left project.json with an empty `headings` set (two runs); see [Headings](headings.md).
- The project's stored line height (1.8) and the rendered line height (1.5) differed in a new Blank project. No cause was established.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 0343e19a.
