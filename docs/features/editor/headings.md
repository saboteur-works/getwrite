# Editor: Headings (developer reference)

The text editor supports user-defined heading styles, configurable per project. For the writer-facing guide to customizing headings in the app, see [docs/user/handbook/write/headings.md](../../user/handbook/write/headings.md).

## Heading Levels

By default, three heading levels are available (H1–H3). Up to six levels (H1–H6) can be enabled. H4–H6 are optional and can be added or removed individually.

### Unstyled defaults

H1–H3 defaults come from `DEFAULT_HEADING_CONFIG` (`src/lib/editor-heading-settings.ts`) and are merged into the resolved editor config: H1 40px/700 with 0.01em letter spacing, H2 28px/700, H3 20px/500, all IBM Plex Serif. H4–H6 have no entry there; their unstyled look comes from `styles/editor.css` as a rendering fallback: IBM Plex Serif for all three, H4 17px/500, H5 at the project body size/700, H6 at the project body size/500 with 0.04em letter spacing. Keeping H4–H6 out of `DEFAULT_HEADING_CONFIG` means Heading Styles neither shows nor saves them unless the writer adds them. A stored style for any level is applied inline by `CustomHeading` and overrides the fallback. Before this, unstyled H4–H6 inherited the UI font (IBM Plex Sans) at browser default sizes.

## Configuration

Heading style configuration is stored in each project's `project.json` under `config.editorConfig.headings`.

### Heading Attributes

| Attribute       | Type                  | Required | Example            |
| --------------- | --------------------- | -------- | ------------------ |
| `fontSize`      | Pixel size string     | No       | `"20px"`           |
| `fontFamily`    | Font family name      | No       | `"IBM Plex Serif"` |
| `fontWeight`    | Numeric weight string | No       | `"700"`            |
| `letterSpacing` | Em unit string        | No       | `"0.05em"`         |
| `color`         | Hex color string      | No       | `"#D44040"`        |

All attributes are optional. Empty or whitespace-only values are stripped before persisting. An unset `fontFamily` renders in IBM Plex Serif; see [settings.md](settings.md#fonts) for the font list and defaults.

#### Example

```json
{
  "editorConfig": {
    "headings": {
      "h1": {
        "fontSize": "32px",
        "fontFamily": "IBM Plex Serif",
        "fontWeight": "700"
      },
      "h2": { "fontSize": "24px", "letterSpacing": "0.05em" },
      "h3": { "fontSize": "18px", "color": "#555555" }
    }
  }
}
```

## Heading Level Selection

Headings are selected in the Editor via MenuBar buttons.

## Heading Style Customization

Heading styles are configured through the **Heading Styles** tab of the **Project Settings** dialog (gear menu); changes are project-scoped and take effect immediately. The tab stages edits locally and commits on **Save**. For the full UI walkthrough, see the [user guide](../../user/handbook/write/headings.md). Implementation notes follow.

### API

`POST /api/project/editor-config` accepts `{ projectPath, headings }` and writes the sanitized heading map to `config.editorConfig` in the project's `project.json`. The endpoint returns the updated `editorConfig` on success. `headings` and `body` are each replaced only when the request carries that key; an omitted key leaves the stored value unchanged (Feature 87, `updateEditorConfigCore`; shown by unit tests), while an explicit `headings` value, including `{}`, still replaces it.

Heading styles are also refreshed in Redux state immediately after a successful save so the editor reflects the new config without requiring a page reload.
