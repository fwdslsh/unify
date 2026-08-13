#!/usr/bin/env bash
# Run one ratification sample inside a private mount namespace.
#   isolate.sh <sample-dir> <prompt-file> <model> <timeout-secs> <allowed-tools...>
#
# Why this exists: cwd is not isolation. A sample with a shell — or just Read with an
# absolute path — can reach every other copy of the tool on the box. A probe run confirmed
# it: the agent answered "NO" to the protocol's project-context question and, in the same
# breath, listed three conformance specs and six harness copies it had just found. Rounds
# 16-18 ran from /tmp/r16../tmp/r18 and were exposed the same way.
#
# So the sample gets: its own directory as /sandbox, a fresh empty writable /tmp, and an
# empty directory over the repo and over this project's Claude transcripts. Masking /tmp
# wholesale beats enumerating leak paths — the enumeration was wrong twice.
set -u
DIR="$1"; PROMPT="$2"; MODEL="$3"; TMO="$4"; shift 4
TOOLS=("$@")

unshare -m bash -c '
  set -u
  DIR="$1"; PROMPT="$2"; MODEL="$3"; TMO="$4"; shift 4
  mount --bind "$DIR" /sandbox            # bind the sample in while its real path lives
  mount --bind /var/ratify-tmp /tmp       # ... then drop every other /tmp copy at once
  mount --bind /var/empty-ratify /home/user/unify
  P=/root/.claude/projects/-home-user-unify
  [ -e "$P" ] && mount --bind /var/empty-ratify "$P"
  # Samples run with cwd /sandbox, so their transcripts all land (and are in
  # principle readable) in projects/-sandbox — mask it too (round-21 lesson).
  S=/root/.claude/projects/-sandbox
  mkdir -p "$S" && mount --bind /var/empty-ratify "$S"
  cd /sandbox || exit 1
  printf "%s" "$(cat "/sandbox/$PROMPT")" | timeout "$TMO" claude -p \
      --model "$MODEL" --permission-mode acceptEdits --allowedTools "$@" \
      > /sandbox/.agent-stdout.txt 2> /sandbox/.agent-stderr.txt
  echo "$?" > /sandbox/.exit
' _ "$DIR" "$PROMPT" "$MODEL" "$TMO" "${TOOLS[@]}"
