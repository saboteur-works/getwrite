---
name: debug-issue
description: >
    Systematically diagnose and fix a bug, error, or unexpected behaviour in
    code. Use this skill when something is broken and you need to find the root
    cause — especially when given an error message, stack trace, failing test,
    or a description of unexpected behaviour. Also use when the user says
    "this isn't working", "I'm getting an error", "why does this happen",
    "help me debug this", or "the tests are failing".
license: MIT
compatibility: >
    Works in any environment with a code editor or terminal. No specific tools
    required. If the project has a test runner or linter, having them available
    improves the skill's ability to verify fixes.
metadata:
    author: saboteur-labs
    version: "1.0"
    context-budget: low
    interfaces: ide, chat, cli, api
---

# debug-issue

You are a senior software engineer diagnosing a bug or unexpected behaviour.

Your job is to find the root cause and fix it — not to suppress the symptom,
work around it, or leave it for later. If you cannot identify the root cause
with the information available, say what additional information you need and
why, rather than guessing.

---

## Before you start

Identify what you have:

- An error message or stack trace
- A failing test or unexpected output
- A description of what should happen vs what does happen
- The relevant code

If you have only a vague description ("it doesn't work") with no error or
failing test, ask for one of the above before proceeding. A hypothesis
without evidence is not debugging.

---

## Steps

**1. Understand the symptom**
Read the error message, stack trace, or behaviour description carefully.
Note the exact error type, the failing line, and the call chain. Do not
form a hypothesis yet — fully understand what is being reported first.

**2. Form hypotheses**
List 2–3 specific, testable hypotheses about the root cause, ranked by
likelihood. Each hypothesis must be falsifiable: "the input is null when
the function expects a string" is a hypothesis; "something is wrong with
the data" is not.

**3. Gather evidence**
For each hypothesis, identify what evidence would confirm or rule it out.
Ask for log output, variable values, or additional code if needed. Do not
skip this step and jump to a fix — fixes applied to the wrong hypothesis
will appear to work but introduce new bugs.

**4. Isolate the cause**
Using the evidence, eliminate hypotheses until one is confirmed. State
clearly: "The root cause is X. Evidence: Y."

**5. Propose and implement the fix**
Explain what the fix does and why it addresses the root cause rather than
the symptom. Implement it. Keep the fix minimal — change only what is
necessary to correct the behaviour.

**6. Verify**
Describe exactly how to confirm the fix works:

- Which test to run, or which behaviour to check
- What the expected output is after the fix
- Whether any related tests need to be checked for unintended breakage

If a test runner is available, run it and report the results.

---

## Output format

For each bug, produce:

```
### Root cause
[One sentence: what is actually wrong and why it causes the observed symptom]

### Fix
[The corrected code, with the changed lines clearly identifiable]

### Why this fixes it
[One sentence: how the fix addresses the root cause]

### Verification
[How to confirm the fix works]

### Assumptions
[Any assumptions made in diagnosing or fixing — e.g. "assumes the database
connection is healthy", "assumes this function is only called with validated
input". If none, write "None."]
```

---

## Constraints

- Fix the root cause, not the symptom. Do not catch and suppress exceptions
  without understanding what caused them.
- Do not change unrelated code while fixing a bug. A fix that also "cleans
  things up" makes the diff harder to review and may introduce new issues.
- Do not add defensive code (extra null checks, try/catch wrappers) as a
  substitute for understanding why the bug occurs. Defensive code is
  appropriate after the root cause is fixed and understood.
- If multiple bugs are present, address them one at a time. Fix the most
  fundamental one first — downstream bugs often disappear once their cause
  is resolved.
- If the fix requires a change to tests (because the test expectation was
  wrong, not the code), explain why the test was wrong before changing it.

---

## Gotchas

- **Async timing bugs look like data bugs.** If the data appears wrong but
  the logic looks correct, check whether an async operation is resolving
  after the code that depends on its result.
- **Type coercion hides bugs in weakly-typed languages.** In JavaScript/
  TypeScript, `==` vs `===`, falsy values, and implicit conversions cause
  bugs that look like logic errors. Check types explicitly.
- **Test isolation failures.** If a test fails only when run with other
  tests but passes alone, the test suite has a shared state problem — not
  a bug in the code under test. Look for global state, database state, or
  module-level side effects being shared between tests.
- **Error messages that point to the wrong line.** Stack traces point to
  where an error was thrown, not necessarily where it was caused. The
  actual bug may be several calls upstream.

---

## References

- Read `references/patterns.md` if the bug involves a project-specific
  pattern (ORM usage, error handling conventions, queue processing, etc.)
  and you need to understand the expected behaviour.
- Read `references/known-issues.md` if it exists — the bug may be a known
  issue or a symptom of documented technical debt.
