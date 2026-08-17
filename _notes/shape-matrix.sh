#!/usr/bin/env bash
# Malformed-document matrix: every page shape × layout shape, against a given unify.
# Reports exit code, whether the page's MARKER survived into output, and the first
# diagnostic line. Silent content loss = exit 0 with marker absent.
set -u
UNIFY="$1"
BASE=/tmp/shape-matrix; rm -rf "$BASE"; mkdir -p "$BASE"

page_shape() { # $1=name -> file content on stdout
  case "$1" in
    complete)   printf '<!doctype html><html><head><title>P</title></head><body><p>MARKER-P</p></body></html>' ;;
    fragment)   printf '<ul><li>MARKER-P</li></ul>' ;;
    text-only)  printf 'MARKER-P plain text, no tags' ;;
    empty)      printf '' ;;
    doctype)    printf '<!doctype html>' ;;
    head-only)  printf '<!doctype html><html><head><title>MARKER-P</title></head></html>' ;;
    body-no-html) printf '<body><p>MARKER-P</p></body>' ;;
    html-no-body) printf '<!doctype html><html><p>MARKER-P</p></html>' ;;
    comment)    printf '<!-- MARKER-P only a comment -->' ;;
    main-only)  printf '<main><p>MARKER-P</p></main>' ;;
  esac
}
layout_shape() {
  case "$1" in
    none)       return 1 ;;
    complete)   printf '<!doctype html><html><head><title>— S</title></head><body><header>H</header><main><slot></slot></main></body></html>' ;;
    no-body)    printf '<!doctype html><html><head><title>— S</title></head></html>' ;;
    fragment)   printf '<main><slot></slot></main>' ;;
    empty)      printf '' ;;
  esac
}

printf '%-14s %-10s %-5s %-7s %s\n' PAGE LAYOUT exit marker first-diagnostic
for p in complete fragment text-only empty doctype head-only body-no-html html-no-body comment main-only; do
  for l in none complete no-body fragment empty; do
    d="$BASE/$p--$l"; mkdir -p "$d/src"
    page_shape "$p" > "$d/src/index.html"
    if [ "$l" != none ]; then layout_shape "$l" > "$d/src/_layout.html"; fi
    out=$("$UNIFY" build -s "$d/src" -o "$d/dist" 2>&1); code=$?
    if grep -rq "MARKER-P" "$d/dist" 2>/dev/null; then mk=yes; else mk=NO; fi
    diag=$(printf '%s' "$out" | grep -m1 -E "problem:|advisory:|error" | cut -c1-90)
    flag=""
    [ "$code" = 0 ] && [ "$mk" = NO ] && [ "$p" != empty ] && [ "$p" != doctype ] && [ "$p" != comment ] && flag="  <-- SILENT LOSS"
    printf '%-14s %-10s %-5s %-7s %s%s\n' "$p" "$l" "$code" "$mk" "${diag:-—}" "$flag"
  done
done
