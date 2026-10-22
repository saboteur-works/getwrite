#!/usr/bin/env bash
# Read-only size measurement of build output directories (Feature 91, FR-19).
# Usage: measure-build-size.sh <dir> [<dir> ...]
# For each directory prints: apparent bytes (sum of file sizes via stat),
# disk bytes (du -sk * 1024), file count, and *.woff2 file count.
# Reads only the directories named; writes nothing.
set -u
for d in "$@"; do
  if [ ! -d "$d" ]; then
    echo "$d: MISSING"
    continue
  fi
  apparent=$(find "$d" -type f -exec stat -f '%z' {} + | awk '{s+=$1} END {printf "%d", s}')
  disk_kb=$(du -sk "$d" | awk '{print $1}')
  files=$(find "$d" -type f | wc -l | tr -d ' ')
  woff2=$(find "$d" -type f -name '*.woff2' | wc -l | tr -d ' ')
  echo "$d: apparent_bytes=$apparent disk_bytes=$((disk_kb * 1024)) files=$files woff2=$woff2"
done
