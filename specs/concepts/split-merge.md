## Concept: Split and merge documents, with lineage

### Problem & Value

A writer's documents rarely stay the shape they started in. A chapter grows until it holds four scenes. An imported file arrives as one long block. Three Inbox captures turn out to be one idea. Today the only way to reshape them is to copy and paste between documents. That loses the link between the text and its past: the moved passage's revisions stay behind in the old document, its notes and citations are left detached, and nothing records where the new document came from. Writers either live with documents in the wrong shape or restructure by hand and lose context. GetWrite now anchors a lot to passages (annotations, citations, claims, mentions), so the cost of a hand-made restructure grows with every feature that ships.

### Target Audience

- **Primary:** novelists and long-form writers who draft in large chunks, then break them into scenes or chapters, or fold fragments back together. Both directions come up equally.
- **Secondary:** nonfiction and research writers whose passages carry citations, claims and notes. Moving text by hand breaks those links.
- **Secondary:** writers bringing in work through import or the Inbox, where the shape of a document is decided by how it arrived, not by the story.

### Core Concept

Split takes a document and a cursor position and makes two documents: the text before the cursor stays in the original, and the text after it becomes a new document placed right after it in the tree. Merge takes two or more documents and appends their text, in tree order, to the first.

Neither operation rewrites history. The original document keeps every revision it had. A new document from a split records that it came from the original at a named revision. That is shared lineage: the past is not copied, but the writer can always trace where the text came from. A document absorbed by a merge is not deleted. It stays in the tree, marked as merged into the target, until the writer removes it. So a merge can be inspected and undone by hand, and nothing silently disappears.

Text in GetWrite is not just characters. Passages carry notes, citations, claims and detected mentions, and documents carry status, POV and custom fields. A split or merge asks the writer each time what should travel with the text, rather than guessing, because the right answer differs: a scene split from a chapter usually keeps the chapter's POV, while two captures merged into a draft usually don't share a status.

### Key Capabilities

- Writers can split a document at the cursor into two documents, with the new one placed directly after the original.
- Writers can merge two or more selected documents into the first, with the text joined in tree order.
- The original keeps its full revision history, and a split-off document shows which document and revision it came from.
- A merged-away document stays visible, marked as merged into its target, until the writer removes it.
- Writers choose, in the split or merge dialog, what carries over: notes, citations and claims with their passages, and metadata such as status, POV and custom fields.
- Derived data stays correct after the change: backlinks, mentions, search and word counts reflect the new shape.
- Every split or merge can be undone by the writer without losing text.

### Feature Milestones

**MVP**
- Split at the cursor, with lineage recorded. It is the smaller, more common half, and it proves the lineage model.
- Merge two or more documents into the first, with the others kept and marked as merged. This completes "both directions equally".
- A carry-over dialog for annotations and metadata. Without it, either operation silently breaks links or invents values.
- Derived indexes (backlinks, mentions, search, word counts) updated on the spot. Otherwise the writer sees stale data at once.

**v1**
- A lineage view in the document's history: "split from X at revision N", "merged into Y". It turns the record into something the writer can use.
- Split at every heading of a chosen level in one step. Imported files need this most.
- Split and merge on Android, and on a paired device under the existing limits, if MVP is desktop and web only.

**v2**
- Unmerge: restore the merged-away documents and remove their text from the target, using the recorded lineage.
- Split at a selection: the selected range becomes its own document, leaving the text before and after in place.

### What This Is Not

- Not Alternates (runway item 3). This does not keep several live versions of one scene.
- Not collaboration or merge-conflict resolution between devices. "Merge" here means joining documents, not reconciling edits.
- Not a general move-text-between-documents tool beyond split and merge.
- Not a change to how canonical revisions work. Each document still has exactly one canonical revision.

### Competitive Landscape

**Scrivener**
- A long-form writing app with a binder of documents.
- Overlaps: it offers split at selection and merging documents, and writers use both heavily. (Exact behaviour from memory, not checked.)
- Differs: I'm not aware of it recording lineage between the pieces, or keeping the merged-away documents. As I recall, merge folds them into one.
- To adopt: one-step split, reached from a menu and a shortcut, with no dialog for the common case.

**Ulysses**
- A sheet-based Markdown writing app.
- Overlaps: as I recall, it can split a sheet at the cursor and "glue" sheets together. Not checked.
- Differs: sheets carry little structured metadata or passage-anchored data, so the carry-over problem barely exists there.
- To adopt: glued sheets read as one while staying separate. That suggests a merge can be shown before it's committed.

**Obsidian (Note composer)**
- A core plug-in in the Markdown notes app that extracts a selection to a new note or merges one note into another.
- Overlaps: both directions, with links fixed up.
- Differs: no revision history, so there is no lineage question.
- To adopt: updating links that point at the moved text, which matches GetWrite's backlinks.

**Copy and paste (today in GetWrite)**
- Overlaps: it reaches the same text layout.
- Differs: notes detach, history stays behind and nothing records the move.

**The difference:** GetWrite's text carries things the others don't keep: revisions, notes, citations, claims and mentions. The value is that restructuring keeps all of them true and traceable. The structure changes; what the writer knows about the text does not get lost.

### Caveats & Pitfalls

- **Adoption:** writers used to copy and paste may not find split and merge unless they sit where the hand is: the editor's context menu, the tree's context menu, the command palette and a shortcut.
- **Execution:** carrying passage-anchored data through a split is harder than it looks. A note whose passage straddles the cursor belongs to neither half cleanly. A citation's anchor must move with its exact text. Mentions and backlinks must be recomputed, not copied.
- **Execution:** "kept, marked merged" leaves documents that still compile, export, count toward goals and show in search. Each of those surfaces needs a rule, or merged-away text appears twice in a compile.
- **Assumption:** "ask each time" assumes writers want to decide what carries over on every operation. Frequent splitters may find a dialog tiresome and want a remembered default.
- **Assumption:** shared lineage is only useful if it is shown somewhere. A record nobody can see is cost without value until the v1 lineage view.

### Technical Considerations

- Worth exploring: lineage as a small record in the sidecar (source document, source revision, operation, date) rather than copied revisions. It's cheap, survives Trash and restore, and needs no change to canonical-revision rules.
- Worth exploring: doing each split or merge as one locked operation across all affected files, so a failure leaves neither document half-changed.
- Worth exploring: reusing the shared derived-index rebuild for the affected documents only, rather than a whole-project reindex.

### Open Questions

- Does a merged-away document stay in compile, export, goals and search, or is it excluded automatically while marked merged?
- Where does a note whose passage spans the split point go: the first half, the second half, or both?
- Is undo an editor-level undo right after the operation, a restore from the lineage record, or both?
- Is MVP desktop and hosted web only, with Android and paired devices later? Is a split or merge refused on a locked project, as other writes are?
- Should the carry-over dialog remember the writer's last choices as the default?
- What does the merge join with between documents: nothing, a blank line, a scene separator, or the absorbed document's title as a heading?

### Next Steps

The concept is ready to spec. It carries into the product spec as a new user story with its requirements (write-product-spec, amending GetWrite's product spec), then into a feature spec (write-feature-spec) once the open questions above are triaged.
