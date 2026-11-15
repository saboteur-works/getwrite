# Task 2: FR-1 (a) licence facts from the upstream files

Run by the lead on 2026-11-14. Each candidate and each CSL repository was cloned shallow (`git clone --depth 1 https://github.com/<repo>.git`) into the session scratchpad (`…/scratchpad/engines/`), outside the repo. Nothing was installed into GetWrite and no `package.json` was edited. Values below are copied from the files named. This record states facts and questions only; it makes no recommendation and gives no legal opinion.

## Pinned sources

| Item | Repository | Commit (HEAD of default branch) | Commit date | Version |
|---|---|---|---|---|
| A: citeproc-js | `Juris-M/citeproc-js` | `56e7ef310154748368665cc8a2be124e3c141832` | 2026-11-10 | `package.json` `"version": "2.4.63"` |
| B: Hayagriva | `typst/hayagriva` | `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04` | 2026-10-23 | `Cargo.toml` `version = "0.10.1"` |
| CSL styles | `citation-style-language/styles` | `3c3995baaa0c4fe1e5c6328027ff6d985c07bfde` | 2026-11-13 | n/a |
| CSL locales | `citation-style-language/locales` | `14940e56f7c783e4173cafbd92e0f5856f2caa14` | 2026-11-13 | n/a |

## A: citeproc-js

- `LICENSE`: "This program is free software: you can redistribute it and/or modify it under EITHER the terms of the Common Public Attribution License (CPAL) as published by the Open Source Initiative, either version 1 of the CPAL, or (at your option) any later version; OR the terms of the GNU Affero General Public License (AGPL) as published by the Free Software Foundation, either version 3 of the AGPL, or (at your option) any later version." Copyright line: "Copyright (c) 2009-2019 Frank Bennett".
- `package.json`: `"license": "CPAL-1.0 OR AGPL-1.0"`. **The two disagree on the AGPL version** (`LICENSE` says AGPL 3 or later, `package.json` says AGPL-1.0). Only the CPAL option is a candidate (spec FR-1), so the discrepancy is recorded, not resolved.
- Full CPAL text: `citeproc-js/CPAL` ("Common Public Attribution License Version 1.0 (CPAL-1.0)").
- CPAL section 14 (Additional Term: Attribution), copied: the Original Developer may require "that each time an Executable and Source Code or a Larger Work is launched or initially run (which includes initiating a session), a prominent display of the Original Developer's Attribution Information … must occur on the graphic user interface employed by the end user to access such Covered Code (which may include display on a splash screen)". Attribution Information is limited to "a copyright notice including the name of the Original Developer; … a word or one phrase (not exceeding 10 words); … one graphic image …; and … a URL". "If Exhibit B does not include any Attribution Information, then there are no requirements …".
- CPAL section 15 (Additional Term: Network Use), copied: "You must treat any External Deployment by You of the Original Code or Modifications as a distribution under section 3.1 and make Source Code available under Section 3.2."
- `CPAL` Exhibit A names "The Original Code is citeproc-js" and "The Initial Developer of the Original Code is Frank Bennett".
- `CPAL` Exhibit B (Attribution Information), copied in full:
  - "Attribution Copyright Notice: (c) Frank Bennett"
  - "Attribution Phrase (not exceeding 10 words): citeproc-js implements the Citation Style Language"
  - "Attribution URL: https://citationstyles.org/"
  - "Graphic Image as provided in the Covered Code, if any."
  - "Display of Attribution Information is required in Larger Works which are defined in the CPAL as a work which combines Covered Code or portions thereof with code not governed by the terms of the CPAL."

## B: Hayagriva

- `Cargo.toml`: `license = "MIT OR Apache-2.0"`. Licence texts: `LICENSE-MIT`, `LICENSE-APACHE`.
- `NOTICE`, copied: "The Creative Commons BY-SA 3.0 DEED License applies to: * The CSL styles found in `tests/data/*` * The CSL styles and locales found in `archive/`".

## Bundled style: Chicago notes and bibliography

- The repository has `chicago-notes-bibliography.csl`, titled "Chicago Manual of Style 18th edition (notes and bibliography)" (id `http://www.zotero.org/styles/chicago-notes-bibliography`, updated 2025-02-09), and a separate `chicago-notes-bibliography-17th-edition.csl`. The spec names "Chicago notes and bibliography" without an edition; which file is bundled is not decided here.
- `<rights license="http://creativecommons.org/licenses/by-sa/3.0/">This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License</rights>`.
- Author metadata: Andrew Dunning.
- `styles/README.md`, Licensing, copied: "All styles in this repository are released under the Creative Commons Attribution-ShareAlike 3.0 Unported license. For attribution, any software using CSL styles from this repository must include a clear mention of the CSL project and a link to https://citationstyles.org/. When redistributing styles, the listings of authors and contributors in the style metadata must be kept as is."

## Bundled locale: en-US

- `locales-en-US.xml`: same CC BY-SA 3.0 `<rights>` line; updated 2026-01-10; 5 translators listed (Andrew Dunning, Sebastian Karcher, Rintze M. Zelle, Denis Meier, Brenton M. Wiernik).
- `locales/README.md`, Licensing, copied: "All the locale files in this repository are released under the Creative Commons Attribution-ShareAlike 3.0 Unported license. For attribution, any software using CSL locale files from this repository must include a clear mention of the CSL project and a link to CitationStyles.org. When distributing these locale files, the listings of translators in the locale metadata must be kept as is."

## GetWrite's own licence

`LICENSE.md`: "Functional Source License, Version 1.1, ALv2 Future License"; `package.json` `"license": "FSL-1.1-ALv2"`.

## Questions for a legal read (not answered here)

1. Is distributing citeproc-js under CPAL-1.0 inside GetWrite (an FSL-1.1-ALv2 desktop app, hosted web service and Android app) compatible with FSL-1.1-ALv2, given CPAL's file-level copyleft (MPL 1.1 basis)?
2. Exhibit B requires a prominent display of the attribution (notice, phrase, URL) "each time … a Larger Work is launched or initially run … on the graphic user interface". Would an App Settings "Licences" entry (the Gate 3 decision for OQ-14) satisfy this, or is a display at launch (splash or start screen) required?
3. Section 15 treats hosted use ("External Deployment") as distribution requiring source availability of the covered code. What does GetWrite's hosted service have to offer for unmodified citeproc-js?
4. Is bundling unmodified CC BY-SA 3.0 style and locale files in an FSL-1.1-ALv2 product compatible with CC BY-SA, provided author and translator metadata are kept and the CSL project is credited with a link to citationstyles.org?
5. Hayagriva's MIT OR Apache-2.0: which option, and what notice does the chosen one require in a distributed app?

## Not done here

- No engine was run (Tasks 4 to 6).
- The npm-published `citeproc` package installed by the owner into the scratchpad has not yet been compared with the repository's `LICENSE` and `package.json`; that comparison is added when the install is present.
