#!/bin/bash
set -e

# Usage: ./scripts/bump-version-release.sh [patch|minor|major]
# Default: patch

BUMP_TYPE=${1:-patch}

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required. Install with 'sudo apt-get install jq'"
  exit 1
fi

PKG_FILE="package.json"

# Get current version
CUR_VERSION=$(jq -r .version "$PKG_FILE")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CUR_VERSION"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR+1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR+1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH+1))
    ;;
  *)
    echo "Unknown bump type: $BUMP_TYPE. Use patch, minor, or major."
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Update package.json
jq ".version = \"$NEW_VERSION\"" "$PKG_FILE" > "$PKG_FILE.tmp" && mv "$PKG_FILE.tmp" "$PKG_FILE"

# Commit, tag, and push

git add "$PKG_FILE"
git commit -m "chore: bump version to v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push
git push --tags

echo "Version bumped to $NEW_VERSION, committed, tagged, and pushed."
