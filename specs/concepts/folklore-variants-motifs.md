## Concept: Folklore variants and motifs

> Gate 1 rename, 2026-11-12: the owner renamed the folder subtype from "Tale" to "Narrative" (a writer comparing oral versions of a historical event would think "Tale" means this is not the place); "Variant" is approved. Below, "narrative" replaces the ideation word "tale" wherever it names the folder; "tale type" and "folktale" keep their folklore meaning.

> Feature-level concept for GetWrite (runway items 14 and 15, build-order item 11 in sab note `note_31c82491`). The repo-wide concept is `specs/concept.md`. Written 2026-11-12 from an ideation interview with the owner; the four owner answers are marked **(owner)**. Everything else is drafted from the runway notes and the shipped Features 102, 103, 108 and 109, and is open to correction.

### Problem & Value

A writer researching a legend or folktale collects many tellings of the same story: a grandmother's account, a 1930s field recording, a newspaper item, a forum post. The value is in the differences between them, who told it, when, where, and what changed. Today a writer keeps these as separate documents and compares them by switching back and forth, or pastes them into a spreadsheet and loses the text. Folklorists also label narratives and their parts with tale types and motifs so that tellings can be found across collections; a writer without a way to tag and look up those labels cannot see which elements recur. GetWrite already holds Sources (Features 102, 103) and lays cards out by field (Feature 109); what is missing is reading tellings side by side and tagging them with a shared vocabulary.

### Target Audience

- **Primary:** writers of folklore, urban legends and local history who gather several tellings of one story from different sources and write about how it changed (the owner's priority audience, note_31c82491).
- **Secondary:** true-crime and nonfiction writers comparing accounts of one event from different witnesses or reports, the same shape of problem without motifs.

### Core Concept

A **narrative** is a folder whose subtype is Narrative **(owner)**; its **variants** are the Sources inside it, each with the teller, date and place it was recorded. Nothing new is stored for this: folders already carry a subtype and fields (Feature 102), Sources already carry a body, attachments, a subtype and fields (Features 102 and 103). The module supplies the vocabulary and the views that make this shape useful, and switches on per project like Sources and Claims.

**Motifs and tale types** are attached to the whole variant **(owner)**, the way a multiselect field is, so that a variant or a narrative can be filtered, grouped in the Organizer grid and found by a smart folder. The lists are the writer's own, a code and a name per entry (for example "ATU 510A Cinderella", or a writer's private "W-12 vanishing hitchhiker") **(owner)**. No standard index is bundled in the first version: the ATU index (Uther, 2004) is under copyright, and the copyright status of Thompson's Motif-Index has not been checked.

**Side-by-side comparison** is the first thing a writer gets **(owner)**: open two or more variants of a narrative next to each other, each with its teller, date, place and motifs above the text, and read across them. It is a reading view; editing stays in the editor.

### Key Capabilities

- A writer can make a folder a narrative and see its variants with teller, date, place, motifs and tale type.
- A writer can open two or more variants of a narrative side by side and read them in parallel.
- A writer can keep a project list of motifs and tale types, each a code and a name, and add, rename, reorder and remove entries.
- A writer can tag a variant with motifs and a tale type and see the tags on the variant and in the comparison.
- A writer can find every variant with a given motif or tale type, across narratives, through smart folders and the Organizer grid.
- A writer can start a folklore project from a project type that sets up the narrative and variant subtypes, fields and module.

### Feature Milestones

**MVP**
- Module switch (off by default); the Narrative and Variant subtypes and the teller, date and place fields are seeded through the project type ("Folklore collection", product spec OQ-224, OQ-234), not by the module, which seeds nothing: the shape the rest needs.
- Side-by-side comparison of variants in one narrative: the value the owner named first.
- Writer-made motif and tale-type lists, and tagging a variant with them: tagging is half the request and must exist for comparison to show it.

**v1**
- Motif and tale type usable in smart folders, the Organizer grid (rows or columns by motif) and search: finding across narratives is what makes tagging pay off day to day.
- A folklore project type that declares the module and seeds the lists' structure: makes a new project ready without set-up.
- Comparison on a phone (stacked or swiped tellings): Android is a supported target, but side by side needs width, so it comes after the desktop layout is settled.

**v2**
- Importing a motif or tale-type list from a file (CSV or JSON), so a writer can bring an index they are licensed to use.
- Passage-level motif marks, so a writer can point at where in a telling a motif appears.
- Spread over place and time (runway 16): variants on a map or timeline. Its own feature, listed here only because it reads the same fields.

### What This Is Not

- Not a bundled ATU, Thompson or other published index in the first version.
- Not a text diff: comparison shows tellings next to each other; it does not align or highlight word changes.
- Not a new resource type or record kind: a narrative is a folder, a variant is a Source.
- Not the writer's own drafts compared (runway 3, Alternates), though the comparison view may later be shared with it.
- Not a shared or public folklore database; everything stays in the writer's project.

### Competitive Landscape

**Scrivener**
- Writing app with a split editor and per-document metadata. Writers can open two documents side by side and add keywords. It has no notion of variants of one narrative or of a coded vocabulary; keywords are free labels. Worth learning from: its split view is simple and familiar.

**Zotero and Tropy**
- Research managers for references and archival photos, used by academics and historians. They hold sources with rich metadata and tags. They are not writing tools and do not compare texts. Worth learning from: Tropy's per-item date and place metadata.

**Spreadsheets**
- What many researchers actually use: one row per telling, columns for teller, date, place, motifs. Fast to sort, but the text lives elsewhere. Worth learning from: the table is the mental model writers already have.

**Folktale catalogues and databases** (for example the Multilingual Folk Tale Database; current scope and terms not checked)
- Public collections indexed by tale type. They give classification but no workspace for a writer's own material.

The clearest differentiator is having the tellings, their sources, the tags and the writer's own prose in one project, with comparison one step away, instead of a spreadsheet beside a folder of files.

### Caveats & Pitfalls

- **Adoption:** writers already keep variants in a spreadsheet and documents; if setting up a narrative costs more than a new spreadsheet row, they will not switch. The project type seeding exists to make the first narrative cheap.
- **Execution:** side-by-side reading of several long texts is a layout problem (width, scroll sync, phone) that is easy to make unusable, as the phone layout pass found for Project Settings. Two to four columns on desktop is a guess, not a measurement.
- **Assumption:** the concept assumes one telling is one Source. A single interview may hold several tellings, and one telling may be spread over several Sources; that may break the model.
- **Licensing:** a writer may expect the ATU or Thompson index to be present; without it, entering codes by hand is slow.
- **Overlap:** motif and tale type could be ordinary multiselect fields today. The module must add enough (codes, lists, comparison) to be worth a switch.

### Technical Considerations

- Worth exploring whether motifs and tale types are stored as the existing multiselect field type with code-and-name options, so smart folders, the grid and search work without new query code.
- Worth exploring the project-type seeding path Feature 109 added (`modules` and `arrangements` on a project type) as the model for seeding subtypes, fields and lists (product spec OQ-224: the module itself seeds nothing).
- Worth exploring whether the comparison view reads the canonical revision of each Source directly, as the Sources view does.

### Open Questions

- Is a variant always a Source, or can a text resource (the writer's own transcription) also be a variant? (resolved: product spec OQ-218)
- How many variants can be compared at once, and does comparison keep the columns' scroll positions in step? (resolved: product spec OQ-219)
- Is one tale type per variant enough, or can a variant have several? (resolved: product spec OQ-220)
- Are the motif and tale-type lists per project, or shared across projects on a device? (resolved: product spec OQ-221)
- Can a variant belong to more than one narrative (a folder holds it once)? (resolved: product spec OQ-222)
- What does comparison show for a Source whose telling is only an audio attachment with no text? (resolved: product spec OQ-223)

### Next Steps

Ready to be specced against GetWrite's existing product spec: add a user story and requirements to `specs/product/getwrite.md` with write-product-spec, add the feature to `specs/product/getwrite.features.md`, then write the feature spec with write-feature-spec.
