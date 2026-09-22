#!/usr/bin/env python3
"""
.claude/hooks/guard-pm-install.py

PreToolUse guard for Bash (main session and subagents). Hard-blocks
package-manager commands that mutate node_modules or the lockfile:

  Always, inside an agent worktree (.claude/worktrees/**):
    - pnpm/npm/yarn/bun install | add | remove | update | ci | dedupe
  Additionally while .claude/.pipeline-active exists, anywhere in the repo:
    - the same set

Allowed everywhere: pnpm exec, pnpm run <script>, pnpm --filter <pkg> <script>,
pnpm list/why/outdated/licenses, npx/dlx, --help on any of the above, and any
occurrence of the word "install" that is not the subcommand (a quoted string,
a grep pattern, a script named "install-ish").

exit 0 = allow, exit 2 = block (stderr is shown to the model). An internal
error fails open (exit 0) with a note on stderr, so a bug here can never block
every Bash call.

Rationale: three pipeline runs in a row, a task implementor ran `pnpm install`
in its own agent worktree despite an explicit prohibition in its prompt. On
2026-09-22 that rewrote five symlinks in the MAIN repo's root node_modules
(husky, lint-staged, prettier, knip, typescript) to point into the worktree's
private .pnpm store; when the worktree was later removed those symlinks
dangled and `git commit` failed repo-wide until they were repaired by hand.

Worktrees share the main checkout's install by design, so an install inside
one has no legitimate use and can corrupt the parent.
"""
import json
import os
import re
import shlex
import sys

MANAGERS = {"pnpm", "npm", "yarn", "bun", "npm.cmd", "pnpm.cmd"}
MUTATING = {"install", "i", "add", "remove", "rm", "uninstall", "un",
            "update", "up", "upgrade", "ci", "dedupe", "prune", "link"}
# Subcommands that are safe even though they sit next to the mutating ones.
SAFE = {"exec", "run", "dlx", "list", "ls", "why", "outdated", "licenses",
        "test", "build", "start", "dev", "audit", "view", "info"}
CONTROL = re.compile(r"[;&|]{1,2}|\n")


HEREDOC = re.compile(r"<<-?\s*[\'\"]?([A-Za-z_][A-Za-z0-9_]*)[\'\"]?")


def strip_heredocs(cmd):
    """Drop heredoc bodies before scanning.

    A heredoc body is data, not commands. Without this, a note or commit
    message whose prose contains "pnpm install" is scanned line-by-line and
    blocked — measured 2026-09-22, on this hook's first live invocation.
    """
    lines = cmd.split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = HEREDOC.search(line)
        if m:
            term = m.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != term:
                i += 1  # body: skipped entirely
        i += 1
    return "\n".join(out)


def segments(cmd):
    """Split a compound command into individually-scannable pieces."""
    for part in CONTROL.split(strip_heredocs(cmd)):
        part = part.strip()
        if part:
            yield part


def tokens(part):
    try:
        return shlex.split(part)
    except ValueError:  # unbalanced quotes — scan what we can
        return part.split()


def offending(part):
    """Return the offending '<manager> <subcommand>' pair, or None."""
    toks = tokens(part)
    if "--help" in toks or "-h" in toks:
        return None  # a help query mutates nothing
    for i, tok in enumerate(toks):
        base = os.path.basename(tok)
        if base not in MANAGERS:
            continue
        # Find this manager's first non-flag argument.
        for arg in toks[i + 1:]:
            if arg.startswith("-"):
                if arg in ("--help", "-h"):
                    return None
                continue
            if arg in SAFE:
                return None
            if arg in MUTATING:
                return f"{base} {arg}"
            return None  # some other subcommand; not ours to judge
    return None


def escapes_dir(cwd):
    """The nearest enclosing node_modules that resolves OUTSIDE its own project.

    Measured 2026-09-22: pnpm follows a symlinked node_modules and writes
    through it into the link target. A failed install (blocked at the network
    step) still wrote .pnpm-workspace-state-v1.json into the target; a
    successful one reaches the linking stage, which is what rewrote five
    top-level symlinks in the main repo during the 2026-09-17 incident.
    """
    d = os.path.realpath(cwd)
    while True:
        nm = os.path.join(d, "node_modules")
        if os.path.lexists(nm):
            if not os.path.realpath(nm).startswith(d + os.sep):
                return nm
            return None
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def scan(cmd, cwd, root, active):
    if os.path.exists(os.path.join(root, ".claude", ".allow-install")):
        return None  # human opt-in; delete the file to re-arm

    escaping = escapes_dir(cwd)
    for part in segments(cmd):
        hit = offending(part)
        if not hit:
            continue
        if escaping:
            return (f"`{hit}` where node_modules ({escaping}) resolves outside "
                    "its own project, so the install writes through the link "
                    "into the target tree")
        in_repo = os.path.realpath(cwd).startswith(root + os.sep) or \
            os.path.realpath(cwd) == root
        if active and in_repo:
            return (f"`{hit}` during a live pipeline run — adding or changing a "
                    "dependency mid-run is a decision for the human")
    return None


def main():
    payload = json.load(sys.stdin)
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    cwd = payload.get("cwd") or os.getcwd()
    root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or cwd)
    active = os.path.exists(os.path.join(root, ".claude", ".pipeline-active"))

    reason = scan(cmd, cwd, root, active)
    if reason:
        print(
            f"Blocked by .claude/hooks/guard-pm-install.py: {reason}.\n"
            "Worktrees share the main checkout's install; installing in one has "
            "rewritten the main repo's node_modules symlinks and broken git "
            "commit repo-wide.\n"
            "If a dependency is genuinely missing, stop and report that rather "
            "than installing: adding one is a decision for the human.\n"
            "To reuse the main install from a worktree, symlink it:\n"
            "  ln -s \"$CLAUDE_PROJECT_DIR/node_modules\" node_modules",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # fail open: never block all Bash on a hook bug
        print(f"guard-pm-install: internal error, allowing: {e}", file=sys.stderr)
        sys.exit(0)
