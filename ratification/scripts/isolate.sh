#!/usr/bin/env bash
# Run one command inside a sample directory that cannot see unify's own documentation.
#
#   isolate.sh <sample-dir> <repo-root> <transcripts-dir> <command> [args...]
#
# The command runs with its working directory at /tmp/sandbox, which is <sample-dir>.
# Claude's per-project transcripts land in <transcripts-dir>. Extra paths to hide can be
# named in RATIFY_MASK, colon-separated. Runs as root, or unprivileged through a user
# namespace where the kernel allows one. Linux only.
#
# Why this exists: cwd is not isolation. A sample with a shell — or just Read with an
# absolute path — can reach every other copy of the tool on the box. A probe run confirmed
# it: the agent answered "NO" to the protocol's project-context question and, in the same
# breath, listed three conformance specs and six harness copies it had just found. Rounds
# 16-18 ran from /tmp/r16../tmp/r18 and were exposed the same way; round 29's first probe
# found the published package source in the bun cache.
#
# So the sample gets: a fresh empty /tmp holding only itself, an empty directory over the
# repository, over the package caches that hold unify's README and templates, and over
# every Claude project transcript but its own. Masking /tmp wholesale beats enumerating
# leak paths — the enumeration was wrong twice.
#
# Order matters. The sample and its transcript directory both live inside the repository,
# so each is bound to its new place BEFORE the repository is masked; bound afterwards, the
# path would name a directory inside the mask. Round 27 lost every transcript to exactly
# that ordering, silently, while each sample reported success.
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: isolate.sh <sample-dir> <repo-root> <transcripts-dir> <command> [args...]" >&2
  exit 2
fi
SAMPLE=$(cd "$1" && pwd)
REPO=$(cd "$2" && pwd)
mkdir -p "$3"
TRANSCRIPTS=$(cd "$3" && pwd)
shift 3

case "$REPO/" in
  /tmp/*) echo "isolate.sh: the repository is under /tmp, which every sample's view replaces; clone it elsewhere" >&2; exit 2 ;;
esac
CLAUDE_HOME=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
mkdir -p "$CLAUDE_HOME/projects"   # a mount point must exist on the host side

if [ "$(id -u)" = 0 ]; then NS=(unshare --mount); else NS=(unshare --user --map-root-user --mount); fi

exec "${NS[@]}" bash -c '
  set -euo pipefail
  SAMPLE=$1 REPO=$2 TRANSCRIPTS=$3 CLAUDE_HOME=$4
  shift 4
  mount --make-rprivate /
  mount -t tmpfs -o mode=1777 tmpfs /tmp
  mkdir /tmp/sandbox
  mount --bind "$SAMPLE" /tmp/sandbox
  mount --bind "$TRANSCRIPTS" "$CLAUDE_HOME/projects"
  [ -f "$CLAUDE_HOME/CLAUDE.md" ] && mount --bind /dev/null "$CLAUDE_HOME/CLAUDE.md"
  mount -t tmpfs tmpfs "$REPO"
  IFS=: read -r -a EXTRA <<< "${RATIFY_MASK:-}"
  for d in "$HOME/.bun/install/cache" "$HOME/.npm" "$HOME/.cache/unify" "${EXTRA[@]}"; do
    if [ -n "$d" ] && [ -d "$d" ]; then mount -t tmpfs tmpfs "$d"; fi
  done
  cd /tmp/sandbox
  exec "$@"
' _ "$SAMPLE" "$REPO" "$TRANSCRIPTS" "$CLAUDE_HOME" "$@"
