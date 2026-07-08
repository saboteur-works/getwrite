#!/usr/bin/env bash
# .claude/hooks/require-plan-approval.sh
#
# PreToolUse gate for Edit/Write/MultiEdit.
#   - Outside a /ship run: allow everything.
#   - Inside a run: always allow writes into the spec/docs area (Stages 1-2 need
#     this), but block writes anywhere else until the plan is approved (Stage 3).
#   exit 0 = allow, exit 2 = block.  (exit 1 does NOT block — only 2 does.)
# Requires: jq

payload="$(cat)"

root="${CLAUDE_PROJECT_DIR:-$PWD}"
active="$root/.claude/.pipeline-active"
approved="$root/.claude/.plan-approved"

# Directory (relative to repo root) where docs may be written at any stage.
# Set this to match the spec-manager's path convention.
spec_prefix="specs/"

# Not inside a pipeline run -> don't interfere with normal editing.
[ -f "$active" ] || exit 0

# Target path of the write.
path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"

# Spec/doc writes are always allowed during a run (matches relative or absolute).
case "$path" in
  "$spec_prefix"* | "$root/$spec_prefix"* | */"$spec_prefix"* ) exit 0 ;;
esac

# Everything else is treated as code: allowed only once the plan is approved.
[ -f "$approved" ] && exit 0

echo "Implementation gate closed: only ${spec_prefix} files may be written before the plan is approved (Stage 3 / ExitPlanMode). Target was: ${path:-unknown}" >&2
exit 2