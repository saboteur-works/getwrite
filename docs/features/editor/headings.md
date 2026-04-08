# Editor: Headings

The text editor should support user-defined heading styles.

## Heading Levels

By default, there are 3 available heading styles (H1-H3).

## Configuration

Heading style configuration is stored in each project's `project.json` file in `config`.

### Heading Configuration

| Attribute   | type                               | Required |
| ----------- | ---------------------------------- | -------- |
| font-size   | Pixel Size (ie, `10px`)            | `true`   |
| font-family | Font Family Name (ie, `Arial`)     | `false`  |
| font-style  | `"bold" \| "italic \| "underline"` | `false`  |

#### Example

```json
{
    "headings": {
        "h1": {
            "font-family": "Arial",
            "font-size": "20px"
        },
        "h2": {
            "font-family": "Arial",
            "font-size": "16px"
        },
        "h3": {
            "font-family": "Arial",
            "font-style": "bold"
        }
    }
}
```

## Heading Level Selection

Headings are selected in the Editor via MenuBar buttons.

## Heading Style Customization

Headings can be customized in two ways:

- Directly editing the project's `project.json`. This option is the most error-prone, as Font Families must be available to the application, and users can make errors (such as bad formatting or mispelling of attributes or values)
- Within the UI. This option prevents user error by allowing only valid options and handling configuration updates via the app.
