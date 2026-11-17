# Task 3: FR-1 (b) and (f) fidelity fixture and harness

Nothing in this file is a fidelity result. `scripts/citations-engine-fidelity.mjs` has not been run against any engine, neither citeproc-js nor Hayagriva. Task 4 runs it.

## Files written

- `scripts/citations-fidelity-fixture.json`: CSL-JSON items plus an ordered `citations` list.
- `scripts/citations-engine-fidelity.mjs`: the harness.

## Fixture counts

Command (run from the repository root, node v24.15.0):

```
node -e 'const f=require("./scripts/citations-fidelity-fixture.json");const c={};f.items.forEach(i=>c[i.type]=(c[i.type]||0)+1);const ids=new Set(f.items.map(i=>i.id));const u={};f.citations.forEach(x=>{u[x.itemId]=(u[x.itemId]||0)+1});console.log("items",f.items.length,JSON.stringify(c));console.log("citations",f.citations.length,"allResolve",f.citations.every(x=>ids.has(x.itemId)));console.log("repeated",JSON.stringify(Object.entries(u).filter(e=>e[1]>1)));const l={};f.citations.filter(x=>x.locator).forEach(x=>l[x.locator.label]=(l[x.locator.label]||0)+1);console.log("locators",JSON.stringify(l),"timestamps",f.citations.filter(x=>/at \d/.test(x.suffix||"")).length)'
```

Observed output:

```
items 12 {"book":3,"article-journal":3,"webpage":3,"interview":3}
citations 16 allResolve true
repeated [["book-1",3],["book-2",2],["interview-1",2]]
locators {"page":5,"paragraph":3,"line":2} timestamps 4
```

- 12 items: 3 book, 3 article-journal, 3 webpage, 3 interview.
- 16 citations, every one naming an item that exists.
- Repeated citation: `book-1` is cited 3 times (c01, c03, c14), `book-2` twice, `interview-1` twice.
- Locators: page, paragraph and line are CSL labels on the citation; a timestamp is literal text in the citation `suffix` (for example ", at 12:30"), 4 of them, and is never given a CSL label.
- Interviewee is carried as `author` (INFERRED in the spec); the interviewer is carried as `interviewer`. Task 4 checks how each candidate maps these.

## Harness behaviour (by reading the script, not by running it against an engine)

- Usage: `node scripts/citations-engine-fidelity.mjs <citeproc-js|hayagriva> <style-id> --style-file <csl> --locale-file <xml> [--out <file>] [--fixture <file>]`.
- The reference processor is citeproc-js (package `citeproc`), imported dynamically. Candidate A is the same package; candidate B is the package named by `GETWRITE_HAYAGRIVA_PACKAGE` (default `hayagriva-wasm`), which must export `renderCitations(items, citations, styleXml, localeXml)`. That default name and export shape are this script's assumption, not an observed fact about any Hayagriva binding; Task 4 or Task 6 may need to adapt it.
- Exit codes: 0 no difference found, 1 differences found, 2 a package is missing, 3 bad input or an unknown binding surface.
- Comparison normalises only markup (tags stripped) and whitespace (runs collapsed, trimmed). Every difference is written with the raw and normalised text of both sides. Citations and bibliography entries are compared.
- Not covered by this script: whether output carries formatting runs, label handling per locator type, numbering across a manuscript (OQ-16) and bibliography heading (OQ-12); Task 4 records these from the raw output.

## Run with no candidate present

Command:

```
node scripts/citations-engine-fidelity.mjs citeproc-js chicago-notes --style-file x --locale-file y
```

Observed output and exit status:

```
Missing package "citeproc" (reference processor, citeproc-js). Nothing was rendered and this is not a pass. Installing it is an owner step.
exit=2
```

`ls node_modules/citeproc frontend/node_modules/citeproc` reported both paths absent. Syntax check: `node --check scripts/citations-engine-fidelity.mjs` printed no error.

## Not done

- The script was not run against citeproc-js or Hayagriva, so the rendering and comparison paths, including the citeproc-js call sequence, are untested.
- Nothing was installed; `package.json` and lockfiles were not edited.
