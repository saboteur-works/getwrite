# Scrivener 3 (Mac) project format digest — structure only

Derived from one real Scrivener 3.5.2 Mac project. Contains element/attribute NAMES, nesting, occurrence counts, and values ONLY for Scrivener's own enum-like format attributes. No titles, IDs, keyword/label/status names, field values, or prose.

Notation: `Name ×N @attr1 @attr2 (text)` — ×N = occurrences; (text) = element carries text content. `Children/BinderItem…` collapses arbitrary nesting depth.

## .scrivx

```
ScrivenerProject ×1 @Author @Creator @Device @Identifier @ModID @Modified @Version
  Binder ×1
    BinderItem ×7 @Created @Modified @Type @UUID
      Title ×7  (text)
      MetaData ×7
        IncludeInCompile ×7  (text)
      CorkboardAndOutliner ×2
        SelectedSubdocumentUUIDs ×2  (text)
        OutlinerExpandedState ×1
          ItemID ×1  (text)
      Children ×7
        BinderItem… ×23 @Created @Modified @Type @UUID
          Title ×16  (text)
          TextSettings ×20
            TextSelection ×20  (text)
          CorkboardAndOutliner ×1
            SelectedSubdocumentUUIDs ×1
            OutlinerExpandedState ×1
              ItemID ×1  (text)
          Children ×7
            BinderItem… ×32 @Created @Modified @Type @UUID
              Title ×31  (text)
              MetaData ×27
                SectionType ×1  (text)
              TextSettings ×32
                TextSelection ×32  (text)
              CorkboardAndOutliner ×5
                SelectedSubdocumentUUIDs ×5  (text)
              Children ×11
                BinderItem… ×33 @Created @Modified @Type @UUID
                  Title ×26  (text)
                  MetaData ×20
                    StatusID ×12  (text)
                    NotesTextSelection ×8  (text)
                    CustomMetaData ×11
                      MetaDataItem ×44
                        FieldID ×44  (text)
                        Value ×44  (text)
                  TextSettings ×33
                    TextSelection ×33  (text)
                  Keywords ×3
                    KeywordID ×7  (text)
                StatusID ×6  (text)
                NotesTextSelection ×6  (text)
                    LabelID ×1  (text)
                    IncludeInCompile ×7  (text)
          MetaData ×21
            IncludeInCompile ×18  (text)
                IncludeInCompile ×17  (text)
                IconFileName ×2  (text)
                    IconFileName ×1  (text)
            IconFileName ×3  (text)
      TextSettings ×4
        TextSelection ×4  (text)
            SectionType ×1  (text)
                CustomMetaData ×5
                  MetaDataItem ×12
                    FieldID ×12  (text)
                    Value ×12  (text)
              Keywords ×1
                KeywordID ×2  (text)
        IconFileName ×1  (text)
            FileExtension ×3  (text)
  Collections ×1
    Collection ×2 @Color @ID @Type
      Title ×2  (text)
      SearchSettings ×1 @CaseSensitive @IgnoreDiacritics @Operator @Type (text)
  Keywords ×1
    Keyword ×1 @ID
      Title ×1  (text)
      Color ×1  (text)
      Children ×1
        Keyword ×3 @ID
          Title ×3  (text)
          Color ×3  (text)
          Children ×3
            Keyword ×5 @ID
              Title ×5  (text)
              Color ×5  (text)
              Children ×2
                Keyword ×2 @ID
                  Title ×2  (text)
                  Color ×2  (text)
  SectionTypes ×1
    TypeDefinitions ×1
      Type ×4 @ID (text)
    LevelTypes ×1
      Folders ×1
        Type ×3  (text)
      Containers ×1
        Type ×1  (text)
      Files ×1
        Type ×1  (text)
  LabelSettings ×1
    Title ×1  (text)
    DefaultLabelID ×1  (text)
    Labels ×1
      Label ×7 @Color @ID (text)
  StatusSettings ×1
    Title ×1  (text)
    DefaultStatusID ×1  (text)
    StatusItems ×1
      Status ×8 @ID (text)
  CustomMetaDataSettings ×1
    MetaDataField ×5 @Align @DateType @ID @Type @Wraps
      Title ×5  (text)
      ListOptions ×2 @None
        Option ×8 @ID (text)
      DateFormat ×2
  ProjectTargets ×1 @Notify
    DraftTarget ×1 @CountIncludedOnly @CurrentCompileGroupOnly @Deadline @IgnoreDeadline @Type (text)
    SessionTarget ×1 @AllowNegatives @CanWriteOnDeadlineDate @CountDraftOnly @DeterminedFromDeadline @NextResetDate @ResetTime @ResetType @Type @WritingDays (text)
    PreviousSession ×1 @Characters @Date @Words
  RecentWritingHistory ×1 @Date
    DraftWordCount ×1  (text)
    DraftCharCount ×1  (text)
    OtherWordCount ×1  (text)
    OtherCharCount ×1  (text)
  TemplateFolderUUID ×1  (text)
  PrintSettings ×1 @BottomMargin @Collates @HorizontalPagination @HorizontallyCentered @LeftMargin @Orientation @PagesAcross @PagesDown @PaperSize @PaperType @RightMargin @ScaleFactor @TopMargin @VerticalPagination @VerticallyCentered
```

### Enum-like values observed

- `/ScrivenerProject/Binder/BinderItem@Type`: Folder ×4, DraftFolder ×1, ResearchFolder ×1, TrashFolder ×1
- `/ScrivenerProject/Binder/BinderItem/MetaData/IncludeInCompile#text`: Yes ×7
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem…@Type`: Text ×14, Folder ×6, Other ×3
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem………/Children/BinderItem…@Type`: Text ×22, Folder ×10
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem……………/Children/BinderItem………/Children/BinderItem…@Type`: Text ×33
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem…………………/Children/BinderItem……………/Children/BinderItem………/MetaData/IncludeInCompile#text`: Yes ×7
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem………/MetaData/IncludeInCompile#text`: Yes ×18
- `/ScrivenerProject/Binder/BinderItem/Children/BinderItem……………/Children/BinderItem………/MetaData/IncludeInCompile#text`: Yes ×17
- `/ScrivenerProject/Collections/Collection@Type`: Binder ×1, RecentSearch ×1
- `/ScrivenerProject/CustomMetaDataSettings/MetaDataField@Type`: List ×2, Date ×2, Text ×1
- `/ScrivenerProject/CustomMetaDataSettings/MetaDataField@DateType`: Short+Time ×2
- `/ScrivenerProject/CustomMetaDataSettings/MetaDataField@Wraps`: No ×1
- `/ScrivenerProject/CustomMetaDataSettings/MetaDataField@Align`: Left ×1

Timestamp attribute format (Created/Modified): `YYYY-MM-DD HH:MM:SS ±HHMM`.

## Files/Data/<UUID>/ file names

- `content.rtf` ×61
- `synopsis.txt` ×29
- `notes.rtf` ×14
- `content.styles` ×9
- `content.xml` ×3

## Other top-level files

- `<ProjectName>.scrivx`
- `Files/binder.autosave`
- `Files/binder.autosave.zip`
- `Files/binder.backup`
- `Files/search.indexes`
- `Files/search.indexes.xml`
- `Files/styles.xml`
- `Files/version.txt`
- `Files/writing.history`
- `Files/writing.history.xml`

## Snapshots/<UUID>.snapshots/index.xml

```
Snapshots ×1 @Version
  Snapshot ×2
    Title ×2  (text)
    Date ×2  (text)
    Comments ×1
      Comment ×1 @Collapsed @Color @ID (text)
```
Snapshot dirs: 16; snapshot .rtf files: 35

## RTF control words used (content.rtf + notes.rtf, by file count)

`\ansi` 75, `\ansicpg` 75, `\blue` 75, `\cf` 75, `\colortbl` 75, `\f` 75, `\fcharset` 75, `\fonttbl` 75, `\fs` 75, `\green` 75, `\pard` 75, `\red` 75, `\rtf` 75, `\tx` 73, `\fi` 61, `\fmodern` 60, `\i` 58, `\b` 38, `\cocoaplatform` 38, `\cocoartf` 38, `\cocoatextscaling` 38, `\expandedcolortbl` 38, `\partightenfactor` 38, `\uc` 38, `\deff` 37, `\fprq` 37, `\loch` 37, `\ltrch` 37, `\margb` 37, `\margl` 37, `\margr` 37, `\margt` 37, `\paperh` 37, `\paperw` 37, `\plain` 37, `\deftab` 36, `\pardeftab` 36, `\par` 32, `\u` 32, `\af` 31, `\dbch` 31, `\hich` 31, `\fnil` 12, `\li` 12, `\emdash` 11, `\sl` 11, `\slmult` 11, `\sb` 10, `\fswiss` 9, `\ilvl` 8, `\levelfollow` 8, `\levelindent` 8, `\leveljc` 8, `\leveljcn` 8, `\levelmarker` 8, `\levelnfc` 8, `\levelnfcn` 8, `\levelnumbers` 8, `\levelspace` 8, `\levelstartat` 8, `\leveltemplateid` 8, `\leveltext` 8, `\lin` 8, `\list` 8, `\listhybrid` 8, `\listid` 8, `\listlevel` 8, `\listname` 8, `\listoverride` 8, `\listoverridecount` 8, `\listoverridetable` 8, `\listtable` 8, `\listtemplateid` 8, `\listtext` 8, `\ls` 8, `\sa` 5, `\field` 3, `\fldinst` 3, `\fldrslt` 3, `\line` 2, `\nosupersub` 2, `\pardirnatural` 2, `\super` 2, `\c` 1, `\csgenericrgb` 1, `\froman` 1

## Cross-references (measured)

Measured against a real Scrivener 3.5.2 Mac project run through the CLI importer (aborted mid-run on `<MetaDataItem>` missing `ID`) and a separate offline element/attribute vocabulary diff and RTF converter run over the same project's files.

- StatusID / LabelID / KeywordID / MetaDataItem-FieldID resolution: 18/18 StatusID values, 1/1 LabelID value, 9/9 KeywordID values, and 56/56 MetaDataItem/FieldID values resolve to a `Status@ID`, `Label@ID`, `Keyword@ID`, or `CustomMetaDataSettings/MetaDataField@ID` respectively. One `StatusID` value is `-1`; its meaning is unconfirmed (plausibly "No Status").
- List-type custom field values store the `ListOptions/Option@ID`, not the option's text: 28/28 measured List-type `MetaDataItem/Value` entries matched an `Option@ID`; 0 matched an `Option`'s text content. The importer must resolve the ID to the option's text.
- Date-type custom field values occur in two shapes: `YYYY-MM-DD HH:MM:SS.fffff ±HHMM` (16 occurrences) and `YYYY-MM-DD HH:MM:SS ±HHMM` (6 occurrences) — the latter is the same shape as the `BinderItem@Created`/`@Modified` timestamp format noted above, the former adds sub-second precision.
- 15 `Type="Text"` BinderItems have no child `<Title>` element at all (untitled documents) — `Title` is optional per-item, not guaranteed.
- The real project has 0 keywords sharing a leaf name across different parent keywords — the leaf-name merge case (FR-15) is exercised only by the synthetic fixture, not by any real-project measurement.
- The source `.scriv` directory was byte-identical (214 files hashed) before and after the aborted real-project run.

### RTF converter run (75 content.rtf/notes.rtf files, real project)

75 files converted, 0 threw. Formatting marks produced: `bold` spans 81, `italic` spans 66.

Text-bearing control words dropped (not currently converted, losing visible text/formatting):
- `\emdash` — 86 occurrences; em dashes vanish from converted prose.
- `\line` — 14 occurrences; soft line breaks within a paragraph are lost.
- `\listtext` / `\ls` / `\ilvl` — 84 / 34 / 81 occurrences; list bullet/number markers and nesting level are lost (the list item's own text content survives as plain text).
- `\super` / `\nosupersub` — 5 / 5 occurrences; superscript/subscript formatting is lost (text survives).

Layout-only control words recorded as present but carrying no text or visible-formatting loss (~3,100 total occurrences across the run): `\af` 1059, `\loch` 613, `\hich` 439, `\dbch` 353, `\ltrch` 174, `\paperw`/`\paperh`/`\margl`/`\margr`/`\margt`/`\margb` 37 each, `\partightenfactor` 49, `\pardeftab` 47, `\deftab` 36, `\expandedcolortbl` 38, `\pardirnatural` 2.

## Third pass: RTF importer defects measured against the owner's real project (2026-09-11, Gate 5)

Measured by re-importing the owner's 61-`content.rtf` real project through the (second-pass) importer and inspecting the result. All figures below are measurements against that imported project and its source files, not inferences.

### Stray hex-escape digits in imported prose

The converter drops the backslash of a `\'XX` escape and leaves the two hex digits in the text (e.g. `New Year92s Eve`, `93You have the next round?94`). Measured in the imported project: 2,801 stray digit pairs across 30 of 60 imported documents — `92` ×1454, `94` ×806, `93` ×241, `97` ×212, `85` ×88.

Measured in the source (`content.rtf` + `notes.rtf` combined), the full `\'XX` escape inventory, decoded value, and count:

| Escape | Decodes to | Count |
| --- | --- | --- |
| `\'92` | ’ (right single quote) | 1839 |
| `\'93` | “ (left double quote) | 1574 |
| `\'94` | ” (right double quote) | 1565 |
| `\'97` | — (em dash) | 254 |
| `\'85` | … (ellipsis) | 122 |
| `\'91` | ‘ (left single quote) | 108 |
| `\'01` | 0x01 (C0 control character) | 26 |
| `\'95` | • (bullet) | 21 |
| `\'ed` | í | 6 |
| `\'3F` | ? | 2 |
| `\'a0` | U+00A0 (non-breaking space) | 2 |
| `\'e9` | é | 1 |
| `\'f1` | ñ | 1 |
| `\'e8` | è | 1 |

55 of 61 source `content.rtf` files use one or more `\'XX` escapes. The document's `\ansicpg` declares the code page these bytes decode against; the sample project declares `\ansicpg1252` (Windows-1252) throughout the survey.

### Lost paragraph structure

34 of 61 source `content.rtf` files contain no `\par` at all; they terminate every paragraph with a bare backslash immediately followed by a newline (the Cocoa/macOS RTF convention), measured 1,770 times across those files, up to 155 occurrences in a single file. The (second-pass) converter handled only `\par` (731 word-boundary occurrences across all 61 files — an earlier figure of "1,022" was wrong: it substring-matched `\pard`, `\pardeftab`, and `\pardirnatural` in addition to `\par` itself) and `\line` (14 occurrences).

Measured result of importing without backslash-newline support: 34 of the 60 imported documents are a single paragraph (median paragraphs per imported document: 1); one 1,944-word scene imports as one block. The same fault surfaces in imported notes fields, where sentences run together (e.g. `scene?Establish`).

### Report noise (FR-14 silent-ignore list incomplete)

Of 80 "Skipped Items" entries in the real import's report, 67 are layout-only control words FR-14 already says to ignore silently but the implementation had not yet covered: `\pardeftab` (39) and `\deftab` (28). Only 13 entries were genuine (a hyperlink, superscript).

### Owner decisions arising from these measurements

See `specs/features/scrivener-cli-importer.md` FR-8, FR-14, and FR-21 (amended 2026-09-11, Gate 5, third measured pass) and OQ-16 through OQ-19 for the resulting requirements: general `\ansicpg`-driven Windows-code-page decoding of `\'XX` (with an unsupported code page as an FR-8 skip); dropping decoded C0 control characters with one report entry per affected document; `\ucN` ANSI-fallback-byte skip semantics; backslash-newline as a paragraph break alongside `\par` (distinct from an escaped `\\` and from a control word split across a line); and `\deftab`/`\pardeftab` joining the silent-ignore list.
