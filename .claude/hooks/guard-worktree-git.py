#!/usr/bin/env python3
"""
.claude/hooks/guard-worktree-git.py

PreToolUse guard for Bash (main session and subagents). Hard-blocks git
commands that overwrite the MAIN worktree's files from a ref, or switch its
branch out from under a pipeline run:

  Always, in the main worktree:
    - git checkout [<ref>] -- .     / git checkout <ref> .   (whole-tree pathspec)
    - git restore [--source <ref>] . (whole-tree pathspec)
    - git reset --hard <ref other than HEAD>
  Additionally while .claude/.pipeline-active exists:
    - git reset --hard               (would discard held uncommitted edits)
    - git checkout <existing ref> / git checkout - / git checkout -B ...
    - git switch <ref> / git switch -C ...

Allowed: single-path restores (git checkout HEAD -- frontend/tsconfig.json),
git show <ref>:<path>, git worktree add, creating a branch from the current
HEAD (checkout -b, switch -c), and any command whose target is a different
worktree (e.g. agent worktrees under .claude/worktrees/).

exit 0 = allow, exit 2 = block (stderr is shown to the model). An internal
error fails open (exit 0) with a note on stderr, so a bug here can never
block every Bash call.

Rationale: during the remove-entity pipeline a subagent orchestrator ran
`git checkout <ref> -- .` twice in the main worktree despite prompt
instructions forbidding it.
"""
import json
import os
import shlex
import subprocess
import sys

WHOLE_TREE = {".", "./", ":/", ":/.", ":/*", "*", ":(top)", ":(top)."}
CONTROL = set(";&|()")


def git(d, *args):
    return subprocess.run(
        ["git", "-C", d, *args], capture_output=True, text=True, timeout=5
    )


def toplevel(d):
    try:
        r = git(d, "rev-parse", "--show-toplevel")
        return os.path.realpath(r.stdout.strip()) if r.returncode == 0 else None
    except Exception:
        return None


def is_ref(d, name):
    try:
        return git(d, "rev-parse", "--verify", "--quiet", name + "^{commit}").returncode == 0
    except Exception:
        return False


def segments(cmd):
    """Split a shell command into simple-command token lists on ; & | ( ) and newlines."""
    lex = shlex.shlex(cmd.replace("\n", " ; "), posix=True, punctuation_chars=";&|()")
    lex.whitespace_split = True
    seg = []
    for tok in lex:
        if tok and set(tok) <= CONTROL:
            if seg:
                yield seg
            seg = []
        else:
            seg.append(tok)
    if seg:
        yield seg


def nonopts(args, skip_value_of=()):
    out, skip = [], False
    for t in args:
        if skip:
            skip = False
            continue
        if t in skip_value_of:
            skip = True
            continue
        if not t.startswith("-"):
            out.append(t)
    return out


def check_git(args, d, active):
    """Return a block reason for one git invocation, or None to allow."""
    while args and args[0].startswith("-"):
        if args[0] == "-C" and len(args) > 1:
            d = os.path.join(d, os.path.expanduser(args[1]))
            args = args[2:]
        elif args[0] in ("-c", "--git-dir", "--work-tree", "--namespace") and len(args) > 1:
            args = args[2:]
        else:
            args = args[1:]
    if not args:
        return None
    sub, rest = args[0], args[1:]

    main = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or d)
    tl = toplevel(d)
    if tl is None or tl != main:
        return None  # not the main worktree (or not a repo): out of scope

    if sub == "checkout":
        if "-b" in rest or "--orphan" in rest:
            return None
        if "-B" in rest:
            return "`git checkout -B` resets/switches a branch in the main worktree during a pipeline run" if active else None
        if "--" in rest:
            paths = rest[rest.index("--") + 1:]
            if any(p in WHOLE_TREE for p in paths):
                return "whole-tree `git checkout ... -- .` overwrites every file in the main worktree"
            return None
        if "-" in rest:
            return "`git checkout -` switches the main worktree's branch during a pipeline run" if active else None
        pos = nonopts(rest)
        if any(p in WHOLE_TREE for p in pos):
            return "whole-tree `git checkout <ref> .` overwrites every file in the main worktree"
        if len(pos) == 1 and pos[0] not in ("HEAD", "@"):
            x = pos[0]
            if is_ref(d, x) and not os.path.exists(os.path.join(d, x)):
                return f"`git checkout {x}` switches the main worktree away from its branch during a pipeline run" if active else None
        return None

    if sub == "switch":
        if any(o in rest for o in ("-c", "--create", "--orphan")):
            return None
        return "`git switch` changes the main worktree's branch during a pipeline run" if active else None

    if sub == "restore":
        paths = rest[rest.index("--") + 1:] if "--" in rest else nonopts(rest, ("-s", "--source"))
        if any(p in WHOLE_TREE for p in paths):
            return "whole-tree `git restore .` overwrites every file in the main worktree"
        return None

    if sub == "reset" and "--hard" in rest:
        pos = nonopts(rest)
        ref = pos[0] if pos else "HEAD"
        if ref not in ("HEAD", "@"):
            return f"`git reset --hard {ref}` rewrites the main worktree and branch to another ref"
        if active:
            return "`git reset --hard` would discard uncommitted edits held in the main worktree during a pipeline run"
        return None

    return None


SHELLS = {"bash", "sh", "zsh", "dash"}


def scan(cmd, cur, active, depth=0):
    """Return the first block reason found in a command string, or None."""
    if depth > 3 or "git" not in cmd:
        return None
    for seg in segments(cmd):
        if seg[0] in ("cd", "pushd") and len(seg) > 1:
            cur = os.path.join(cur, os.path.expanduser(seg[1]))
            continue
        # Re-scan scripts handed to a shell (`bash -c '...'`) or `eval`; other
        # quoted strings (e.g. commit messages) are deliberately not re-scanned.
        prog = os.path.basename(seg[0])
        if prog == "eval":
            reason = scan(" ".join(seg[1:]), cur, active, depth + 1)
            if reason:
                return reason
        elif prog in SHELLS and "-c" in seg[1:-1]:
            reason = scan(seg[seg.index("-c", 1) + 1], cur, active, depth + 1)
            if reason:
                return reason
        for i, tok in enumerate(seg):
            if tok == "git" or tok.endswith("/git"):
                reason = check_git(seg[i + 1:], cur, active)
                if reason:
                    return reason
                break
    return None


def main():
    payload = json.load(sys.stdin)
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    cur = payload.get("cwd") or os.getcwd()
    root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or cur)
    active = os.path.exists(os.path.join(root, ".claude", ".pipeline-active"))

    reason = scan(cmd, cur, active)
    if reason:
        print(
            f"Blocked by .claude/hooks/guard-worktree-git.py: {reason}.\n"
            "Safe alternatives: restore specific paths (git checkout HEAD -- <path>), "
            "read another ref with `git show <ref>:<path>`, or compare in a separate "
            "worktree (`git worktree add <tmp> <ref>`).",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # fail open: never block all Bash on a hook bug
        print(f"guard-worktree-git: internal error, allowing: {e}", file=sys.stderr)
        sys.exit(0)
