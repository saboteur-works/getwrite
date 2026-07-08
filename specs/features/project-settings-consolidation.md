# Feature Spec: Consolidate Project Settings Menu

## Overview

Five project-level settings — Heading Style, Body Text Styles, Default Revision
Name, Tags, and Metadata — are already grouped under one "Project settings"
dropdown (`ShellSettingsMenu`), but each item opens its own disconnected modal
dialog (`HeadingSettingsModal`, `BodySettingsModal`, `DefaultRevisionNameModal`,
`TagsManagerModal`, `SchemaManager`) with no shared chrome or navigation between
them. To move from one setting to another, a writer must close the current
dialog, reopen the dropdown, and click the next item. This feature replaces
those five siloed dialogs with a single "Project Settings" surface containing
all five as navigable sections, so a writer can review and adjust related
project settings in one continuous session.

## Goals

- A writer can open one "Project Settings" surface and reach any of the five
  settings (Heading Style, Body Text Styles, Default Revision Name, Tags,
  Metadata) without closing and reopening a menu.
- Switching between settings sections happens in place, without a full modal
  close/reopen round-trip.
- Each section's existing fields, validation, and save behavior are preserved
  exactly as they work today.
- The settings dropdown (`ShellSettingsMenu`) exposes one "Project Settings"
  entry point instead of five separate ones.
- Each section continues to save independently through its existing API route,
  with no cross-section data coupling introduced.

## Non-goals

- Changing what any individual section does, which fields it exposes, or how
  it validates input (e.g. heading level rules, tag color picker, revision
  name length limit).
- Changing persistence: Heading/Body continue through the `editor-config` API
  and `editorConfigSlice`; Default Revision Name continues through the
  `revision-settings` API; Tags continue through the `tags` API; Metadata
  continues through the `metadata-schema` API. No schema or contract changes.
- Consolidating "User Preferences" (`UserPreferencesPage`) or "Project Type
  Manager" (`ProjectTypesManagerPage`) into this surface — neither was named
  in the request and both remain separate menu items.
- Introducing a single unified "Save" that commits all five sections at once;
  each section keeps its own save/cancel action.
- Redesigning the visual style of any individual section's form.

## User stories

- As a writer setting up a new project, I want to configure heading styles,
  body text styles, and my default revision name in one place so I don't have
  to hunt through the menu five separate times.
- As a writer reviewing my project's tags after adding new metadata fields, I
  want to jump from Metadata to Tags without losing my place, so I can cross-
  check the two without extra clicks.
- As a writer, I want a single "Project Settings" label in the settings menu
  so I don't have to remember which of five entries has the setting I want.

## Functional requirements

1. `ShellSettingsMenu` must expose a single "Project Settings" entry (icon +
   label) in place of the current five separate entries ("Heading Styles",
   "Body Text Styles", "Default Revision Name", "Manage Tags", "Metadata").
2. The `SettingsMenuAction` type must replace `heading-styles`,
   `body-text-styles`, `default-revision-name`, `tags-manager`, and
   `metadata` with a single action (e.g. `project-settings`) that opens the
   consolidated surface.
3. Activating "Project Settings" must open one `Dialog` containing all five
   sections, with a persistent way to switch between them without closing the
   dialog. **Resolved:** section navigation uses the existing `Tabs` /
   `TabsList` / `TabsTrigger` / `TabsContent` primitive
   (`frontend/components/common/UI/Tabs/Tabs.tsx`) as horizontal tabs, the
   same pattern `ViewSwitcher` already uses — no left-hand section list or
   accordion. The dialog keeps the existing `maxWidth="max-w-[820px]"` shared
   by all five current dialogs.
4. The consolidated surface must default to a defined initial section when
   opened. **Resolved:** always defaults to Heading Style (the current first
   item). There is no "remember last viewed section" behavior and no new
   session/localStorage state introduced to support it.
5. Each section within the consolidated surface must render its existing
   component (`HeadingSettingsModal`, `BodySettingsModal`,
   `DefaultRevisionNameModal`, `TagsManagerModal`, `SchemaManager`) content
   with its existing props, save handler, and validation, unchanged.
6. Saving a change in one section must not require navigating away from or
   closing the consolidated surface; the writer must be able to save one
   section and continue to another within the same open session.
7. An in-progress unsaved edit in one section must not be silently discarded
   when the writer switches to another section. **Resolved:** the draft is
   preserved in memory, not autosaved or warned-on-switch. All five section
   panels stay mounted for the lifetime of the open dialog (CSS-hidden when
   inactive, not unmounted), so in-progress drafts in Heading, Body Text
   Styles, and Default Revision Name survive tab switches; drafts are
   discarded only when the whole dialog closes. Implementation constraint:
   the existing `TabsContent` unmounts inactive panels (returns `null` when
   inactive — `Tabs.tsx:142-160`), which would re-trigger the silent-discard
   behavior this requirement forbids. The consolidated surface must either
   keep all section panels mounted (CSS-hide the inactive ones instead of
   relying on `TabsContent`'s unmount-on-inactive behavior) or lift draft
   state above the tab switch. Note: only Heading, Body Text Styles, and
   Default Revision Name have a draft concept behind an explicit Save
   button — Tags (`TagsManagerModal`) and Metadata (`SchemaManager`) persist
   each action immediately through their API/Redux calls, so they have no
   draft to lose.
8. Closing the consolidated surface (via its own close control, Escape, or
   backdrop click) must close all sections; no section may remain open behind
   it.
9. Section navigation controls (tabs or equivalent) must be keyboard
   operable and expose their selected state to assistive technology (e.g.
   `role="tablist"`/`role="tab"`/`aria-selected`, or equivalent semantics).
   **Resolved:** satisfied directly by the `Tabs` primitive from FR3, which
   already provides `role="tablist"` / `role="tab"` / `aria-selected` plus
   Arrow/Home/End keyboard navigation — no new accessibility work is needed
   for this requirement.
10. The dialog title read by assistive technology must be "Project Settings"
    at the surface level, with each section's own heading (e.g. "Heading
    Settings", "Manage Tags") preserved as a subheading within its panel.
11. `TagsManagerModal`'s existing guard — it renders only when a project path
    is available — must be preserved when it is rendered as a section of the
    consolidated surface.
12. Removing the five individual `SettingsMenuAction` values and their
    corresponding `isXModalOpen` state/handlers in `AppShell.tsx` and
    `ShellModalCoordinator.tsx` must not change the behavior or persistence
    of any section — only the entry point and container change.
13. Existing tests and stories that reference the five removed menu items or
    their standalone dialogs must be updated to reflect the consolidated
    entry point and sectioned surface.
14. **Resolved (resize/scroll strategy):** the consolidated dialog reuses
    `DialogContent`'s existing fixed frame (`max-h-[92vh] overflow-y-auto`,
    `Dialog.tsx:44-60`) rather than sizing itself per section. The outer
    dialog frame stays constant-height across tab switches; switching
    sections resets only the inner scroll position, not the dialog's
    height. Individual section content (e.g. `SchemaManager`'s longer form)
    must not dictate `DialogContent` height.

## Open questions

None. All prior open questions have been resolved and folded into the
functional requirements above (section-nav UI pattern in FR3/FR9, default
section in FR4, unsaved-change handling in FR7, resize/scroll strategy in
FR14). Deep-linking and the Project Type Manager question were resolved as
out-of-scope for this iteration — see below.

## Out of scope (deferred)

- Merging "User Preferences" into the Project Settings surface.
- Merging "Project Type Manager" into the Project Settings surface. This
  stays a permanently separate concept for this iteration; folding it in is
  a possible future note, not a decision to revisit here.
- A unified save-all / discard-all action across sections.
- Any change to the underlying Zod schemas, API route contracts, or Redux
  slice shapes for editor config, revision settings, tags, or metadata
  schema.
- Reordering or renaming individual settings within their sections.
- URL/deep-link addressing of a specific section, or a dedicated keyboard
  shortcut to open a section directly. In-app tab navigation only, matching
  every other modal in the app (local boolean open/close state; the only
  global shortcuts are Cmd/Ctrl+K for the command palette and Escape to
  close).
