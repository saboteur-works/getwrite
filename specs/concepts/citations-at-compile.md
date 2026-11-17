## Concept: Citations and bibliography at compile

> Feature-level concept for GetWrite (runway item 11; build-order item 12 and Run G in sab note `note_31c82491`; runway note `note_a6991b90`). The repo-wide concept is `specs/concept.md`. Written 2026-11-14 from an ideation interview with the owner; the three owner answers are marked **(owner)**. Everything else is drafted from the notes and the shipped Features 101, 102, 103 and 108, and is open to correction.

### Problem & Value

Nonfiction, true-crime and folklore writers in GetWrite already tie passages to their Sources: since Feature 103 a writer can select a passage, choose a Source and an optional page or timestamp, and store a citation. But the citation lives only inside the app. When the writer compiles a manuscript for an editor, a publisher or a class, the citations vanish and the writer has to rebuild every footnote and the bibliography by hand in a word processor, which is slow, error-prone and repeated on every draft. The value is a manuscript that leaves GetWrite with its notes and bibliography already formatted in the style the reader expects.

### Target Audience

- **Primary:** nonfiction, true-crime and local-history writers who cite books, archives, newspapers, interviews and web pages and must hand in a manuscript in a named style (the owner's priority audience, note_31c82491).
- **Secondary:** students and academics writing papers in GetWrite who need APA or MLA, and folklore writers citing collections and field recordings.

### Core Concept

A **citation** stays what it is today: an annotation on a passage whose `target` names a Source and optionally an excerpt, an attachment and a locator. What is new is that a Source carries **citation fields**, a fixed set the module defines (reference type, authors, title, container such as a book or journal, publisher, date, place, URL, accessed date, and similar) **(owner)**, edited on the Source like its other metadata. Fixed fields map cleanly to what citation styles need, so the writer never builds a mapping.

At **compile**, the writer can switch on citations and choose a **style** from a small bundled set rendered by a Citation Style Language (CSL) engine, for example Chicago notes and bibliography, Chicago author-date, APA and MLA **(owner)**. Each cited passage then becomes a footnote or an in-text reference, as the style says, and a bibliography of the cited Sources ends the manuscript. With citations off, compile produces exactly what it does today.

It is a module, off by default like Claims and Narratives, because only some writers cite; the citation records themselves are core (Feature 103) and are not changed.

### Key Capabilities

- A writer can enter a Source's bibliographic details in fixed citation fields and see which details a chosen style still needs.
- A writer can compile a manuscript with citations rendered as footnotes or in-text references in a chosen bundled style.
- A writer can include a bibliography of the Sources cited in the compiled resources.
- A writer can keep a project's preferred style so compile starts from it, and override it for one run.
- A writer can see, before compiling, which citations cannot be rendered (Source removed, required details missing) instead of finding gaps in the output.
- A writer can use citations in every compile format GetWrite has (PDF, DOCX, Markdown, plain text), on desktop, web and Android.

### Feature Milestones

**MVP**
- Fixed citation fields on a Source: without data there is nothing to format.
- Compile with citations on, one bundled style per run, footnotes or in-text references plus a bibliography of cited Sources, in PDF and DOCX: the formats a writer hands to an editor.
- Missing-data and removed-Source warnings before the compile runs: a silent gap in a submitted manuscript is the failure that matters.

**v1**
- The full bundled style set and a per-project default style, overridable per compile: day-to-day use across different publishers.
- Markdown and plain-text outputs, and Android compile: every existing compile path, not just the two main ones.
- Bibliography options: cited Sources only, or every Source in the project.

**v2**
- Importing a writer's own `.csl` style file: for journals and presses whose style is not bundled.
- Importing references (BibTeX, CSL-JSON, DOI lookup) into a Source's citation fields: speeds entry for academic sources.
- Citations in the Compile Entity Resources dialog and in export, if writers ask for them.

### What This Is Not

- Not a reference manager: no shared library across projects, no sync with Zotero or similar in this feature.
- Not a change to how citations are made or stored (Feature 103's annotation `target` stays as is).
- Not the podcast or script compile formats (Run G's other half), which are a separate run **(owner)**.
- Not every CSL style: only a small bundled set until v2.
- Not checking that a citation is correct or that a quote matches its Source.

### Competitive Landscape

**Scrivener**
- Long-form writing app; writers insert citations through a reference manager and Scrivener passes placeholders through compile. Overlap: compile with citations. Difference: GetWrite would hold the Sources itself, so nothing breaks when the manager is not running. Worth learning: its compile options are deep but confusing; keep ours to one switch and one style choice.

**Zotero (with a word-processor plugin)**
- Free reference manager used by students and academics; the de facto CSL user. Overlap: CSL styles and bibliographies. Difference: Zotero does not hold the writer's prose or excerpts. Worth learning: its "item type plus fields" model is the proven shape for citation fields.

**Word and Google Docs built-in citations**
- Basic source lists and a handful of styles. Overlap: insert citation, generate bibliography. Difference: weak on archives, interviews and oral accounts; no link to excerpts. Worth learning: a short, fixed style list is enough for most writers.

**Pandoc with citeproc**
- Command-line converter used by technical writers; renders CSL citations into many formats. Overlap: the same rendering engine idea. Difference: needs hand-written markup and a separate bibliography file. Worth learning: one citation source rendered into many output formats.

The clearest differentiator is that the passage, its Source, the excerpt and the page are already linked inside the project, so the formatted note and bibliography come out of compile with no second tool and no re-keying.

### Caveats & Pitfalls

- **Adoption:** writers who already live in Zotero will not re-enter hundreds of references by hand; without import (v2) the feature suits new projects better than existing research.
- **Execution:** rendering footnotes differs in each output path (the PDF renderer, DOCX, Markdown, text, and the native Android PDF path from Feature 101); one format working says nothing about the others, and compile must stay byte-identical with citations off.
- **Assumption:** the concept assumes most citations already point at a Source with enough details. Citations made since Feature 103 have no citation fields filled, so the first compile of an existing project will show many gaps.
- **Licensing:** CSL styles and locales are CC BY-SA, and CSL engines carry their own licences (citeproc-js's licence terms have not been checked); bundling has to respect both.
- **Overlap:** citation fields could be ordinary custom fields; the owner chose fixed module fields, so the module must keep them out of the writer's own field lists and from clashing with fields the writer already made.

### Technical Considerations

- Worth exploring which CSL engine runs in the Next.js server, the Electron bundle and the Android static export alike (the Feature 101 PDF fix showed a Node-only library failing in the native build).
- Worth exploring whether citation fields are stored as a module-owned key on the Source sidecar rather than `userMetadata`, so they never collide with custom fields.
- Worth exploring how footnotes enter the compile pipeline: as a pass over the document before each renderer, so all four formats share one citation step.

### Open Questions

- Which reference types and which fields per type ship (book, chapter, article, newspaper, web page, interview, archival item, recording)?
- Is the style chosen per compile, per project, or both, and where is the project default stored?
- What does compile do with a citation whose Source is removed or whose required details are missing: skip it, render what it has with a marker, or refuse the compile?
- How does a locator type (page, timestamp, paragraph, line) map into each style's locator terms?
- Does a citation to an excerpt cite the excerpt's locator, the citation's own, or both?
- Does the bibliography list cited Sources only, and are Sources excluded from compile still cited?
- How are subsequent notes to the same Source handled (short form, "ibid.") in note styles?
- Does turning the module off hide only the compile option and the fields, leaving stored field values in place, as Claims and Narratives do?

### Next Steps

Ready to be specced against GetWrite's existing product spec: add a user story and requirements to `specs/product/getwrite.md` with write-product-spec, add the feature to `specs/product/getwrite.features.md` with break-into-features, then write the feature spec with write-feature-spec.
