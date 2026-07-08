# Headings

The editor supports up to six heading levels, and you can customize how each one looks per project.

## Using headings

By default three heading levels (H1–H3) are available; you can enable up to six (H1–H6). Apply a heading to the current line using the heading buttons in the editor's menu bar.

## Customizing heading styles

Open **Project Settings** from the gear menu in the app shell, then select the **Heading Styles** tab. Heading styles are saved per project and take effect in the editor immediately after saving.

For each heading level you can set:

- **Font Size** — the size of the heading, in pixels.
- **Font Family** — the typeface (any font available to the app).
- **Font Weight** — Normal or Bold.
- **Letter Spacing** — spacing between letters, in `em`.
- **Color** — a custom heading color, chosen with the color picker (click the pipette icon).

H1–H3 are always available. H4–H6 can be added when you need them and removed when you don't.

Changes are staged in the modal as you edit — nothing is applied until you click **Save**. Clicking **Cancel** discards everything you changed in that session.

> A note on color: setting a custom heading color overrides the theme's default text color, so that heading won't follow light/dark mode switching. Use it for intentional accent headings (like brand-colored chapter titles), not for the normal text color.

> Developer reference (config keys, the editor-config API, attribute types): [docs/features/editor/headings.md](../../features/editor/headings.md).
