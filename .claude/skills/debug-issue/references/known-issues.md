# Known issues reference

> 🔲 **Stub** — fill in with known bugs, technical debt, and recurring
> failure modes specific to this project. The `debug-issue` skill loads
> this file when diagnosing a bug, to avoid re-investigating issues that
> are already understood.

Each entry should describe: what the symptom looks like, what causes it,
and the current status (known/deferred/workaround in place).

---

## Known bugs and deferred issues

<!-- Document issues that are known but not yet fixed.
     E.g.:
     ### Race condition in export job queue
     **Symptom:** Occasional duplicate export files when two requests arrive
     within ~100ms of each other.
     **Cause:** The job deduplication check is not atomic — two workers can
     pass the check simultaneously.
     **Status:** Deferred. Workaround: exports are idempotent, duplicates
     can be safely deleted.
     **Ticket:** ISSUE-412
-->

_Not yet documented._

---

## Recurring failure modes

<!-- Patterns that cause bugs repeatedly — not individual bugs but
     classes of error that keep appearing.
     E.g.:
     ### Missing `await` on async database calls
     Several bugs have been caused by forgetting to await a Prisma query.
     TypeScript does not always catch this. Symptom: the returned value
     is a Promise object rather than the resolved data.
-->

_Not yet documented._

---

## Technical debt affecting debuggability

<!-- Areas of the codebase where technical debt makes bugs harder to
     diagnose — poor error messages, missing logging, lack of tests, etc.
     E.g.:
     ### Payment service has no structured error types
     Errors from the payment service are plain Error objects with string
     messages. Diagnosing payment failures requires parsing message strings
     rather than checking error types.
-->

_Not yet documented._
