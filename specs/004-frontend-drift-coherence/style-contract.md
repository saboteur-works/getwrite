# Style Contract

This artifact captures exemplar-derived keep-rules, anti-patterns, and tie-breaker guidance for spec 004.

## Exemplar Capture Format

Use this format for each source exemplar before deriving rules.

| Exemplar ID | Source       | Why It Is Strong | Observable Pattern        | Caveats               |
| ----------- | ------------ | ---------------- | ------------------------- | --------------------- |
| EX-###      | path/to/file | short rationale  | concrete behavior/pattern | limits or scope notes |

## Rule Categories

All derived rules and anti-patterns must be categorized.

- Type safety
- Module responsibility
- State management
- Error handling
- React component shape
- Styling (token-first)

## Keep-Rules

Use one row per actionable rule.

| Rule ID | Category | Rule                      | Source Exemplars | When to Apply   |
| ------- | -------- | ------------------------- | ---------------- | --------------- |
| SR-###  | category | imperative rule statement | EX-###, EX-###   | brief condition |

## Anti-Patterns

Document discouraged patterns paired to the affected category.

| Anti-Pattern ID | Category | Avoid This                   | Why It Causes Drift  | Better Direction        |
| --------------- | -------- | ---------------------------- | -------------------- | ----------------------- |
| AP-###          | category | brief anti-pattern statement | short risk statement | corresponding keep-rule |
