#!/usr/bin/env bash
# Run this from inside the fonts/ folder (or point OUT_DIR elsewhere).
# Downloads the exact woff2 files Google Fonts already serves for the
# weights Beast uses, and names them to match the @font-face block in
# index.html and the precache list in sw.js. Requires internet + curl.
#
# Usage:
#   cd fonts && bash fetch-fonts.sh
set -uo pipefail
OUT_DIR="$(pwd)"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

fetch_one () {
  local css_url="$1" out_name="$2"
  local css woff_url
  css="$(curl -s -A "$UA" "$css_url")"
  # Google returns one @font-face block per unicode-range subset; the block
  # covering basic Latin (U+0000-00FF...) is the one Beast's English UI needs.
  woff_url="$(echo "$css" | awk '
    /@font-face/{block=""}
    {block = block "\n" $0}
    /unicode-range: *U\+0000-00FF/{found=block}
    END{print found}
  ' | grep -oE "https://fonts.gstatic.com[^)]+\.woff2" | head -n1)"

  if [ -z "$woff_url" ]; then
    echo "  ! could not find a Latin woff2 in response for $out_name — skipping" >&2
    return 1
  fi
  curl -s -A "$UA" -o "$OUT_DIR/$out_name" "$woff_url"
  echo "  wrote $out_name  <-  $woff_url"
}

echo "Fetching Public Sans..."
fetch_one "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400&display=swap" "public-sans-400.woff2" || true
fetch_one "https://fonts.googleapis.com/css2?family=Public+Sans:wght@500&display=swap" "public-sans-500.woff2" || true
fetch_one "https://fonts.googleapis.com/css2?family=Public+Sans:wght@600&display=swap" "public-sans-600.woff2" || true
fetch_one "https://fonts.googleapis.com/css2?family=Public+Sans:wght@700&display=swap" "public-sans-700.woff2" || true

echo "Fetching Fraunces (opsz 9..144)..."
fetch_one "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap" "fraunces-500.woff2" || true
fetch_one "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap" "fraunces-600.woff2" || true
fetch_one "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&display=swap" "fraunces-700.woff2" || true

echo "Done. Expect 7 .woff2 files in $OUT_DIR:"
ls -la "$OUT_DIR"/*.woff2 2>/dev/null || echo "(none written — check errors above)"
