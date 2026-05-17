# GetWrite — Timeline View Styling Guide

**Version:** 0.1  
**Parent brand:** Saboteur LLC (SAB/works)  
**Last updated:** 2026-05

## Implementation

Token definitions: `src/styles/getwrite-theme.css`  
For Tailwind utility class names, see the token comments in that file.  
This guide covers intent and rules; the theme file covers implementation.

This document is self-contained. It reproduces all tokens and conventions needed to implement the Timeline View without reference to the base styling guide.

---

## 1. What the Timeline View is

The Timeline View places scenes along a horizontal date axis according to their in-story date — the date and time the scene takes place in the world of the story, not the date it was written. It answers the question: *in what order do things actually happen?*

It is a structural tool for writers managing complex, multi-POV, or non-linear narratives. It is not a Gantt chart, not a calendar, not a data dashboard. The visual language should communicate this: precision without business-software energy, density without clutter.

The design must hold up under extended use. A writer might have this view open for an hour while rearranging Act II. That means chrome recedes, chips and their relative positions carry all the meaning, and nothing in the UI bids for attention.

---

## 2. Color

### Base tokens

```
--color-black:    #0A0A0A   /* primary background */
--color-white:    #F5F4F0   /* primary text — warm, not pure white */
--color-red:      #D44040   /* Signal Red — position and canonical marker only */
--color-mid:      #6A6864   /* secondary text, muted labels */
--color-surface:  #111110   /* raised dark surfaces */
--color-surface2: #161614   /* deeper surface, nested elements */
--color-dim:      #2E2E2C   /* borders */
--color-rule:     #1A1A18   /* divider lines, gridlines */
```

### Timeline-specific surface

The track area — the region where chips live — uses a surface one step darker than `--color-black`:

```
--color-track:    #0C0C0B   /* dark mode track background */
```

This creates a shallow depth beneath the chips without introducing a new visual register. It is not a named token in the theme file; apply it directly to the track wrapper.

### Light mode overrides

In light mode, the following tokens change value:

```
--color-black:    #F5F4F0
--color-white:    #0A0A0A
--color-surface:  #ECEAE3
--color-surface2: #E4E1DA
--color-dim:      #D0CEC8
--color-rule:     #D8D5CE
--color-mid:      #7A7870   /* slightly adjusted for light contrast */
```

The track background in light mode: `#ECEAE3` (`--color-surface` in light mode). No separate token needed — the light track is just the standard light surface, not a distinct darker value.

Signal Red (`#D44040`) is unchanged in both modes.

### Red in the Timeline View

Red has exactly one appearance in the Timeline View: the inset left border on Final-status chips (`box-shadow: inset 2px 0 0 rgba(212,64,64,0.75)`).

Red also appears on the active POV filter pill — consistent with how active selection is marked throughout GetWrite (active metadata tags, active revision badge). This is border and text only, never fill.

Red does not appear in the axis, gridlines, row labels, row separators, chip labels, gap labels, or the tooltip (except the Final status badge within the tooltip, which mirrors the chip treatment).

The track area has no red. A writer spending four hours in this view should not be aware of the brand color. They should be aware of their scenes.

### POV colors

POV colors are not brand tokens. They are functional, desaturated, and fixed — chosen to be distinguishable without competing with the UI chrome.

```
Mira Okafor  (example):   #7B9FCE   /* desaturated steel blue */
Callum Reyes (example):   #B07A5E   /* desaturated terracotta */
Both / no POV:            #7A9E7A   /* desaturated sage */
No POV set:               #5A5A58   /* neutral — close to --color-mid range */
```

These exact values apply to the reference manuscript. For the general expansion palette — additional POV characters beyond those defined at project creation — see `src/styles/pov-colors.ts`. New POV colors must come from that palette; they must never be auto-generated and must never be drawn from the brand color system.

Text on chips uses `rgba(10,10,10,0.82)` regardless of POV color. The desaturated fills are mid-range values — dark text reads cleanly on all of them. Do not use `--color-white` for chip text; the contrast is too high against these fills.

---

## 3. Typography

All type is set in the IBM Plex family. Do not substitute other typefaces. IBM Plex Serif does not appear in the Timeline View — it is scoped to the editor writing surface only.

### Roles used in this view

| Role | Typeface | Weight | Size | Tracking |
|---|---|---|---|---|
| Scene name (bar chip) | IBM Plex Mono | 400 | 9px | `0.06em` |
| Scene name (pill chip) | IBM Plex Mono | 400 | 8px | `0.04em` |
| Axis tick labels | IBM Plex Mono | 400 | 9px | `0.08em` |
| Row act label | IBM Plex Mono | 400 | 9px | `0.14em` |
| Row scene count | IBM Plex Mono | 400 | 8px | `0.08em` |
| Toolbar scene count | IBM Plex Mono | 400 | 9px | `0.18em` |
| Filter pills | IBM Plex Mono | 400 | 9px | `0.12em` |
| Zoom percentage | IBM Plex Mono | 400 | 9px | `0.10em` |
| Gap labels | IBM Plex Mono | 400 | 8px | `0.08em` |
| Legend POV names | IBM Plex Mono | 400 | 9px | `0.08em` |
| Legend section header | IBM Plex Mono | 400 | 9px | `0.18em` |
| Tooltip scene name | IBM Plex Sans | 700 | 12px | default |
| Tooltip keys | IBM Plex Mono | 400 | 9px | `0.10em` |
| Tooltip values | IBM Plex Mono | 400 | 9px | `0.06em` |
| Tooltip status badge | IBM Plex Mono | 400 | 8px | `0.12em` |
| Empty state primary | IBM Plex Mono | 400 | 10px | `0.14em` |
| Empty state secondary | IBM Plex Mono | 400 | 9px | `0.08em` |

The Timeline View is almost entirely monospaced. Mono type signals precision — dates, names, counts — and keeps the view feeling like a technical instrument rather than a document browser. IBM Plex Sans appears only in the tooltip scene name, where weight and sans-serif rendering make the scene name immediately scannable above the data rows.

Labels, tick marks, row headers, and control labels are uppercase. Chip scene names are sentence case — they are proper content, not labels.

---

## 4. Layout

The Timeline View occupies the full Work Area — the panel that normally contains the editor — when the Timeline tab is active. The resource tree (left panel) remains visible. The metadata panel (right panel) is suppressed: the timeline is a read-oriented view, and the metadata panel is an authoring tool.

The view is composed of five horizontal layers stacked top to bottom:

```
[ Tab bar                              ]  44px   shared chrome, not part of this spec
[ Toolbar                              ]  34px
[ POV legend                           ]  32px
[ Axis                                 ]  32px   sticky
[ Row tracks                           ]  flex 1, scrollable
```

Total chrome above the scrollable track: `44 + 34 + 32 + 32 = 142px` below the application title bar.

### Row label column

A `84px` fixed column runs the full height of the view, left of the track. In the toolbar and legend, this space is empty padding that aligns the controls with the track. In the axis and row tracks, it contains sticky labels.

Left padding on toolbar controls and the legend is `84px + 16px` — accounting for the label column width plus standard internal padding — so that controls align with the track area rather than the label column.

### Horizontal scrolling

The track area scrolls horizontally. The row label column and axis are both sticky: labels to the left edge, the axis to the top. The intersection (the empty 84px square at top-left) is always visible.

Track width is computed as:

```
track width = max(900px, 900px × zoom_multiplier)
```

At default zoom (2×), the track is `1800px` wide. At minimum zoom (1×), `900px`. This ensures the track is always wider than the viewport at typical screen widths, making horizontal scrolling available at every zoom level.

---

## 5. Toolbar

Height: `34px`. Background: `--color-surface2`. Bottom border: `0.5px solid --color-dim`.

Left to right:

1. `84px` left offset (aligns with track, not label column)
2. Scene count label
3. Flexible spacer
4. POV filter pill group
5. `0.5px solid --color-dim` vertical divider, `18px` tall
6. Zoom control group

The vertical divider between filter pills and zoom controls is structural. It matches the dividers used in the application title bar and separates two categorically different controls. Do not omit it.

### Scene count

IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.18em`, `--color-mid`.

Format: `N SCENES` (plural always, except `1 SCENE`). Reflects the count of dated scenes visible under the current POV filter — not the total scene count for the manuscript.

### POV filter pills

A connected button group with shared borders. Pills sit flush against each other using `margin-left: -0.5px` on all except the first, with `position: relative; z-index: 1` on the active pill to bring its border forward.

```
font:           IBM Plex Mono 400, 9px, uppercase, letter-spacing: 0.12em
padding:        3px 9px
border-radius:  0   /* connected group — no radius on any pill */

default:        border: 0.5px solid --color-dim    color: --color-mid
hover:          color: --color-white
active:         color: #D44040   border-color: #D44040   z-index: 1
```

Transition: `color 0.12s ease`, `border-color 0.12s ease`.

Filter options: All + one pill per named POV character in the manuscript. Do not add a "No POV" filter. Scenes without POV are included in All and excluded from character-specific filters — that is the correct and expected behavior.

### Zoom control

A three-part connected group sharing a `0.5px solid --color-dim` outer border.

**Decrement and increment buttons** (− and +):

```
width:          26px
height:         22px
font:           IBM Plex Mono 400, 13px
color default:  --color-mid
color hover:    --color-white
background hover: --color-dim
color disabled: --color-rule
cursor disabled: default
border-radius:  0
```

Transition: `color 0.12s ease`, `background 0.12s ease`.

**Percentage display** (center segment):

```
min-width:      38px
height:         22px
font:           IBM Plex Mono 400, 9px, letter-spacing: 0.10em
color:          --color-mid
border-left:    0.5px solid --color-dim
border-right:   0.5px solid --color-dim
cursor:         pointer
color hover:    --color-white
```

Clicking the percentage display resets zoom to 2× (the default level). This is a discoverable affordance — do not add a tooltip or label explaining it.

#### Zoom levels

```
1×    100%
1.5×  150%
2×    200%   ← default on open
3×    300%
4×    400%
6×    600%
8×    800%
10×   1000%
```

The decrement button dims when at 1×. The increment button dims when at 10×. The zoom ceiling of 10× is a deliberate limit — at that level even the shortest scenes render as legible bar chips, and beyond it the track becomes difficult to navigate without additional information gain.

#### Keyboard shortcuts

```
+  or  =    zoom in one step
-           zoom out one step
0           reset to 2× (default)
Ctrl+scroll / Cmd+scroll    zoom in/out, anchored to viewport center
```

#### Scroll anchoring on zoom

When zoom changes, the scroll position must be recalculated so that the horizontal center of the visible viewport stays centered after the zoom. Without this, zooming snaps to the left edge and the writer loses their place.

Algorithm:

1. Before zoom: `anchorFrac = (scrollLeft + viewportWidth / 2) / totalTrackWidth`
2. Apply zoom (re-render with new `totalTrackWidth`)
3. After render: `scrollLeft = (anchorFrac × newTotalTrackWidth) − (viewportWidth / 2)`

Apply on every zoom change — button click, keyboard shortcut, or scroll wheel. Clamp the resulting `scrollLeft` to `[0, newTotalTrackWidth − viewportWidth]`.

---

## 6. POV legend

Height: `32px`. Background: `--color-surface2`. Bottom border: `0.5px solid --color-dim`.

Left padding: `84px + 16px` (matching toolbar offset).

**Section header:** IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.18em`, `--color-dim`. Text: `POV`. `margin-right: 4px` separates it from the first entry.

**POV entries:** Each is a `7px` filled circle followed by the character name. Gap between dot and name: `6px`. Gap between entries: `20px`.

```
name font:  IBM Plex Mono 400, 9px, letter-spacing: 0.08em, --color-mid
```

**Outline status entry:** The legend includes one non-POV entry for the Outline chip status. It sits after the POV entries with `margin-left: 8px` additional separation. Its indicator is a small hatched rectangle (`22×9px`, `border-radius: 2px`) using the same diagonal hatch pattern as outline chips — not a colored dot. This distinguishes it visually as a status indicator rather than a character.

The legend is omitted entirely when the manuscript has only one POV character and no scenes without a POV assignment. A single-entry legend adds no information.

---

## 7. Axis

Height: `32px`. Background: `--color-surface2`. Bottom border: `0.5px solid --color-dim`. `position: sticky; top: 0; z-index: 10` — the axis remains visible as the writer scrolls down through many acts.

**Structure:**

```
[ 84px label pad | ∞ tick track ]
```

The label pad is the same width as the row label column. It shares the axis background and has a `0.5px solid --color-dim` right border. It contains nothing — it is the visual anchor that aligns the axis with the row tracks below.

The tick track scrolls horizontally with the track content.

### Tick marks

Width: `0.5px`. Height: `5px`. Color: `--color-dim`. Each tick is center-aligned to its time value using `transform: translateX(-50%)`.

Tick labels sit above the tick line, bottom-aligned within the axis, with `4px` bottom padding:

```
font:        IBM Plex Mono 400, 9px, uppercase, letter-spacing: 0.08em
color:       --color-mid
white-space: nowrap
```

### Tick density

Maximum tick count: `20` at zoom ≥ 4×, `10` at zoom < 4×. When the computed count exceeds the maximum, thin evenly by skipping. Never crowd ticks to the point where labels would visually overlap.

### Tick label format

The label format adapts to the combination of total story span and current zoom level:

| Story span | Zoom | Tick interval | Format | Example |
|---|---|---|---|---|
| > 7 days | any | 24h | Month + day | `MAR 5` |
| 2–7 days | < 4× | 12h | Month + day | `MAR 5` |
| 2–7 days | ≥ 4× | 3h | Month + day + time | `MAR 5  14:30` |
| ≤ 2 days | < 2× | 3h | Month + day | `MAR 5` |
| ≤ 2 days | ≥ 2× | 1–3h | Month + day + time | `MAR 5  08:00` |
| ≤ 12 hours | any | 1h | Month + day + time | `MAR 5  08:00` |

When time is shown: `HH:MM` in 24-hour format, separated from the date by two spaces — not a comma, not a dash. This keeps labels compact and consistent.

### Gridlines

Each axis tick has a corresponding vertical gridline extending the full height of the row track area. Gridlines: `0.5px` wide, `--color-rule`. `z-index: 0` — behind all chip content.

Gridlines let the eye trace from a chip back to its date without scanning all the way up to the axis. They must not compete with chip color. Do not vary gridline weight or color to indicate major versus minor ticks. One weight, one color, throughout.

Gridlines are generated from the same tick array as the axis labels — there is never a gridline without a corresponding axis label.

---

## 8. Row labels

Width: `84px`. Background: `--color-surface2`. Right border: `0.5px solid --color-dim`. `position: sticky; left: 0; z-index: 5` — the act label remains visible while scrolling horizontally.

**Act name:** IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.14em`, `--color-mid`.

**Scene count:** IBM Plex Mono 400, 8px, `letter-spacing: 0.08em`, `--color-dim`. Format: `N scene` / `N scenes`. `margin-top: 3px`. This is secondary — it should recede noticeably relative to the act name.

Internal padding: `6px 10px`. The two-line label is vertically centered within the row, regardless of how tall the row grows due to lane stacking.

The `84px` width accommodates act names up to approximately 10 characters. If the project uses folder names longer than that, expand the column up to a maximum of `120px` and truncate beyond with ellipsis. The label column width is constant for a given project — do not resize it per-row.

---

## 9. Row tracks

Each act (folder) occupies one row. Rows are separated by `0.5px solid --color-rule`.

Alternating rows carry a barely perceptible background tint to help the eye distinguish act bands in dense views:

```
odd rows:   transparent
even rows:  rgba(255,255,255,0.011)   dark mode
            rgba(0,0,0,0.011)         light mode
```

Do not increase these opacity values. The tint is intentionally at the threshold of perception — it provides spatial orientation without registering as a deliberate visual element.

### Lane stacking

When two or more scenes in the same act would produce overlapping chips at the current zoom level, they are stacked into parallel lanes within the same row.

Lane assignment is greedy by start time: each scene goes into the first lane whose last-placed chip ends at least `6px` before the current scene's start position. If no existing lane has room, a new lane is created.

Row height expands to accommodate lanes:

```
row height = (num_lanes × 40px) + (2 × 8px padding)
minimum:    56px   (one lane)
```

There is no maximum. A dense act with four overlapping scenes produces a `192px` row. This is correct — the height communicates story-time overlap. Do not reduce chip height or chip spacing to avoid lane expansion.

### Gap labels

When two adjacent scenes in lane 0 of the same row have a gap between them exceeding 5% of the total axis span, a gap label appears at the horizontal midpoint between the two chips.

```
format:         · Nd ·   (middle dot, thin space, duration, thin space, middle dot)
font:           IBM Plex Mono 400, 8px, letter-spacing: 0.08em
color:          --color-dim
position:       vertically centered in lane 0
pointer-events: none
```

Duration abbreviations: `m` (minutes), `h` (hours), `d` (days), `w` (weeks). Use the largest unit that yields a value ≥ 1. Round to the nearest whole unit.

Gap labels appear in lane 0 only, regardless of which lane the adjacent scenes actually occupy. They mark story-time intervals between the earliest scenes in the act group, which is where structural jumps are most likely to be meaningful to the writer.

---

## 10. Scene chips

Scene chips are the primary visual element of the Timeline View. Each chip encodes four things: position in story time (left edge), duration (width), POV character (fill color), and workflow status (structural treatment). No other visual variables are used. Do not add a fifth encoding dimension.

### Dimensions

```
height:        28px
border-radius: 3px
```

Within each `40px` lane slot, chips sit with `6px` top padding: `6px top + 28px chip + 6px bottom = 40px`.

### Chip width

```
width = max(2px, round((scene_duration_ms / total_axis_span_ms) × track_width_px))
```

For scenes with `duration = 0` (point events), width is fixed at `2px` regardless of zoom — this is the pin variant.

### Chip variants

Three variants are chosen in the render pass based on pixel width. The transition between variants is instantaneous — do not animate it.

**Bar** — used when `width ≥ 48px`

```
padding:      0 7px
label:        full scene name, truncated with ellipsis
font:         IBM Plex Mono 400, 9px, letter-spacing: 0.06em
text color:   rgba(10,10,10,0.82)
```

**Pill** — used when `16px ≤ width < 48px`

```
padding:      0 5px
label:        first word of scene name only
font:         IBM Plex Mono 400, 8px, letter-spacing: 0.04em
text color:   rgba(10,10,10,0.82)
```

**Pin** — used when `scene.durationH === 0` (point event, no duration)

```
width:        2px, fixed
border-radius: 1px
no label
```

The pin variant is triggered by the absence of a duration, not by computed pixel width. A scene with a very short duration that results in a narrow chip is a pill, not a pin.

### Status treatments

Status is encoded structurally. No new colors are introduced.

**Final**

```
box-shadow: inset 2px 0 0 rgba(212,64,64,0.75)
```

A red inset left border. Consistent with how Final/canonical state is marked elsewhere in GetWrite: the active file in the resource tree (left border), the canonical revision badge (red outline). This is the only red in the track area.

**Draft**

No additional treatment. Draft is the baseline state.

**Outline**

```
opacity:  0.72
overlay:  repeating-linear-gradient(
            45deg,
            rgba(0,0,0,0.28) 0px,
            rgba(0,0,0,0.28) 1.5px,
            transparent     1.5px,
            transparent     5px
          )
```

The overlay is an absolutely-positioned child element spanning the full chip (`position: absolute; inset: 0; border-radius: 3px`), applied on top of the POV fill color. The combination of reduced opacity and diagonal hatch communicates "rough / not yet real" without adding color. Both treatments together are required — opacity alone is insufficient.

In light mode, use `rgba(0,0,0,0.20)` for the stripe color (versus `rgba(0,0,0,0.28)` in dark mode).

Do not use a dashed border for outline chips. Dashed borders at 28px chip height render poorly across browsers and zoom levels.

### Hover state

```
filter:         brightness(1.3)
outline:        1px solid rgba(245,244,240,0.5)
outline-offset: -1px
transition:     filter 0.1s ease
```

The inset outline on hover echoes the border-as-marker language used throughout GetWrite. It gives the chip a defined edge that reads as "selectable" — more intentional than brightness shift alone.

### Focus state (keyboard navigation)

```
outline:        1px solid #F5F4F0
outline-offset: 1px
```

Do not remove or suppress the focus ring. A writer navigating a dense timeline with a keyboard needs a clear, visible position indicator.

### Click behavior

Clicking a chip navigates immediately to that scene in the Edit view. There is no selected or active state within the Timeline itself — navigation is the action. The tab transition follows the standard `200ms ease` layout transition.

---

## 11. Tooltip

The tooltip appears on chip hover. It is positioned absolutely within the track wrapper — not fixed — and must never cause the wrapper to expand or scroll.

```
background:   --color-surface2
border:       0.5px solid --color-mid
padding:      11px 13px
min-width:    155px
max-width:    230px
opacity:      0 default, 1 on hover
transition:   opacity 0.08s ease
z-index:      200
```

No transform or position animations. The tooltip appears and disappears cleanly.

### Tooltip content (top to bottom)

**Scene name**

```
font:          IBM Plex Sans 700, 12px
color:         --color-white
margin-bottom: 7px
```

**Divider**

```
height:        0.5px
background:    --color-dim
margin-bottom: 7px
```

**Key–value rows** — Date, POV, Duration, Act

Each row: `display: flex; justify-content: space-between; gap: 10px; margin-top: 3px`

```
key:   IBM Plex Mono 400, 9px, uppercase, letter-spacing: 0.10em, --color-mid
value: IBM Plex Mono 400, 9px, letter-spacing: 0.06em, --color-white
```

**Status badge**

```
margin-top:    7px
font:          IBM Plex Mono 400, 8px, uppercase, letter-spacing: 0.12em
padding:       2px 7px

default:       border: 0.5px solid --color-dim    color: --color-mid
Final:         border-color: #D44040              color: #D44040
```

The status badge in the tooltip is the only place status is shown as readable text. Do not add a status label to the chip itself.

### Date format in tooltip

Always `Mon DD  HH:MM` — full date plus time, even if the scene's story date has no time component (show `00:00` in that case). Consistency matters more than brevity in a detail view.

### Duration format in tooltip

```
0 hours:    Point event
< 1 hour:   Nm        (e.g. 15m)
≥ 1 hour:   Nh        (e.g. 2h)
```

### Tooltip positioning

Preferred: `14px` right of cursor, `10px` above. If the tooltip would overflow the right edge of the wrapper, flip to `14px` left of cursor. Clamp top to `4px` from wrapper top edge. Clamp bottom to `4px` from wrapper bottom edge.

---

## 12. Empty state

When the active POV filter returns no scenes, display an empty state in place of blank rows.

```
display:          flex
flex-direction:   column
align-items:      center
justify-content:  center
height:           100%
gap:              10px
```

**Primary line:** IBM Plex Mono 400, 10px, uppercase, `letter-spacing: 0.14em`, `--color-dim`.  
**Secondary line:** IBM Plex Mono 400, 9px, `letter-spacing: 0.08em`, `--color-rule`.

When filtered and no scenes match:

```
Primary:    No scenes match this filter
Secondary:  Set POV in the metadata sidebar
```

When unfiltered (All) and no scenes have story dates:

```
Primary:    No dated scenes
Secondary:  Add story dates in the metadata sidebar
```

No button, no CTA. The empty state tells the writer what to do and trusts them to do it. The metadata sidebar is always accessible from this view.

---

## 13. Motion

Color, border, and opacity transitions: `150ms ease`.  
Zoom percentage color on hover: `150ms ease`.  
Tooltip appear/disappear: `opacity 0.08s ease`.  
Chip hover filter: `0.1s ease`.

No transitions on chip position or size. Variant switches (bar → pill → pin) happen instantaneously in the render pass, not via animation — animating chip width or label appearance on zoom would create visual noise in an already dense view.

The Timeline View has no loading state animation. If scenes take time to render, show the toolbar and axis immediately and populate rows as they are computed. Do not block the entire view behind a spinner.

---

## 14. What the Timeline View explicitly avoids

**Color for status.** Adding a fourth encoding dimension — color for status, on top of color for POV — would make the track illegible. Status is structural only: red inset border for Final, hatch overlay for Outline, nothing for Draft.

**A "current date" marker.** The timeline shows story time, not real time. A marker for today's date would conflate the two and disorient writers working in non-contemporary settings.

**Drag-to-reposition.** The timeline is a read view — it reflects dates entered in the metadata sidebar. Making it directly editable by dragging requires a separate design treatment for collision resolution, undo behavior, and date precision. If that capability is ever built, it should be designed as a distinct mode, not layered onto this view.

**Zoom beyond 10×.** At 10×, even scenes of 15 minutes' story duration render as legible bar chips in most manuscripts. Beyond this level the track becomes difficult to navigate without additional information gain. The ceiling is a decision, not a limitation.

**Color-coded gridlines.** Gridlines are `--color-rule` throughout. Varying weight or color to distinguish major from minor ticks adds hierarchy that competes with chips. One weight, one color.

**Serif type.** IBM Plex Serif does not appear in the Timeline View. It is scoped to the editor writing surface. All type here is IBM Plex Mono or IBM Plex Sans.

**Toast notifications.** No toasts are triggered by Timeline View interactions. Navigation to a scene is immediate. There is nothing to confirm.