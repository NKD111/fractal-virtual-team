#!/usr/bin/env bash
# install-kenney.sh — one-shot helper to download Kenney Furniture Kit and
# extract the GLB files into frontend/public/assets/kenney/
#
# Usage (from frontend/):
#   bash scripts/install-kenney.sh
#
# Notes:
# - Kenney pack URLs change occasionally. If this script fails, manually
#   download from https://kenney.nl/assets/furniture-kit and unzip the
#   GLB files into public/assets/kenney/.
# - All Kenney packs are CC0; you can vendor them in the repo.

set -euo pipefail

DEST="$(pwd)/public/assets/kenney"
TMP="$(mktemp -d)"

echo "→ Destination: $DEST"
mkdir -p "$DEST"
cd "$TMP"

PACK_URL="https://kenney.nl/media/pages/assets/furniture-kit/4dec9b41a4-1741027867/kenney_furniture-kit.zip"

echo "→ Downloading Kenney Furniture Kit…"
if command -v curl >/dev/null 2>&1; then
  curl -fL "$PACK_URL" -o pack.zip
elif command -v wget >/dev/null 2>&1; then
  wget -O pack.zip "$PACK_URL"
else
  echo "✗ Need curl or wget. Aborting."
  exit 1
fi

echo "→ Unzipping…"
if command -v unzip >/dev/null 2>&1; then
  unzip -oq pack.zip
else
  echo "✗ Need unzip. Aborting."
  exit 1
fi

echo "→ Copying GLB files…"
find . -type f -name "*.glb" -exec cp -v {} "$DEST/" \;

echo "→ Cleanup…"
cd / && rm -rf "$TMP"

echo "✓ Kenney Furniture Kit installed at $DEST"
ls "$DEST" | head -20
