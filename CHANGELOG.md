# Changelog

## [0.2.32](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.31...getwrite-v0.2.32) (2026-05-19)


### Features

* add full-text search API route, search snippet model, and user preference for result limit ([95cf9e5](https://github.com/saboteur-works/getwrite/commit/95cf9e554730c3c68627a44905d0cb654a02a319))
* add SearchFilterPanel with folder, status, and tag filters ([3c8a462](https://github.com/saboteur-works/getwrite/commit/3c8a4622f73388ba0e8b805ef4fe5794fd8f5ea5))
* **search:** full-text search with ranking, filters, and scrollable results ([9555ac3](https://github.com/saboteur-works/getwrite/commit/9555ac38e1003e1a3bbf45bcabd4e03db4923216))
* **search:** proximity scoring for multi-term queries ([fc686b5](https://github.com/saboteur-works/getwrite/commit/fc686b5b3c552e6589b04f89e920200d1dc7e2b1))
* **search:** stop word filtering and background reindex of existing content ([87a7c3b](https://github.com/saboteur-works/getwrite/commit/87a7c3b30fbc2bffd50539bff72607826a34886a))
* **search:** title boosting — resources named after query terms rank first ([f81b239](https://github.com/saboteur-works/getwrite/commit/f81b23901a92107921fa64cd711837b9e048f19b))
* wire SearchBar to full-text search API via Redux slice ([3373815](https://github.com/saboteur-works/getwrite/commit/337381570b52d4b72611e9b4b55266a087664a06))


### Bug Fixes

* **search:** AND semantics for multi-term queries; center snippet on full phrase ([d7ae273](https://github.com/saboteur-works/getwrite/commit/d7ae27362e64251b274c03c201b9977572a8577e))
* **search:** read status from userMetadata.status, not top-level statuses array ([4ae8900](https://github.com/saboteur-works/getwrite/commit/4ae8900218715c7003a0dd3cdee5cfd093dfa545))
* **search:** remove hardcoded 8-result cap and add scrollable results list ([0d5d045](https://github.com/saboteur-works/getwrite/commit/0d5d04540d0bb6ec294568d00861c67c0de826e0))
* **search:** show snippet text and highlight matched terms in results ([283675c](https://github.com/saboteur-works/getwrite/commit/283675ce1bf49303d56fbf23f1887ea914730b92))

## [0.2.31](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.30...getwrite-v0.2.31) (2026-05-19)


### Features

* add normalizePastedHTML pure function with full test coverage ([e817a9e](https://github.com/saboteur-works/getwrite/commit/e817a9ec3a16d7f4c448e75e2b913a4ad8df82ef))
* normalize pasted text and replace StripExternalPasteColor ([e4e17e3](https://github.com/saboteur-works/getwrite/commit/e4e17e3f3fd8535349415ed0f4c78d769f35f845))
* replace StripExternalPasteColor with NormalizePastedText extension ([b080a1d](https://github.com/saboteur-works/getwrite/commit/b080a1d32737b17035135162f9c18e2e63bb4951))

## [0.2.30](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.29...getwrite-v0.2.30) (2026-05-19)


### Features

* **editor:** add StripExternalPasteColor extension to strip color on external paste ([725e521](https://github.com/saboteur-works/getwrite/commit/725e521564bb2ef194dafefa0fd23d9aff6a792c))
* **editor:** strip inline color from externally pasted text ([fd2550b](https://github.com/saboteur-works/getwrite/commit/fd2550b02548f1901edebc2c8be4201720dd3c06))

## [0.2.29](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.28...getwrite-v0.2.29) (2026-05-19)


### Features

* **api:** add POST /api/project/metadata-schema route (Task 5) ([6191a7d](https://github.com/saboteur-works/getwrite/commit/6191a7dc057419dba7c200309ed4eb89dcd25983))
* **chip:** add chip BEM CSS classes to getwrite-utilities.css ([a810d28](https://github.com/saboteur-works/getwrite/commit/a810d28d542367d5dbbb39e9073e3ad456ce9b0a))
* **chip:** add onDismiss prop with lucide X icon and propagation guard ([4fbb3f6](https://github.com/saboteur-works/getwrite/commit/4fbb3f67cb0c271fbae1e79484629afac7e929b6))
* **chip:** add tooltip prop with brand styling and WithTooltip story ([83135ce](https://github.com/saboteur-works/getwrite/commit/83135ce5a6dbcf8adfc4e127b003620e2518d928))
* **chip:** implement reusable Chip component with tests and Storybook story ([4339798](https://github.com/saboteur-works/getwrite/commit/43397984046466f410758583d43c050ba4e17c78))
* **dynamic-metadata:** dynamic metadata schema + multi-resource-ref field type ([6c8c54c](https://github.com/saboteur-works/getwrite/commit/6c8c54cd32e062cbf5e4ca324b2081ce2664cc24))
* **metadata:** add dynamic sidebar controls and stabilize related tests ([5e6f56b](https://github.com/saboteur-works/getwrite/commit/5e6f56b0093fd339e28b123a27d9a1e6ed840dcc))
* **models:** add metadata-schema CRUD model layer (Task 4) ([677f9f2](https://github.com/saboteur-works/getwrite/commit/677f9f205f2d3a9deb05751d54456df808f31fe8))
* **multi-resource-ref:** Task 1 — add type to schema union + spec and tasks ([bda6a94](https://github.com/saboteur-works/getwrite/commit/bda6a940bcbac5d3ca3907494bd8af318a6db95f))
* **multi-resource-ref:** Task 10 — maxSelections number input in SchemaManager ([a26955f](https://github.com/saboteur-works/getwrite/commit/a26955fb9f5de677201b7080a7e3673f90e8efc7))
* **multi-resource-ref:** Task 11 — Storybook stories for MultiResourceRefInput ([b4abd1d](https://github.com/saboteur-works/getwrite/commit/b4abd1decd24caa84198363bfbe001adac600bed))
* **multi-resource-ref:** Task 2 — add refFolder, includeSubfolders, maxSelections to schema ([c585191](https://github.com/saboteur-works/getwrite/commit/c585191d6db3cc58a49626c92880ee61d05bd9c1))
* **multi-resource-ref:** Task 3 — update-ref-properties across model, route, transport, and Redux ([2483359](https://github.com/saboteur-works/getwrite/commit/24833598da4af3684fec79f5b2b45bfb1dc87148))
* **multi-resource-ref:** Task 4 — MultiResourceRefInput chip-based control ([fcce8cd](https://github.com/saboteur-works/getwrite/commit/fcce8cd3ff4d92d597569e9eef8e00ce68e21169))
* **multi-resource-ref:** Task 5 — folder-scoped autocomplete candidates ([6202d0b](https://github.com/saboteur-works/getwrite/commit/6202d0baf76165d2fb4c344bb1c186d4612f5301))
* **multi-resource-ref:** Task 6 — max-selections enforcement ([a3cfff7](https://github.com/saboteur-works/getwrite/commit/a3cfff740cfaa628265fd30f5e4aa4e02289fc57))
* **multi-resource-ref:** Task 7 — wire MultiResourceRefInput into MetadataSidebar ([a1f660b](https://github.com/saboteur-works/getwrite/commit/a1f660bf2f749183234a30ea7e322f993e7e368a))
* **multi-resource-ref:** Task 8 — multi-resource-ref in SchemaManager type dropdown ([27b866c](https://github.com/saboteur-works/getwrite/commit/27b866c3ea9a0e478f77760bb05440df9bd1b7e6))
* **multi-resource-ref:** Task 9 — folder picker + Include Subfolders in SchemaManager ([15318e6](https://github.com/saboteur-works/getwrite/commit/15318e603b51fa88b52480540353812dfbbfe691))
* **redux:** add metadata schema CRUD thunks and transport service (Task 6) ([4226e79](https://github.com/saboteur-works/getwrite/commit/4226e79f0d347487090b68adb8ac2db15f0c3c59))
* **redux:** store metadataSchema in projectsSlice and expose selector (Task 3) ([9b290b7](https://github.com/saboteur-works/getwrite/commit/9b290b7f39f56569ba6b6b66e71b9549b75b0942))
* **schema-manager:** add field type selector; fix resource-ref autocomplete ([b587871](https://github.com/saboteur-works/getwrite/commit/b587871af269ff990e0da316455fe94897a9bcf8))
* **schema-manager:** build SchemaManager modal UI component (Task 12) ([df33bab](https://github.com/saboteur-works/getwrite/commit/df33bab47c46eea473442e84797d680ea5c9a5ba))
* **schema-manager:** implement field key rename with sidecar migration ([7d9ac78](https://github.com/saboteur-works/getwrite/commit/7d9ac78b62f14cc7715ddd5658171c67d1f4a5ae))
* **schemas:** add DEFAULT_METADATA_SCHEMA constant with seven built-in fields (Task 2) ([e6b56ec](https://github.com/saboteur-works/getwrite/commit/e6b56ec4f2e5d846d5a2b1bf5fba628f16ceed4c))
* **schemas:** add Zod schemas and TS types for dynamic metadata schema (Task 1) ([ca37782](https://github.com/saboteur-works/getwrite/commit/ca3778299abad129abaebe1685739b863fbea249))
* **settings:** wire SchemaManager into settings menu (Task 13) ([97adf2d](https://github.com/saboteur-works/getwrite/commit/97adf2d3fa559e5fa09616dd44bc931eba2a6b96))
* **sidebar:** add "Add field" footer button to MetadataSidebar (Task 11) ([61917cc](https://github.com/saboteur-works/getwrite/commit/61917ccc36294d835a086461e27372fc6a3d17b6))
* **sidebar:** lazy POV migration to ResourceRef on first edit (Task 7) ([4e2eff2](https://github.com/saboteur-works/getwrite/commit/4e2eff2d8b6a2a2547caf64d0ea4e9585ca0bcd6))
* **sidebar:** schema-driven MetadataSidebar rewrite (Task 10) ([cc04767](https://github.com/saboteur-works/getwrite/commit/cc04767c61086202f56f75860952c12b4e5b2ce4))
* **trash:** nullify resource-ref values project-wide on delete (Task 8) ([324b5da](https://github.com/saboteur-works/getwrite/commit/324b5da46747ceeda0fc22f9a8132c3a44c0e412))


### Bug Fixes

* **chip:** resolve nested interactive controls a11y violation ([dae139a](https://github.com/saboteur-works/getwrite/commit/dae139a8e0582bbc660b04ad2366821890ae4bab))
* **dynamic-metadata:** forward metadataSchema on project open ([638da71](https://github.com/saboteur-works/getwrite/commit/638da71b1307984e79a0a6641a643f6e159d3b43))
* **multi-resource-ref:** subfolder resources missing from autocomplete ([e7362ce](https://github.com/saboteur-works/getwrite/commit/e7362ce09893b092981e29b97cdf8767d036baa8))
* **pov:** expand autocomplete to all resources instead of characters-only ([9d5ddaa](https://github.com/saboteur-works/getwrite/commit/9d5ddaab0b71a8bcf112a0f91bc004ceb169f601))
* **schema-manager:** sync userMetadata key rename into Redux resources ([b342b06](https://github.com/saboteur-works/getwrite/commit/b342b064c8c20024645c34576d1039ea2d3bd71d))
* **sidebar:** sticky title and Add Field; scrollable content between ([a6b8efe](https://github.com/saboteur-works/getwrite/commit/a6b8efecc81440878749c1b9d9c21417d2429f7b))

## [0.2.28](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.27...getwrite-v0.2.28) (2026-05-17)


### Features

* **timeline:** adaptive chip variants, lane layout, and rich tooltips ([4737ce2](https://github.com/saboteur-works/getwrite/commit/4737ce296ec8dcf57ae08b24159afa1db1d3315a))
* **timeline:** add POV legend, chip hover/focus, scene count, and row separators ([7451ed7](https://github.com/saboteur-works/getwrite/commit/7451ed7a00da6840a5ec45af569b2a672ef7a9ec))
* **timeline:** apply STYLE.md spec — chips, toolbar, tooltip, layout ([9206ea9](https://github.com/saboteur-works/getwrite/commit/9206ea939c4831aa2cdbc9df5005cea74e8b3d8d))
* **timeline:** finalize Timeline View to match STYLE.md spec ([1fdfc14](https://github.com/saboteur-works/getwrite/commit/1fdfc146e14ab6d332af6ac3131e28a90021cfae))

## [0.2.27](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.26...getwrite-v0.2.27) (2026-05-17)


### Bug Fixes

* **editor:** added missing editor extensions ([e174fbc](https://github.com/saboteur-works/getwrite/commit/e174fbc2f4f002997864dfd8b2e84aa7c540049f))
* **editor:** finalize editor for V1 — list bugs, toolbar consolidation, focus fixes, view switching ([e518501](https://github.com/saboteur-works/getwrite/commit/e518501b44ee76d3cb75df8a312395ef6ff73e75))
* **editor:** fix all bullet/ordered list bugs (V1 blocker) ([23fb7e1](https://github.com/saboteur-works/getwrite/commit/23fb7e141e2100039df4e7c02216c60fae10f326))
* **editor:** fix immediate focus loss on font-size and line-height inputs ([d1db3e7](https://github.com/saboteur-works/getwrite/commit/d1db3e7c2b19aa83947535a6d610f49678664db3))
* **workarea:** allow data and timeline views when a text resource is selected ([b756f47](https://github.com/saboteur-works/getwrite/commit/b756f477ce70e5dca72d82014f2c6c15b366f20a))

## [0.2.26](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.25...getwrite-v0.2.26) (2026-05-17)


### Features

* **data-view:** add folder breakdown section to resource stats ([5bdcf65](https://github.com/saboteur-works/getwrite/commit/5bdcf65ef0b16e32e3e271db26d2661a2a900d4b))
* **data-view:** add folder jump button and fix live data in breakdown ([fe139b7](https://github.com/saboteur-works/getwrite/commit/fe139b7837238fa12fd2b2669c37e5e78b8367f5))
* **data-view:** add last-edited timestamps and sort toggle to resource list ([359978c](https://github.com/saboteur-works/getwrite/commit/359978ca7c95f6e4be6906ee7e6d35a61c2d3573))
* **data-view:** add word count goal progress bar ([760e1e4](https://github.com/saboteur-works/getwrite/commit/760e1e49955495b3919f0950a890c39336027521))
* **data-view:** finalize Data view with stats, breakdown, and resource list ([8ab53b3](https://github.com/saboteur-works/getwrite/commit/8ab53b3b260f77b24e66db9d4a553e88670b8262))
* **data-view:** make DataView sections collapsible ([35afc91](https://github.com/saboteur-works/getwrite/commit/35afc914226dcaf60cd9f38dfe3cca25e2a646be))
* **data-view:** make Resources and Breakdown sections scrollable ([b3b8770](https://github.com/saboteur-works/getwrite/commit/b3b8770dbd19168dba400ee4bd89896d0880b816))
* **data-view:** surface stub resources as 'needs content' in resource list ([49d333a](https://github.com/saboteur-works/getwrite/commit/49d333a127465a0981f6da0410af3a0f05fd14a6))
* **word-count:** centralise word counting and fix HTML inflation bug ([57f5c00](https://github.com/saboteur-works/getwrite/commit/57f5c007e1b8207448847e1994db96ef85e45d85))


### Bug Fixes

* **data-view:** add consistent vertical spacing between sections ([1825e49](https://github.com/saboteur-works/getwrite/commit/1825e49ec2408b3fa78e3478d4e69e9d12300bb8))
* **data-view:** prevent duplicate 'Unknown' keys in breakdown section ([bcd280d](https://github.com/saboteur-works/getwrite/commit/bcd280dc8b0085e0d87a2d48d237dcabd8b2f2d3))

## [0.2.25](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.24...getwrite-v0.2.25) (2026-05-16)


### Features

* **organizer:** Organizer v1 ([428448a](https://github.com/saboteur-works/getwrite/commit/428448a929ddb49ac1b5198411756805ac21c38f))

## [0.2.24](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.23...getwrite-v0.2.24) (2026-05-16)


### Bug Fixes

* **organizer:** scope view to selected folder and surface folders in selector ([5de3bb2](https://github.com/saboteur-works/getwrite/commit/5de3bb2319d30bb8d889c2a567c20be19eedb19f))

## [0.2.23](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.22...getwrite-v0.2.23) (2026-05-16)


### Bug Fixes

* **sidebar:** implement resource copy/duplicate and fix delete store sync ([6c5e0aa](https://github.com/saboteur-works/getwrite/commit/6c5e0aa307a01dcbfe19da6a628c6300c37a307e))
* **sidebar:** resource copy/duplicate, orphan surfacing, and tree selection ([a5e02ff](https://github.com/saboteur-works/getwrite/commit/a5e02ffacba287306637394a29adaf0451fd3cac))
* **tree:** also re-parent orphans whose parent is a non-folder resource ([c5d1ba2](https://github.com/saboteur-works/getwrite/commit/c5d1ba24614a206d58fd1ca9fbfd6cc593003f9a))
* **tree:** guard getItem against undefined during delete/rebuild timing gap ([86bdaaa](https://github.com/saboteur-works/getwrite/commit/86bdaaace7074b2075e0a772e8c388dc84f5933c))
* **tree:** surface orphaned resources at root and prevent create-on-non-folder orphans ([c7cef68](https://github.com/saboteur-works/getwrite/commit/c7cef68f97875cbc738f91197dca6de7ef0f67f6))

## [0.2.22](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.21...getwrite-v0.2.22) (2026-05-14)


### Bug Fixes

* **p0:** close canonical-guard and indexer-drain data-safety gaps ([c6c96fb](https://github.com/saboteur-works/getwrite/commit/c6c96fb62b6b16e3ae94a12aef1b4aaba1e20042))
* **p0:** close canonical-guard and indexer-drain data-safety gaps ([88ff1dd](https://github.com/saboteur-works/getwrite/commit/88ff1ddf46e690244dea59462264f1f25382f408))

## [0.2.21](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.20...getwrite-v0.2.21) (2026-05-14)


### Features

* add rename for resources and folders ([37b48e5](https://github.com/saboteur-works/getwrite/commit/37b48e529ace0cfb38797809539a84e18d2902e2))
* **close-project:** surface sync blockers in close-project confirm dialog ([4802df3](https://github.com/saboteur-works/getwrite/commit/4802df3092b3c1024b00d0900f65b8a0fe2cf322))
* **metadata:** add synopsis field to MetadataSidebar with full persistence ([1be7fde](https://github.com/saboteur-works/getwrite/commit/1be7fdef4177d18e7a8127428ec04501108ebb67))
* **metadata:** collapsible sections in MetadataSidebar ([b5fdb36](https://github.com/saboteur-works/getwrite/commit/b5fdb36c1af5ecc82e226c5f26cd63abb4e618f4))
* **metadata:** flexible duration units and end date/time with user override ([25b9a3b](https://github.com/saboteur-works/getwrite/commit/25b9a3b3c9a12fb0f57d75bd34c673c6272b0036))
* **revisions:** auto-create named canonical revision on text resource creation and add configurable default revision name setting ([93fcab4](https://github.com/saboteur-works/getwrite/commit/93fcab45024c2e5f9dad985edbbd9fbe9fca576c))


### Bug Fixes

* **e2e:** correct two test bugs uncovered by first lint+e2e run ([a1dad8e](https://github.com/saboteur-works/getwrite/commit/a1dad8eff8070a8f5d24f711324bd98a91a84cc9))
* **ordering:** make orderIndex a required invariant and fix the four-bug chain that caused Resource Tree reordering after metadata saves ([1efc897](https://github.com/saboteur-works/getwrite/commit/1efc897f472271857c259920aed99f6019574a81))
* **resource-tree:** tighten indentation, use constant, truncate long names ([acf09c7](https://github.com/saboteur-works/getwrite/commit/acf09c743c4eb2f9995ee7e6acf5fd287b43615e))
* **topbar:** omit project title when no project is loaded ([59d1ac3](https://github.com/saboteur-works/getwrite/commit/59d1ac3c76231c157af5970e7024d1307cce92b8))
* update tests broken by cleanup refactor ([dfa4579](https://github.com/saboteur-works/getwrite/commit/dfa4579a72337f4df6230bda65262642b3d2a109))

## [0.2.20](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.19...getwrite-v0.2.20) (2026-05-10)


### Bug Fixes

* remove deb target from Linux electron build ([57e114d](https://github.com/saboteur-works/getwrite/commit/57e114d171a9fe2bef4813acb9aba2925593d4be))

## [0.2.19](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.18...getwrite-v0.2.19) (2026-05-10)


### Bug Fixes

* trigger electron release build ([18185f9](https://github.com/saboteur-works/getwrite/commit/18185f9a6a07528432003a7a5bb0c89ae6e6424e))

## [0.2.18](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.17...getwrite-v0.2.18) (2026-05-10)


### Bug Fixes

* include Linux builds in releases 2 ([cfb6f5f](https://github.com/saboteur-works/getwrite/commit/cfb6f5f599057e7758ec99dcd12196543821c428))

## [0.2.17](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.16...getwrite-v0.2.17) (2026-05-10)


### Bug Fixes

* include Linux builds in releases ([b1e9e49](https://github.com/saboteur-works/getwrite/commit/b1e9e49761c26a358a5412c3dde9252f4d1ba5df))

## [0.2.16](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.15...getwrite-v0.2.16) (2026-05-10)


### Bug Fixes

* include Linux builds in releases ([c4042c7](https://github.com/saboteur-works/getwrite/commit/c4042c713ace47110271c56075d85bf5b33ad5fe))

## [0.2.15](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.14...getwrite-v0.2.15) (2026-05-10)


### Features

* enhance project type editor with word count goal and status management ([30eb075](https://github.com/saboteur-works/getwrite/commit/30eb075e0db6a81c58bab539d06b797b8dff3fd6))

## [0.2.14](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.13...getwrite-v0.2.14) (2026-04-25)


### Features

* added body and word count goal config ([32bfbdb](https://github.com/saboteur-works/getwrite/commit/32bfbdb080b57d6a9c6cb02683387e42791feaa3))
* added subfolders to templates ([0ab51a5](https://github.com/saboteur-works/getwrite/commit/0ab51a538c1d03f364327af70520d4bd764edc8e))

## [0.2.13](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.12...getwrite-v0.2.13) (2026-04-23)


### Features

* implement electron ([f56778f](https://github.com/saboteur-works/getwrite/commit/f56778f0049f1f78a7ba475f49bac08fb5d321a3))

## [0.2.12](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.11...getwrite-v0.2.12) (2026-04-23)


### Features

* implement new timeline view ([86f9371](https://github.com/saboteur-works/getwrite/commit/86f93713a686a9c802ec8e4c34352e5336952e58))


### Bug Fixes

* fixed error on updating metadata with new resources before reload ([f3df451](https://github.com/saboteur-works/getwrite/commit/f3df451bc2f0cba13a061e1509b386a6628781a1))
* fixed sidebar metadata regression ([156acee](https://github.com/saboteur-works/getwrite/commit/156acee28fdead1f74b40f9ff9cc703b06e9ae05))

## [0.2.11](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.10...getwrite-v0.2.11) (2026-04-16)


### Features

* implemented tag UI and stories; wired tag workflow into sidebar ([47a2a7e](https://github.com/saboteur-works/getwrite/commit/47a2a7e82ed209017c4c30dcbf83fe1e7268bbda))
* implemented tag UI and stories; wired tag workflow into sidebar ([7178be4](https://github.com/saboteur-works/getwrite/commit/7178be4c94ee088a0130c940e2bfe13172c2bb79))

## [0.2.10](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.9...getwrite-v0.2.10) (2026-04-16)


### Features

* implemented full diff view ([e504117](https://github.com/saboteur-works/getwrite/commit/e50411740e550acdb1314ed1bc8d196d717ae01e))

## [0.2.9](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.8...getwrite-v0.2.9) (2026-04-16)


### Features

* rework resource export flow ([e9fb245](https://github.com/saboteur-works/getwrite/commit/e9fb245bf7ce4510a77429978d7d7c8c34f24715))

## [0.2.8](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.7...getwrite-v0.2.8) (2026-04-15)


### Features

* Add basic PDF export with font fallback ([0059ac8](https://github.com/saboteur-works/getwrite/commit/0059ac8823e0c6d99455bfc2cf83521b7d60f69f))
* Add docx support ([57ae423](https://github.com/saboteur-works/getwrite/commit/57ae423e2b9ffadfeaffa68663b131de7b96d635))
* added export functionality with headers ([9737552](https://github.com/saboteur-works/getwrite/commit/9737552111d592a9dec2de70a55d341e7e784031))
* added project settings menu button and compile option ([a608461](https://github.com/saboteur-works/getwrite/commit/a608461e0c3fee967914ab3faaa50a37f58fc3ab))
* added selection, type, and naming controls to compile ([2308e28](https://github.com/saboteur-works/getwrite/commit/2308e281960e6c4f59e71d90170bdcc66cbfc57f))
* implement new compile resource tree and UI ([b12fa5b](https://github.com/saboteur-works/getwrite/commit/b12fa5bf527a6f0601a638cc9b526a064fbf4a71))


### Bug Fixes

* updated resource collection handling to prevent undefined titles or parents ([d6fa486](https://github.com/saboteur-works/getwrite/commit/d6fa486b627c9aa8aab0d4b86d4b67d4bbf1121a))

## [0.2.7](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.6...getwrite-v0.2.7) (2026-04-08)


### Features

* added editorConfigSlice and read store in TipTapEditor for custom heading styles ([19dd60c](https://github.com/saboteur-works/getwrite/commit/19dd60c10d5b67ba499cea0626dae5fe54f399b6))
* added project heading editor menu ([879893b](https://github.com/saboteur-works/getwrite/commit/879893b0a9f4d813768aec551f04d22f44f44754))
* implement CustomHeading extension ([97f7835](https://github.com/saboteur-works/getwrite/commit/97f78353435c65a6106c66aa6ffb7e3e87d00ca5))
* pass template config to created project ([d8967e3](https://github.com/saboteur-works/getwrite/commit/d8967e32c4cb6d218570aa568d12cce0f0cc63c0))
* started heading settings panel ([323cb38](https://github.com/saboteur-works/getwrite/commit/323cb38045e1496152c673f1aa536cd72fe9523e))


### Bug Fixes

* fixed FolderSchema and  ProjectTypeFolderSchema metadataInputType enums ([c8fd265](https://github.com/saboteur-works/getwrite/commit/c8fd265e0bee9fe6b6e908215500996dad8d342c))

## [0.2.6](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.5...getwrite-v0.2.6) (2026-04-06)


### Bug Fixes

* fixed dependencies ([10bab0e](https://github.com/saboteur-works/getwrite/commit/10bab0e745ec1fac74be7fdd61876f060f5a4cfb))
* fixed dependencies ([ccd4029](https://github.com/saboteur-works/getwrite/commit/ccd40293a8c10486b6411a7912cac8aaa897bbb1))

## [0.2.5](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.4...getwrite-v0.2.5) (2026-04-04)


### Features

* implemented dynamic font family loading for the editor ([45e4f2f](https://github.com/saboteur-works/getwrite/commit/45e4f2f7dae70a276ef1687a8ad6ac4018af79be))

## [0.2.4](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.3...getwrite-v0.2.4) (2026-04-03)


### Features

* implement paragraph leading extension ([15de02f](https://github.com/saboteur-works/getwrite/commit/15de02f70916616ceaa2a763492eceb7ed1af647))

## [0.2.3](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.2...getwrite-v0.2.3) (2026-04-03)


### Features

* made resource-related metadata dynamic in sidebar ([cb709fe](https://github.com/saboteur-works/getwrite/commit/cb709fea84486afce33269d401abffbf2830354d))
* made resource-related metadata dynamic in sidebar ([0094c97](https://github.com/saboteur-works/getwrite/commit/0094c971a50434e295bedd37947008c7753d44fe))

## [0.2.2](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.1...getwrite-v0.2.2) (2026-04-02)


### Bug Fixes

* ensure special folders in metadata sidebar render correctly ([9a1aa85](https://github.com/saboteur-works/getwrite/commit/9a1aa85b161ba663befaa453489ae3e1c58749cd))
* split folder and resource dispatches after  project creation ([0a95841](https://github.com/saboteur-works/getwrite/commit/0a958414df9a6490dc45579a7dd95a2875cb8217))

## [0.2.1](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.2.0...getwrite-v0.2.1) (2026-04-02)


### Bug Fixes

* fixed resource tree reordering error when moving items down ([d846ab5](https://github.com/saboteur-works/getwrite/commit/d846ab52da47dacfd9a2217fdbdca44142b9b889))
* fixed resources not rendering on creation from CreateResourceModal ([c7f576d](https://github.com/saboteur-works/getwrite/commit/c7f576d9ba45c1953ab8dbb48ba3c5b58a6e8265))

## [0.2.0](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.1.1...getwrite-v0.2.0) (2026-04-01)


### ⚠ BREAKING CHANGES

* changed resource level `metadata` field to `userMetadata`

### Features

* changed resource level `metadata` field to `userMetadata` ([3a0b169](https://github.com/saboteur-works/getwrite/commit/3a0b169c8b5bd00e011fc1602d41acde623dcaa1))

## [0.1.1](https://github.com/saboteur-works/getwrite/compare/getwrite-v0.1.0...getwrite-v0.1.1) (2026-04-01)


### Features

* **003:** add projectTypes loader, unit tests; fix tasks checklist; mark T006 complete ([2d21a52](https://github.com/saboteur-works/getwrite/commit/2d21a526196796863849e18d72dc0502da37b8d4))
* add blockquote extension ([15c42d3](https://github.com/saboteur-works/getwrite/commit/15c42d389b7249bad8b7c2b8dc5571e417b71d6d))
* add close functionality to ProjectTypesManagerPage for improved navigation ([ea26cd4](https://github.com/saboteur-works/getwrite/commit/ea26cd4ac65df8e6169655f2377f6558af424313))
* add experimental tree data and story ([c099d74](https://github.com/saboteur-works/getwrite/commit/c099d743a5ad78cb5eb7b5dbdd2636f893f66b7c))
* add HelpPage component and integrate help modal in AppShell ([ebf1dbe](https://github.com/saboteur-works/getwrite/commit/ebf1dbed8adafaf2677088964ac1d9605b03874c))
* add MenuBar component for text formatting and block manipulation ([fbce5b4](https://github.com/saboteur-works/getwrite/commit/fbce5b4cb0c9a6120a71772ab1f2f88fc2d1e364))
* add PATCH endpoint to set canonical revision and update Redux logic ([2957be8](https://github.com/saboteur-works/getwrite/commit/2957be80d646db0123e560b5f8bdef66b5851e07))
* add project closing functionality with confirmation dialog and UI updates ([bd50cfc](https://github.com/saboteur-works/getwrite/commit/bd50cfc73d1cf38bc9ddcf0be9cae846a51ba3b4))
* add rename api route ([25b3a72](https://github.com/saboteur-works/getwrite/commit/25b3a72f31459547704c30f3dc423d4113037dba))
* add ResourceCommandPalette component for enhanced resource selection and keyboard navigation ([0059260](https://github.com/saboteur-works/getwrite/commit/0059260b81c341e530ca197f99628a76b311105d))
* add timestamp tracking for project cards with relative display ([b279484](https://github.com/saboteur-works/getwrite/commit/b2794847a6057d0dfa8ca20cb6138058a2b39af2))
* add toast notifications for canonical revision actions and enhance revision name resolution ([b0f8404](https://github.com/saboteur-works/getwrite/commit/b0f8404a10bb8027c553a4edc7eaa955d1a2772d))
* added editor menu and icon components and state manager ([c2a3aab](https://github.com/saboteur-works/getwrite/commit/c2a3aab0a41bdcc6e6a4697f7ba4f04b4f660f99))
* added font size and family support ([4054a89](https://github.com/saboteur-works/getwrite/commit/4054a8954bc29c95b43156a11779656035920515))
* added GET revision ([7e48cec](https://github.com/saboteur-works/getwrite/commit/7e48cec93d9c07cd67c22b3b48238cc54ee7f750))
* added highlighter and codeblock extensions ([3a08dd8](https://github.com/saboteur-works/getwrite/commit/3a08dd898784557ac7ead17060058f9d99a5a44c))
* added list format support ([df77eb2](https://github.com/saboteur-works/getwrite/commit/df77eb234a0616f42d4c7461370a4b58fbb54aa9))
* added mathematics (latex) support ([5178af1](https://github.com/saboteur-works/getwrite/commit/5178af1178e116cb93472880f02eea30f6dc77c1))
* added placeholder and selection support ([72eba14](https://github.com/saboteur-works/getwrite/commit/72eba14eb6da39b807e2808e6b2894ae0d2f2b0e))
* added resources slice ([28e8bad](https://github.com/saboteur-works/getwrite/commit/28e8bad2ab5ecf44ee78b8ecb48b0e6e27c372d3))
* added revision control and routes ([0448132](https://github.com/saboteur-works/getwrite/commit/04481320c8c8929261947a6017933a4ef3785a01))
* added route for updating sidecar data ([ad176b2](https://github.com/saboteur-works/getwrite/commit/ad176b2ad1ae69dd789e851f50bffb63640ea954))
* added text align functionality ([9245f97](https://github.com/saboteur-works/getwrite/commit/9245f97e7669e3202c3a7c19616455625b4ccf87))
* added tooltips to editor menu icons ([5b0d746](https://github.com/saboteur-works/getwrite/commit/5b0d746e5d504b0dc9544cfc1b3ef277353aff5d))
* added UniqueID extension ([d19fae6](https://github.com/saboteur-works/getwrite/commit/d19fae6a0170cfab9e6eaa6a71ebeed5778c3466))
* added updateResource to resourcesSlice ([ca5181e](https://github.com/saboteur-works/getwrite/commit/ca5181e564f7c7ca3cd0b22e34027f457e5d135a))
* **api:** implemented route to get resource content from filesystem ([6003199](https://github.com/saboteur-works/getwrite/commit/6003199131e91c4d68aab70d05f0b9adb3206f5b))
* **cli:** add project create example, add project command and tests ([96fdd22](https://github.com/saboteur-works/getwrite/commit/96fdd2253e5ee240041904411b039ebe2c3ea758))
* **cli:** add prune-revisions wrapper and usage docs ([f747039](https://github.com/saboteur-works/getwrite/commit/f7470395580978f7f17405f430c0f56ec69fadd2))
* **EditView:** Implemented fetching of resource content from FS ([34b0f2b](https://github.com/saboteur-works/getwrite/commit/34b0f2b4177a2af9f8c317b932c1b74a4d730e57))
* enhance AppShell layout and add knowledge tome skill documentation ([ff4a2e9](https://github.com/saboteur-works/getwrite/commit/ff4a2e92dadc4a538f0d9e45eed80c3b4724b604))
* enhance autosave functionality with improved status indicators and retry option ([6191929](https://github.com/saboteur-works/getwrite/commit/6191929ad6534efbae2b849fb37ed434334cc720))
* enhance dark mode support in user preferences and project types UI ([7979e38](https://github.com/saboteur-works/getwrite/commit/7979e3842e1217ed51f3d9c25558a2a09a535cd6))
* enhance EditView with document title and subtitle display, and add corresponding styles ([541b94a](https://github.com/saboteur-works/getwrite/commit/541b94af8ed03150ab707286a6d95168eb65a50b))
* enhance layout and overflow handling in RevisionControl and EditView components ([b6d97e3](https://github.com/saboteur-works/getwrite/commit/b6d97e3a12ea8ed7a3dd3c8b788e78a7b4b3f341))
* **frontend:** expose project-types API and fetch in CreateProjectModal ([12a7441](https://github.com/saboteur-works/getwrite/commit/12a7441dad88ffdf1fe1e3fdd5266dbf8a7b7489))
* implement app-wide appearance preferences management and UI integration ([fbdbc2b](https://github.com/saboteur-works/getwrite/commit/fbdbc2b45576e8fe4887eb50fde045a34ecc3e54))
* implement autosave functionality and revision tracking in EditView ([4db70d1](https://github.com/saboteur-works/getwrite/commit/4db70d15fb31861f22fb40ae52582fe654986230))
* implement project preferences API and integrate user preferences management ([f953d56](https://github.com/saboteur-works/getwrite/commit/f953d5676ed4aa263daabcd9239c41c60cd4b775))
* implement project type management UI and associated types ([7b0d635](https://github.com/saboteur-works/getwrite/commit/7b0d63583be36704935a823316b31b8bc08f7dc6))
* implement revisions management with Redux slice and async actions ([011e05d](https://github.com/saboteur-works/getwrite/commit/011e05d6177c98cfdba6b1587c3a6f26802db35a))
* implement text bg color ([22c6377](https://github.com/saboteur-works/getwrite/commit/22c6377bb011d2911dbd779e96cda7efa4ba8a18))
* implement toast notification system for user feedback across the app ([43037ad](https://github.com/saboteur-works/getwrite/commit/43037add7a60d850d3f8dacb2896d849cff3052e))
* implement user preferences management with color mode settings ([1951aa7](https://github.com/saboteur-works/getwrite/commit/1951aa78e83f6241941d2cbbc3aa325f033a9278))
* implemented text color editing ([fe36e36](https://github.com/saboteur-works/getwrite/commit/fe36e36fa73e5ffc117dfe15c62ee998d154708a))
* implemented ui rollback ([ef31beb](https://github.com/saboteur-works/getwrite/commit/ef31bebd9b414ae8dbc8a8ce652918adc7a8a5c3))
* **indexer:** background queue for indexing; async enqueue on revision create; tests ([f8334e5](https://github.com/saboteur-works/getwrite/commit/f8334e5b95e1d58d1d4cd217d153e1c4643a5a4b))
* **indexer:** export flushIndexer; docs: add indexing feature docs; tests: await flushIndexer in affected tests ([c9255a7](https://github.com/saboteur-works/getwrite/commit/c9255a7559335200f49709b2c439a553908901a2))
* **migration:** migrate CreateProjectModal to canonical Project type ([4d60f0a](https://github.com/saboteur-works/getwrite/commit/4d60f0ae8a47d3c951f76dd91abe2c06d454b313))
* **migration:** scaffold adapter, normalize store, migrate placeholders and StartPage ([04f1ec0](https://github.com/saboteur-works/getwrite/commit/04f1ec065bb5dea96fc588338d8aed8137216ca5))
* **models:** add Project model and tests (T007) ([4bca57e](https://github.com/saboteur-works/getwrite/commit/4bca57ee7785943ec2b9ca65418bbc4b9c96b7fb))
* **models:** add project-config loader and tests (T008) ([c1516d6](https://github.com/saboteur-works/getwrite/commit/c1516d6e908c075823429e5b23278d219ea255c8))
* **models:** add Resource models + unit tests (T011) ([4e3c24c](https://github.com/saboteur-works/getwrite/commit/4e3c24c202e77b0a43411f0eb25d9c2159a579df))
* **models:** add resource templates and duplication (T027) + tests ([cf63e17](https://github.com/saboteur-works/getwrite/commit/cf63e176801b245c2ba2357edbfb69d77f2d4549))
* **models:** add revision prune helper + tests (T006) ([4ab0204](https://github.com/saboteur-works/getwrite/commit/4ab02048be7b03deb88874abbdcf3874b7d351f7))
* **models:** add sidecar read/write helpers + tests (T005) ([8d27eec](https://github.com/saboteur-works/getwrite/commit/8d27eecbc2efbf07edcbfb1a52e939973ebe041f))
* **models:** add soft-delete/restore/purge (T026) + tests ([308f437](https://github.com/saboteur-works/getwrite/commit/308f4377212d5c8e303e59e2bdc03c33b48b8782))
* **models:** add UUID util (generate + validate) (T004) ([ab8d466](https://github.com/saboteur-works/getwrite/commit/ab8d4662bc89bbb8f7685472f3181300b04c9613))
* **models:** add zod runtime schemas for data models (T002) ([bb36b7b](https://github.com/saboteur-works/getwrite/commit/bb36b7b8b0e026afc910da76f20f4e5690c4c96b))
* **models:** per-resource async mutex to prevent concurrent revision ops ([b8d424b](https://github.com/saboteur-works/getwrite/commit/b8d424b38a4b4d38292546edb203967c38e09eea))
* **models:** pluggable IO adapter (default fs) and refactor revision to use adapter ([3e497fe](https://github.com/saboteur-works/getwrite/commit/3e497fe0e284bfb90abc1151de21eda044c8626f))
* **models:** project-creator + tests (T009) ([3c96ad4](https://github.com/saboteur-works/getwrite/commit/3c96ad4d280096f0e5489d6ae059363581eee04c))
* **previews:** add preview generation and persistence (T028); tests and docs ([044f0c4](https://github.com/saboteur-works/getwrite/commit/044f0c4e1603f5201f1314efa2194dd8ecc4b933))
* **project-creator:** set folder.orderIndex from spec order (T013) ([7a797bb](https://github.com/saboteur-works/getwrite/commit/7a797bbf9d58cab78fa16a05564ed0d4781f33df))
* **project-manager:** Started project manager module ([4268a59](https://github.com/saboteur-works/getwrite/commit/4268a59cff8973767b0dff9318cb34877f3bf8b1))
* **project-resources:** Created skeleton route to fetch project resources ([92dfb16](https://github.com/saboteur-works/getwrite/commit/92dfb161a9a2aab71115cc98f055e4ed8b43a893))
* **project-types:** migrate UI to canonical project view + adapter; update DataView, TimelineView, StartPage ([3a9c937](https://github.com/saboteur-works/getwrite/commit/3a9c9371b28cf3acb978983ac672aae0dd0cab66))
* **project-types:** wire Create modal to scaffolder and prevent double-submits (T008, T009) ([803852e](https://github.com/saboteur-works/getwrite/commit/803852e364356d368c175d62a669ef5f998c2fbb))
* **spec-005:** complete phase 1 setup scaffolding ([4593ce9](https://github.com/saboteur-works/getwrite/commit/4593ce9b858f0dcfc2872d32f72ae6d6fb04f8a9))
* **spec-005:** complete phase 2 foundational baselines ([b6a2795](https://github.com/saboteur-works/getwrite/commit/b6a2795c7d598649c6558053addded03f0dd0f82))
* **spec-005:** complete phase 4 seam extraction and warning cleanup ([db790a8](https://github.com/saboteur-works/getwrite/commit/db790a8635a29aa1e17103fbd0b118e09d5fd1c0))
* **spec-005:** complete phase 5 shell seams ([4a2b0ae](https://github.com/saboteur-works/getwrite/commit/4a2b0aee11c16eb4ec4eaf0891ce0009c45498a3))
* **spec-005:** complete phase 6 invariant validation ([96bca83](https://github.com/saboteur-works/getwrite/commit/96bca839a4e9b12a8222d3d78e487ce1c1230ae4))
* **spec-005:** complete phase 7 menu and help seams ([0964aed](https://github.com/saboteur-works/getwrite/commit/0964aedbd6d604be8a6bfcb62744d5f015c57650))
* **spec-005:** complete phase 8 polish and validation ([988b718](https://github.com/saboteur-works/getwrite/commit/988b7185c22b4b63d3a3ea93da1c540a5e2490f3))
* **spec-005:** complete T007-T009 guardrails and factory extraction ([c014ed9](https://github.com/saboteur-works/getwrite/commit/c014ed9a29873531e625effd1f63e7a14e91d5d0))
* **spec-005:** complete T010 and T011 model seams ([39db1bd](https://github.com/saboteur-works/getwrite/commit/39db1bdd050f6a52aa7109e9a97ab5253abada39))
* **spec-005:** complete T012 template service extraction ([33ad93a](https://github.com/saboteur-works/getwrite/commit/33ad93a5cf0d117b06f77fd106560fd5f9260dd2))
* **spec-005:** complete T013 template delegation trim ([28a1ed6](https://github.com/saboteur-works/getwrite/commit/28a1ed6f7915fa7388d1542328468af2d6f85524))
* **spec-005:** complete T014 revision transport and normalization extraction ([81b0c8c](https://github.com/saboteur-works/getwrite/commit/81b0c8c34ca78aad713ac0977581a0a7a5da7fdb))
* **spec-005:** complete T015-T018 redux seam extraction ([c43ed90](https://github.com/saboteur-works/getwrite/commit/c43ed90e6dfbdab4c79b5485009bea7fe14dcddf))
* **spec-005:** start refactor app trouble spots execution ([266c9cf](https://github.com/saboteur-works/getwrite/commit/266c9cf72349e5b97d4b1904d32b86cb82a357f7))
* **store:** persist reorder via Redux thunk; AppShell dispatches persistReorder ([ffa7140](https://github.com/saboteur-works/getwrite/commit/ffa714094abd44fde8ba281284a527bf7860118e))
* **tree:** accept Project prop and render persisted resources (T011) ([e0ada2d](https://github.com/saboteur-works/getwrite/commit/e0ada2d39860eed2f90856be8c9eb84b7d0e75e7))
* **tree:** drive ResourceTree from Redux (projectId) and wire page create/delete to store; pass projectId from AppShell ([f6278f8](https://github.com/saboteur-works/getwrite/commit/f6278f849e1c77c227e510228055e8ea3e460da5))
* **ui:** persist created/opened project to Redux (setProject + setSelectedProjectId) ([2427ce4](https://github.com/saboteur-works/getwrite/commit/2427ce4f611930c00971a31b8dbaaa5b5242e16a))
* update AppShell topbar layout with improved separator styles and help button repositioning ([41fafa9](https://github.com/saboteur-works/getwrite/commit/41fafa956b769dfe3fc2f2bc6f932b6858353467))
* update ResourceTree to support multiple resource types with corresponding icons ([483f61e](https://github.com/saboteur-works/getwrite/commit/483f61e96314ff253c99a57395901c8866d5d6a6))


### Bug Fixes

* **cli:** pass name string to Command constructor ([0284956](https://github.com/saboteur-works/getwrite/commit/0284956155734edebb18ffa4642243ef1dc231f4))
* **CompilePreviewModal:** detect folder-like resources by parent relationships and use title/name fallbacks ([aa70829](https://github.com/saboteur-works/getwrite/commit/aa7082954ba362189c38b8ee6e834067bd30fb2c))
* correct import statement and ensure resources are included in Default story ([6c4fba8](https://github.com/saboteur-works/getwrite/commit/6c4fba8dd3b5be65ba6916ed7f3a81fc05f6603a))
* enhance accessibility and improve tests for ResourceTree and reorder persistence ([7cca2e4](https://github.com/saboteur-works/getwrite/commit/7cca2e450d97ba148b6ab4b7c0840e40a7256027))
* **frontend:** add project-types load error UI + retry to CreateProjectModal ([9306268](https://github.com/saboteur-works/getwrite/commit/9306268178c6cb40ba43d12b96a0e608bcc48493))
* **frontend:** normalize legacy/canonical resource fields in ResourceTree and TimelineView; update tests ([b919c2b](https://github.com/saboteur-works/getwrite/commit/b919c2b0d9b5278af39e34f0cb1718ccd1c4b172))
* **frontend:** resolve remaining typecheck guardrail errors ([123780c](https://github.com/saboteur-works/getwrite/commit/123780ca9796b8e21eaaf9fe6c599bf28abf4848))
* guard ResourceTree localOrder effect to avoid render loop; add Storybook fetch mock for CreateProjectModal ([bac550a](https://github.com/saboteur-works/getwrite/commit/bac550a5a067804ee1cf4aa0023704a8420727ee))
* include rootPath in setProject dispatch for ResourceTree test ([02c5581](https://github.com/saboteur-works/getwrite/commit/02c5581004665490aa3d7832d970581fbf98b3b9))
* include rootPath in setProject dispatch for ResourceTree test ([84f4c92](https://github.com/saboteur-works/getwrite/commit/84f4c92ca3b21952caa67acce56ba963e5460af2))
* make ViewSwitcher work with folders ([756b3f1](https://github.com/saboteur-works/getwrite/commit/756b3f136a4240e41bd217b7ee9a80a701943a4f))
* **models:** remove markdown fences and unsafe comment sequences in revisionStorage; narrow error typing ([1ea165d](https://github.com/saboteur-works/getwrite/commit/1ea165d3932b5d6b9445faa50ea1f8a0a721b47a))
* **models:** safe JSDoc and return shape in pruneExecutor; update test to match writeRevision ([05dd8dc](https://github.com/saboteur-works/getwrite/commit/05dd8dcd6a711aa46a9cd12bbcd295b2e9334a8c))
* **models:** zod schema typing fixes ([f55f197](https://github.com/saboteur-works/getwrite/commit/f55f197445e5da73e1d3942c1ece7464d1ac73de))
* **OrganizerCard:** cast legacy fields/metadata to avoid union type errors ([f8f2b8c](https://github.com/saboteur-works/getwrite/commit/f8f2b8c9a4ca3e275cfb230dd1af16db3b133088))
* **project-types:** remove $schema field ([721ba54](https://github.com/saboteur-works/getwrite/commit/721ba5462b081e724f37c7a1d852d1592581a2f2))
* **project-types:** set correct template directory ([85ec908](https://github.com/saboteur-works/getwrite/commit/85ec9081ce4961aa68bdab9cb5b8a46ef40ad904))
* **projectTypes:** resolve templates dir at runtime to support tests and app ([12255e7](https://github.com/saboteur-works/getwrite/commit/12255e779f4d9aa472ace5f5d6cfd9a23aac0d71))
* remove max-width from canonical revision article styling ([f4c9f94](https://github.com/saboteur-works/getwrite/commit/f4c9f9428c84448193088875f4cb31f0a45a8724))
* **resource-selection:** fixed resouce/folder selection ([8b7a50e](https://github.com/saboteur-works/getwrite/commit/8b7a50e7dc15db99667e79069c8e3114b3bb0b59))
* **resource-templates:** handle directory-based resources when duplicating (recursive copy) ([ef6f93d](https://github.com/saboteur-works/getwrite/commit/ef6f93dd7a3e3f13fd35849b198ff3ea61ce70c4))
* **resource-templates:** remove extra export ([dad6c24](https://github.com/saboteur-works/getwrite/commit/dad6c24672887aad29bc1de1ffd48fe6e176e3cf))
* **resource:** await writeSidecar in writeResourceToFile to ensure sidecars are written before returning ([7f30721](https://github.com/saboteur-works/getwrite/commit/7f307218e6dcf1c76cdd9416c7118ae7ebf1f0c5))
* **resources:** fix resource create ([d4f727f](https://github.com/saboteur-works/getwrite/commit/d4f727f1bf389a6a937518dddee4d9cd9e7c8300))
* **resources:** Fixed updateResource var refs ([193a307](https://github.com/saboteur-works/getwrite/commit/193a3079bdc452740d94757272659fc9d18fbe4e))
* **schemas:** move node:fs import to dynamic import inside server-only function ([c69cd4c](https://github.com/saboteur-works/getwrite/commit/c69cd4c527eeaf4650e29ccba32a47a958cf1600))
* **stories:** correct JSX syntax and expose simulateReorder properly ([87c091c](https://github.com/saboteur-works/getwrite/commit/87c091c4ca9a20d5ae7841cf70e1d3991b322dc0))
* **styles:** quality fixes from Task 6 review — palette transition, icon sizes, overflow ([e589d15](https://github.com/saboteur-works/getwrite/commit/e589d15de1b44cce3a996ae25935622ade324007))
* **styles:** remove duplicate saboteur-base.css import from getwrite-theme.css ([f63eb89](https://github.com/saboteur-works/getwrite/commit/f63eb89400277ce4f7a463e3d51c165c5082f111))
* **styles:** remove unused React import from StartPage ([c0613fa](https://github.com/saboteur-works/getwrite/commit/c0613fa78f8c59b868a4f1ca306737a245907080))
* **styles:** resolve post-migration regressions — editor text, resource tree, toolbar, modals ([66a1a90](https://github.com/saboteur-works/getwrite/commit/66a1a90544e11ae508c0733ad3dca4032efb3fc3))
* **styles:** use named tracking tokens and clean conflicting button utilities in StartPage ([24fa4dc](https://github.com/saboteur-works/getwrite/commit/24fa4dc709752457a2cfb8b215fee4616d098610))
* **styles:** use text-gw-secondary className on View icon in RevisionControl action buttons ([232b667](https://github.com/saboteur-works/getwrite/commit/232b66714dc07a9de06130a4896f094db0dfb2ee))
* **tests:** adjust flows and resourceTree tests to wrapper/ui shapes; fix TimelineView variable ([053422e](https://github.com/saboteur-works/getwrite/commit/053422e93083d514d3dba3d73ba25cbda15ffc20))
* **tiptap-utils:** include text nodes when extracting plain text for backlinks ([3caab96](https://github.com/saboteur-works/getwrite/commit/3caab9663975ce2ac640fdbd309872af4376492c))
* update fetch mock implementation to handle URL and Request types correctly ([dea55b9](https://github.com/saboteur-works/getwrite/commit/dea55b98def6b2d17d89badf52aee66d6c0d8daa))
* update MetadataSidebar test to include resource dispatches ([7637814](https://github.com/saboteur-works/getwrite/commit/7637814393105081547e9a07ca2267ef2985abb1))
* update resource structure and type definitions in flow tests ([8a8deea](https://github.com/saboteur-works/getwrite/commit/8a8deea13290e945c55c04c833ae5d037854014f))
* update StartPage test to correct rootPath values and import test from vitest ([f1935ba](https://github.com/saboteur-works/getwrite/commit/f1935baba2d7da7a2227222cc960eebdde69e14c))
* updated parent-child resource creation logic ([48cd7c7](https://github.com/saboteur-works/getwrite/commit/48cd7c71ee9174d3f380a5959c680acecca6f194))
* updated tree item styling so items dropped into folders have the same indentation ([f321a63](https://github.com/saboteur-works/getwrite/commit/f321a63b7c6bd3b3058f728617f593d7020dee69))
