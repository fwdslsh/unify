#!/usr/bin/env bash
# Run one command inside a sample directory that cannot see unify's own documentation.
#
#   isolate.sh <sample-dir> <repo-root> <state-dir> <command> [args...]
#
# The command runs with its working directory at /tmp/sandbox, which is <sample-dir>.
# OpenCode's data directory (its session database, logs and snapshots) is <state-dir>, so a
# sample's session is kept and the user's own OpenCode history is not visible. Extra paths
# to hide can be named in RATIFY_MASK, colon-separated. Runs as root, or unprivileged
# through a user namespace where the kernel allows one. Linux only.
#
# Why this exists: cwd is not isolation. A sample with a shell — or just a file tool given
# an absolute path — can reach every other copy of the tool on the box. A probe run
# confirmed it: the agent answered "NO" to the protocol's project-context question and, in
# the same breath, listed three conformance specs and six harness copies it had just found.
# Rounds 16-18 ran from /tmp/r16../tmp/r18 and were exposed the same way; round 29's first
# probe found the published package source in the bun cache.
#
# So the sample gets: a fresh empty /tmp holding only itself, and an empty directory over
# the repository, the package caches that hold unify's README and templates, the user's
# OpenCode configuration (instructions, agents, commands, plugins, MCP servers, skills —
# run-round.mjs passes the providers back in) and prompt history, and the Claude and agents
# directories whose skills and CLAUDE.md OpenCode would otherwise load. Masking /tmp wholesale beats
# enumerating leak paths — the enumeration was wrong twice.
#
# Order matters. The sample and its state directory both live inside the repository, so
# each is bound to its new place BEFORE the repository is masked; bound afterwards, the
# path would name a directory inside the mask. Round 27 lost every transcript to exactly
# that ordering, silently, while each sample reported success.
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: isolate.sh <sample-dir> <repo-root> <state-dir> <command> [args...]" >&2
  exit 2
fi
SAMPLE=$(cd "$1" && pwd)
REPO=$(cd "$2" && pwd)
mkdir -p "$3"
STATE=$(cd "$3" && pwd)
shift 3

case "$REPO/" in
  /tmp/*) echo "isolate.sh: the repository is under /tmp, which every sample's view replaces; clone it elsewhere" >&2; exit 2 ;;
esac
DATA=${XDG_DATA_HOME:-$HOME/.local/share}/opencode
CONFIG=${XDG_CONFIG_HOME:-$HOME/.config}/opencode
HISTORY=${XDG_STATE_HOME:-$HOME/.local/state}/opencode
mkdir -p "$DATA"   # a mount point must exist on the host side

if [ "$(id -u)" = 0 ]; then NS=(unshare --mount); else NS=(unshare --user --map-root-user --mount); fi

exec "${NS[@]}" bash -c '
  set -euo pipefail
  SAMPLE=$1 REPO=$2 STATE=$3 DATA=$4 CONFIG=$5 HISTORY=$6
  shift 6
  mount --make-rprivate /
  mount -t tmpfs -o mode=1777 tmpfs /tmp
  mkdir /tmp/sandbox
  mount --bind "$SAMPLE" /tmp/sandbox
  mount --bind "$STATE" "$DATA"
  mount -t tmpfs tmpfs "$REPO"
  IFS=: read -r -a EXTRA <<< "${RATIFY_MASK:-}"
  for d in "$CONFIG" "$HISTORY" "$HOME/.claude" "$HOME/.agents" "$HOME/.bun/install/cache" "$HOME/.npm" "$HOME/.cache/unify" "${EXTRA[@]}"; do
    if [ -n "$d" ] && [ -d "$d" ]; then mount -t tmpfs tmpfs "$d"; fi
  done
  cd /tmp/sandbox
  exec "$@"
' _ "$SAMPLE" "$REPO" "$STATE" "$DATA" "$CONFIG" "$HISTORY" "$@"
