# ADR-023: Saboteur Port Blocks of Ten; the Desktop Server Uses 7340

**Date:** 2026-10-10
**Status:** Accepted

Each statement below carries a date and a label: **read** (read in code, a file or a record, not run), **measured** (a recorded run) or **reported** (said by the owner). Labels are not guarantees beyond what the named check shows.

## Context

- The desktop app's bundled Next.js server listened on port 3000 (read, 2026-10-10: `electron/src/server-config.ts`'s `PORT`, before Feature 80). 3000 is a common development default, so a writer's other tools can already hold it.
- Feature 80 (`specs/features/desktop-server-port.md`) moves the port. Reported, 2026-10-10 (owner decision, Gate 0): the desktop server becomes 7340, and Saboteur apps take blocks of ten ports each.
- Screening, 2026-10-10, read: on the owner's Mac a local `/etc/services` (a local copy of the registry) lists no TCP service in 7340 to 7349, 7350 to 7359, 7370 to 7379 or 7380 to 7389. 7340 is not among the development defaults the pipeline lead listed (3000, 4200, 5000, 5173, 6006, 7000, 8000, 8080, 8888, 9000) and lies between 1024 and 32767.
- Not checked: the screening was against a local `/etc/services` and **not the live IANA registry** (2026-10-10, read from the spec's Gate 0 note). That 7340 is absent from Chrome's and Firefox's restricted-port lists is from memory and **not checked**. The only browser evidence is Task 6 (measured, 2026-10-10): Playwright Chromium 148.0.7778.96, headless, loaded a plain HTTP marker page on 7340 from both a LAN address and `localhost`. Firefox, desktop Chrome and Safari were not checked; the Android phone result is the owner's own check (Task 21).

## Decision

1. **GetWrite owns 7340 to 7349** (reported, 2026-10-10, owner decision at Gate 0).
2. **The next Saboteur app starts at the base plus 10, which is 7350, and so on** in steps of ten (reported, 2026-10-10).
3. **The desktop server uses 7340** (reported, 2026-10-10; implemented by Feature 80 in `electron/src/server-config.ts`, the single source of the value).
4. **Hosted-auth fallbacks and the development commands (`pnpm dev`, `pnpm start`) keep 3000** (reported, 2026-10-10, owner decision at the Task 7 stop). The desktop app in development mode follows the constant to 7340 (reported, same stop). No separate development port was added.
5. **No copy of this convention is made by Feature 80 in a shared cross-repo location.** That copy is the owner's own step and is not done by this ADR or its task.

## Options considered

### Option 1: Keep 3000

**Pros:**

- No change, no documentation.

**Cons:**

- 3000 is a common development default (read, 2026-10-10: the Gate 0 list above), and the desktop app's start-up behaviour when something already holds the port was measured to be a problem on 3000 (Task 3 of Feature 80; see `specs/features/desktop-server-port/experiments.md`, "Port in use today (3000)").

### Option 2: Pick one free-looking port per app with no convention

**Pros:**

- Smallest decision now.

**Cons:**

- Each later app repeats the screening and risks overlapping ports. A fixed block width removes that choice.

### Option 3: Blocks of ten starting at 7340 (chosen)

**Pros:**

- Ten ports per app leave room for companion processes without renegotiating the base.
- The next app's base is computed, not chosen.

**Cons:**

- The block is a convention held by the owner; nothing in the operating system enforces it.

### Option 4: A random or ephemeral port chosen at launch

Not selected. Reported, 2026-10-10 (Gate 0): the owner chose a fixed port. The spec treats the pairing address a device saves as host and port, which a changing port would break (read, 2026-10-10: spec scope note).

## Consequences

- A desktop launch listens on 7340 instead of 3000. A device that opens the old address gets a refused connection: measured, 2026-10-10 (Task 6), Chromium 148 reported `net::ERR_CONNECTION_REFUSED` for both a LAN address and `localhost` with nothing on 3000. No listener or redirector on 3000 is built (reported, 2026-10-10, owner decision at the Task 7 stop); a docs line is the only handling.
- A paired device normally stays paired on the new port: measured, 2026-10-10 (Task 5), in Chromium only. One host-only `getwrite_device` cookie (no port in the attribute) was accepted on a second port against the same store. Firefox, Safari and the Android phone browser were not measured here; if a device does not stay paired, it is paired again (reported, 2026-10-10).
- A development desktop app and a packaged app both want 7340. Whether the two can otherwise run together was not measured (reported, 2026-10-10, owner decision record).
- 7340 is not claimed to be free on any machine. The screening is local and unverified against the live registry, and the restricted-port statement for Chrome and Firefox is unchecked memory.
- Later Saboteur apps use 7350 and up. Recording this convention in a shared cross-repo location is the owner's step.
