---
title: Narratives View
order: 180
summary: Keep the different tellings of one story as Variants of a Narrative folder, list them with teller, date, place and tags, and read two or more side by side.
---

# Narratives View

A writer who researches a legend, a folktale or an event with several accounts often keeps each telling as a separate document. The **Narratives** tab lists those tellings for one story and opens two or more of them side by side, so you can read them against each other.

- A **Narrative** is a folder that has the subtype "Narrative". It stands for one story.
- A **Variant** is a [Source](../protect-and-finish/resources.md#sources-and-attachments) that has the subtype "Variant". It is one telling of that story.

You can use the same tab to compare witnesses or reports. Rename the fields to suit, and set no tags.

The tab only lists, compares and opens. It never changes a variant, a field, a tag, a list or a subtype, and the comparison is never part of a [compile or export](../protect-and-finish/compiling.md).

## Coming in the next release

GetWrite does not set any of this up for you. There is no built-in project type, subtype, field or list for narratives, and the tab has no checklist or set-up button. You set it up by hand, once per project, with the steps below.

### Turn Narratives on

Narratives are off until you switch them on for a project.

1. Open **Project Settings** and choose the **Modules** tab.
2. Select **Enable Narratives**.

The **Narratives** tab appears. Clear **Enable Narratives** to hide it again. Nothing is deleted or changed: your folders, Sources, fields and tags stay as they are, and they show again when you switch Narratives back on. Narratives do not need the Sources module to be on.

### Add the two subtypes

1. In **Project Settings**, choose the **Metadata** tab.
2. In **Subtypes**, type `Narrative` in **New subtype** and select **Add subtype**.
3. Type `Variant` and select **Add subtype** again.

The two names are fixed. The tab compares them without regard to capitals or spaces around the name, so "narrative" and " Narrative " are the same label. Any other spelling, such as "Tale", is not recognised.

A subtype cannot be renamed in the app. If you remove a label and add another spelling, folders and Sources that already carry the old label keep it, and the tab does not recognise them. Give them the new label from the sidebar, or add the exact label back.

### Add the fields

Add these fields in the **Metadata Fields** manager (see [Metadata](../story/metadata.md#what-you-can-set-on-a-resource)). For each one, tick only **Variant** in **Applies to subtypes**. Leave the folder setting `appliesToFolders` unset, so that the field is offered on Variants and on no folder.

- Three fields of type **Text**: the teller, the date and the place of the telling. Name them as you like, for example Teller, Date and Place. Use **Text** for the date, not **Date**, so that you can type "c. 1850".
- Two fields of type **Multi**: one for motifs and one for tale types. For example, name them Motifs and Tale types.

The tab does not know which field is which. It shows every Text, Select or Multi field that applies to Variant, in the order of the Metadata Fields manager, under the label you gave it. A field you rename shows under its new name, and a field you add later shows too. Nothing is inherited from the narrative folder.

### Write the motif and tale-type lists

The lists are the options of the two Multi fields, typed one per line in the manager. Put the code and the name in one line, joined by space, bar, space (`|`):

```
ATU 510A | Cinderella
ATU 333 | Little Red Riding Hood
```

The line is kept whole, exactly as you type it. GetWrite does not split it, check it or limit it, and it comes with no published index of motifs or tale types.

### Give a folder and its Sources their subtypes

1. In the Resource Tree, select the folder for one story. In the Metadata sidebar, set **Subtype** to **Narrative**.
2. Put a Source in the folder for each telling (see [Resources](../protect-and-finish/resources.md#sources-and-attachments)). Select it and set **Subtype** to **Variant**.
3. Fill in the teller, date, place and tags in the sidebar. A tag is one or more of the options of a Multi field.

A story's variants are the Sources in its folder and in the folders inside it, in the order of the Resource Tree. If a folder inside it is also a Narrative, that folder is its own story, and its Sources are not listed under the outer one. A Source belongs to one narrative. A Source in Trash is not listed, and it returns to the list when you restore it. A document, image or audio resource in the folder is not listed.

## Read the tab

Open the **Narratives** tab.

If no folder has the subtype Narrative, the tab says what a narrative is. When other folders have subtypes, it also names those subtypes, so you can see whether a differently spelled label is the reason no narrative shows. If some folders could not be read, the tab names them as "not read", still shows the narratives it did read, and offers **Try again**. If the project is locked, the tab asks you to unlock it.

When there are narratives, choose one in **Narrative**. Each entry shows the folder name and its variant count, such as "Cinderella (3 variants)".

The list below shows each variant in Resource Tree order with:

- its name;
- every field described above, under its label. A field with no value reads "not set". Tags show as a list.
- a checkbox, "Select ... for comparison", and an **Open** button that opens the variant in the editor.

A Source in the folder that does not have the Variant subtype is listed with the line "not a Variant: teller, date and place do not apply". You can still select it for comparison. A variant that could not be read is listed as unreadable with the reason. It is never shown as a variant with empty fields.

## Compare variants

1. Tick two or more variants, in the list or under **Variants to compare**. Until you tick two, the tab says "Choose two or more variants to compare them side by side."
2. Select **Compare**. The button shows how many variants are ticked, such as **Compare (2)**, and stays unavailable until you tick two. Each ticked variant opens in its own column. The column has the variant's name as its heading, its fields above its text, and its own scroll area. The scroll area can be reached with the keyboard.

The columns show the text of the variant's canonical revision (see [Revisions](../protect-and-finish/revisions.md)), with headings, lists and emphasis kept. A part the viewer cannot show appears as "Unsupported content". The comparison does not mark differences: there is no alignment and no highlighting of changed words.

- A variant with no text shows "No text" and its fields. If it has audio attachments, each shows a **Play audio** button. The audio is read only when you choose it.
- A variant that cannot be read says so in its column, with the reason, and the other columns still show.
- If the project is locked, the tab says so and asks you to unlock it. It never shows "No text" for a locked variant.

Opening, scrolling and closing the comparison write nothing to your project. The tab remembers, on this device only, the variants you last ticked in the project. When you come back to the same narrative, they are ticked again. If a remembered variant is no longer in the narrative, the tab says so and leaves it out.

You can compare up to 3 variants at once. You can tick more, but if you select **Compare** with more than 3 ticked, the comparison shows the message "At most 3 variants can be compared at once. Go back to the list and deselect a variant." and no columns. Select **Back to list** and untick some.

When the columns do not all fit across the window, the comparison scrolls sideways inside its own area.

### Narrow screens

Comparison needs a wide screen. When the screen is narrower than 768 pixels, the **Compare** button is replaced by this message: "Side-by-side comparison needs a wider screen. You can still open each variant from the list." The list stays shown. On a large phone held sideways, the screen is wide enough and you can compare. The tick boxes still show on a narrow screen.

## Tags

A tag is one option of a Multi field, stored on the variant.

A tag that is no longer in the field's list is still shown, marked "(not in the list)". GetWrite does not rewrite or remove it. A Select field works the same way: a value that is no longer one of its options is shown with "(not in the field's list)" and left as it is.

What happens to tags when you change a list in the options editor of the field was observed on the stored value in unit tests of the code behind that dialog. It was not observed in a running app. The test used a Multi field with three options and a Source tagged with two of them, "ATU 510A | Cinderella" and "ATU 510B | Peau d'Ane".

- **Rename an option.** There is no rename control. Remove the old option, add the new spelling, and in the removal preview choose **Remap →** to the new one. The stored tag became the new spelling, and the variant still showed it.
- **Remove an option and choose Remove value.** That tag was dropped from the variant. Its other tag stayed. When it was the variant's only tag, the field was gone from the variant's stored values.
- **Remove an option and choose Keep option.** The option was added back to the list at the end, and the tag stayed.
- **A stored tag that is not an option.** In the same test, a tag whose option was removed without being added back stayed in the variant's stored values while no longer being an option. The tab shows such a tag marked "(not in the list)".

A variant's tag is found by the whole option string. In a smart folder, a query that uses "in" with "ATU 510A | Cinderella" found the variant, with a comma or a double quote in the name as well. "ATU 510A" alone, "ATU 510A |" alone, and "Cinderella" alone found nothing, so a code prefix does not match.

## Good to know

- Switching Narratives off keeps every folder, Source, field and tag. A new Source still starts out of compile and out of your word goals, as any Source does.
- The tab does not set up a project, rename a field or edit a list. Do those in **Project Settings**, **Metadata** tab, and in the sidebar.
