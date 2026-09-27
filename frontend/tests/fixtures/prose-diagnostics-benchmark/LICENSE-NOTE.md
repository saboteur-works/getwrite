# License & sourcing note — prose diagnostics benchmark fixtures

**Source:** _Pride and Prejudice_ by Jane Austen. Project Gutenberg EBook #1342
("Pride and Prejudice", the Cambridge/R. W. Chapman-descended 1894 George Allen
illustrated edition with a preface by George Saintsbury and illustrations by
Hugh Thomson), fetched from
`https://www.gutenberg.org/files/1342/1342-0.txt` on 2026-09-27.

**Public-domain basis:** US public domain. Jane Austen died in 1817; the work
was first published in 1813. Project Gutenberg's own header identifies this as
a US public-domain ebook with "almost no restrictions whatsoever" on reuse in
the United States (see the file's own license block, retained only in the
downloaded source — not in the vendored excerpts below, per the boilerplate
strip described next).

## What was stripped before vendoring

1. **Project Gutenberg boilerplate.** The file's own header/footer license
   block, delimited by the markers
   `*** START OF THE PROJECT GUTENBERG EBOOK 1342 ***` and
   `*** END OF THE PROJECT GUTENBERG EBOOK 1342 ***`, was removed and is not
   present in any vendored file, and was excluded from every word count below.
2. **Front matter.** Everything between the START marker and the start of the
   novel's own first sentence — title page, illustration plates, table of
   contents, and George Saintsbury's preface — was dropped. The novel body
   used for all three excerpts begins at the sentence "It is a truth
   universally acknowledged, that a single man in possession of a good
   fortune must be in want of a wife." (source file `1342-0.txt`, character
   offset 34343, source line 678 — i.e. immediately following the "Chapter
   I." heading).
3. **Illustration captions.** This particular Gutenberg transcription is of
   an _illustrated_ 1894 edition and carries 164 inline `[Illustration: ...]`
   bracketed caption blocks (plate descriptions and captions such as
   `[Illustration: "He came down to see the place" [Copyright 1894 by George
Allen.]]`) interleaved throughout the chapters. These are publisher/
   illustrator paratext, not Austen's authored prose, so they were removed
   (balanced-bracket strip) from the working text before any word count or
   excerpt cut was made. This is a source-cleaning step beyond the plain
   boilerplate strip FR-3/Task 1 asks for, done so the fixtures measure real
   narrative prose rather than intermixed picture captions.

All three steps were applied once, in that order, to produce one cleaned
working text (~121,701 words), from which the three excerpts below are exact
whitespace-delimited-word prefixes — no other editing, rewording, or
paraphrasing was done.

## Word-count definition

Exactly as used in `fixture-word-counts.test.ts` and to be reused unchanged by
Task 2's benchmark harness:

```js
text.trim().split(/\s+/).filter(Boolean).length;
```

## Excerpt boundaries

Each excerpt is the first _N_ whitespace-delimited words of the single cleaned
working text described above — i.e. each smaller file's content is an exact
prefix of every larger file's content (1k ⊂ 10k ⊂ 100k), all cut from the same
starting point (the novel's first sentence, Chapter I). The source (~121,701
words after cleaning) is long enough that no size needed padding or repeated
content.

| File             | Word count      | Chapter coverage                                  | Notes                                              |
| ---------------- | --------------- | ------------------------------------------------- | -------------------------------------------------- |
| `1k-words.txt`   | exactly 1,000   | Chapter I (complete) into the start of Chapter II | Ends mid-Chapter II                                |
| `10k-words.txt`  | exactly 10,000  | Chapter I through the start of Chapter VIII       | 7 chapter headings (II–VIII) occur within the file |
| `100k-words.txt` | exactly 100,000 | Chapter I through the start of Chapter LII (52)   | 51 chapter headings (II–LII) occur within the file |

Dialogue spot-check (quoted speech, curly double quotes, confirmed by eye):
all three files begin their first line of dialogue at the same place, since
each is a prefix of the others — line 9 of each file:

> "My dear Mr. Bennet," said his lady to him one day, "have you heard that

(rendered here with straight quotes for this note; the vendored files use the
source's own curly `“`/`”` quote characters). Each file contains many further
dialogue-bearing lines throughout, not just this first one — this is the
mechanism `dialogueRatioStandin` (Task 2) will exercise.

## Files in this directory

- `1k-words.txt` — first 1,000 words of the cleaned text
- `10k-words.txt` — first 10,000 words of the cleaned text
- `100k-words.txt` — first 100,000 words of the cleaned text
- `fixture-word-counts.test.ts` — Vitest check that each file is exactly the
  stated word count
- `LICENSE-NOTE.md` — this file
