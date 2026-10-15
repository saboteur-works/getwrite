---
title: Timeline View
order: 150
summary: Shows dated scenes as chips on a horizontal story-date axis, with zoom, point-of-view colors and folder rows.
---

# Timeline View

## Purpose and user interaction

The Timeline View places each scene as a chip along a horizontal date axis according to its Story Date — the in-story date and time the scene takes place, not the date it was written.

The Timeline View is enabled per project. Open **Project Settings**, select the **Timeline** tab and turn on **Enable Timeline view**. Turning it on also turned on the **Timeline** built-in fields (story date, duration and end date) in the **Metadata** tab, and turning those fields off turned the view off. Once enabled, open the view with the **Timeline** tab in the Work Area (with a document selected); it shows the story dates entered in the metadata sidebar, and a Story Date set in the sidebar added the scene to the open view. While the view is off, its tab is greyed out; hovering it shows "The Timeline view is off. Turn it on in User Preferences → Timeline view." The **User Preferences** window (Theme, Density, Motion) has no Timeline setting; the setting is in **Project Settings**.

Not yet in a release (merged after 2.2.0).

### Setting story dates

A scene appears on the timeline only after a Story Date has been set in its metadata. The date can be a calendar day alone or a date and a time. Set a **Duration** (a number and a unit: min, hr, day or yr) or an **End date / time** (select **Override**) and the scene is drawn as a span rather than a point; a scene with only a date is drawn as a thin bar.

### Navigating the timeline

The axis runs from the earliest dated scene to the latest, with a margin on each side. Zoom with the **+** and **−** buttons in the toolbar, or with Ctrl+scroll (Cmd+scroll on a Mac); scrolling without the key did not zoom. The zoom button reads 100%, 150%, 200%, 300%, 400%, 600%, 800% or 1000%, and the view opens at 200%. In a span of a few days the axis labels changed from dates to a date with hours and minutes at 400% and above.

Clicking a chip selects that scene: its metadata appears in the sidebar and the Timeline tab stays selected; no editor opened.

Hovering over a chip opens a tooltip near the pointer; see "Tooltip" below.

### Point-of-view color coding

When scenes have a point-of-view character assigned, each distinct POV had its own color (one blue, one green in a test), shown on the chip. A legend between the toolbar and the track pairs each color swatch with the POV name when two or more POVs are present.

### Groups and acts

Scenes inside a folder (for example an act or chapter) are drawn in a labeled row for that folder, with the folder name and a scene count ("ACT ONE", "3 scenes") to the left of the track. Scenes directly under the top-level Workspace folder were drawn in a row labeled "WORKSPACE", last. A scene whose metadata file had been edited by hand to remove its folder was drawn in a final row with no label.

---

## Behavior

### What scenes appear

Only scenes with a Story Date set are shown. Scenes without a date are left out without a message. A new project with the view on and no dated scenes shows "NO DATED SCENES" and "Add story dates in the metadata sidebar". The scene count in the toolbar counted only the dated scenes (6 for 9 text documents of which 6 had a date).

### Axis bounds and zoom

The axis start and end are computed from the earliest and latest dated scenes, with 5% of the dated span added on each side (the earliest chip started 4.5% along the track and the latest ended 95.5% along it). Zooming multiplies the track width: the view is 900 pixels wide at 100%, twice that at 200%, and 9000 pixels at 1000%. The number of axis labels was 10 at zoom levels up to 300% and 20 from 400%.

### Gap labels

When two adjacent scenes in the same row have a gap between them of more than 5% of the axis span, a small label between them shows the gap, for example "4h", "6h", "3d", "13w", "26w" or "196w". A 4-hour gap in a 72-hour span (5.6%) was labeled and a 3-hour gap (4.2%) was not. Gaps of several months were labeled in weeks; no "mo" label appeared.

### Row height and lane stacking

Two chips in the same row whose times overlap are stacked in parallel lanes. A row with two lanes was 96 pixels high and a row with one lane 56 pixels. Lanes depend on the scenes' times, not on whether the chips touch on screen: two scenes whose times overlapped were in separate lanes at every zoom level, while two scenes four hours apart shared a lane although their chips overlapped on screen at 200%.

---

## Appearance

### Layout

The view has a toolbar, then the POV legend when it is shown, then the axis and the rows. There was no title bar reading "Timeline — Project Name". The track area scrolls horizontally when it is wider than the window.

### POV legend

When two or more distinct POV characters are present, a row of color swatches and labels appears between the toolbar and the axis. Each entry is a small filled circle (7 pixels) in the POV's color followed by the POV name in a monospaced typeface with subdued color. The legend was absent when every scene had the same single POV, and absent when no scene had a POV. When some scenes had no POV, the legend also listed an **Outline** entry with a hatched swatch, including when only one POV was present.

### Toolbar

A slim bar sits above the track. On the left it shows the count of dated scenes ("6 SCENES"). On the right are the zoom-out (−), zoom percentage and zoom-in (+) buttons. Each zoom button turns light gray and cannot be used at its limit (100% for −, 1000% for +).

### Axis

A row of tick marks runs above the scene rows. Each tick has a short vertical line (5 pixels) with its date label above it. Labels were month-and-day ("Jan 23") and, at higher zoom in a span of a few days, month, day and time ("May 1 03:00"). A label with the year ("2024 Jan") did not appear in a four-year span.

### Scene chips

Each chip is a colored, rounded rectangle placed on the track at the scene's story date. Its left edge sits at the scene's start, and its width is in proportion to the scene's duration (a 19-day scene was 7.2% of the track in a span of about 7.9 months plus margins). Three kinds of chip were seen:

- **Bar** — the chip for a scene with room for a label. It shows the whole scene name, cut off with an ellipsis if it is too long.
- **Pill** — a narrow chip for a short scene (30 and 60 minutes in spans of days and months). It shows only the first word of the name ("Midday" for "Midday Two", "Tiny" for "Tiny Event Scene") and was 10 pixels wide at every zoom level.
- **Pin** — a thin bar, 2 pixels wide, for a scene with no duration. It has no label. It was 28 pixels high in a row 56 pixels high, the same height as the other chips.

Which chip kind a scene gets, and at what width, was not established.

Chips are fully opaque (opacity 1). A chip's color follows its POV; a chip with no POV was a neutral light color. Hovering over a chip made it brighter (a brightness filter of 1.3) and drew a thin outline; focusing a chip from the keyboard also drew a thin outline.

### Tooltip

Hovering over a chip opens a tooltip next to the pointer, to its upper right, or to its left near the right edge of the view (it did not sit directly above the chip). It shows the scene name in bold, then labeled lines: **Date** (the date, with the time if set), **POV** (when set), **Duration** (for example "3h", or "Point event" when there is none), **Source** (the folder the scene is in), and **Notes** (an excerpt of the scene's notes, cut off with "…" after about 120 characters), plus the status (for example "In review") for a scene that has one. The tooltip has a solid background and opacity 1.

### Row separators

Each row has a thin light-gray line along its bottom edge, separating it from the next row.

## Warnings and limits

- The tooltips on the greyed **Timeline**, **Entities** and **Graph** tabs say "User Preferences"; the settings are in Project Settings.
- Two chips whose scenes are hours apart can overlap on screen in one lane: **Dawn** (08:00, two hours) and **Midday** (12:00) were drawn 1 pixel apart at 200% in a span of eight months.
- In a span of three days at 100% to 300% the axis labels read "May 1, May 2, May 2, May 3, May 3, May 4": the same day-only label appeared twice in a row.
- A chip click does not open the editor (see "Navigating the timeline").

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
