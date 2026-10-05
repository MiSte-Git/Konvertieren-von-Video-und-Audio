#!/usr/bin/env bash
# CI (macOS): legt ffmpeg, ffprobe und lame nach bin/darwin/, damit sie in die App gebuendelt werden.
# ffmpeg/ffprobe: statische Builds von ffmpeg.martin-riedl.de
# lame: wird aus den Quellen statisch gebaut (keine Homebrew-Abhaengigkeiten)
set -euo pipefail

LAME_VERSION="4.0"
LAME_SHA256="3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DST="$REPO/bin/darwin"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=amd64 ;;
  *) echo "Unbekannte Architektur: $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$DST"

for tool in ffmpeg ffprobe; do
  curl -fsSL --retry 3 -o "$TMP/$tool.zip" \
    "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$ARCH/release/$tool.zip"
  unzip -o -q "$TMP/$tool.zip" -d "$DST"
done

curl -fsSL --retry 3 -o "$TMP/lame.tar.gz" \
  "https://downloads.sourceforge.net/project/lame/lame/$LAME_VERSION/lame-$LAME_VERSION.tar.gz"
echo "$LAME_SHA256  $TMP/lame.tar.gz" | shasum -a 256 -c -
tar -xzf "$TMP/lame.tar.gz" -C "$TMP"
(
  cd "$TMP/lame-$LAME_VERSION"
  export ac_cv_prog_cc_c23=no
  export CFLAGS="${CFLAGS:-} -O2 -Wno-implicit-function-declaration"
  ./configure --disable-dependency-tracking --disable-debug \
    --disable-shared --enable-static --prefix="$TMP/inst"
  make -j"$(sysctl -n hw.ncpu)"
  make install
)
cp "$TMP/inst/bin/lame" "$DST/lame"

chmod +x "$DST/ffmpeg" "$DST/ffprobe" "$DST/lame"

echo "--- Pruefung"
"$DST/ffmpeg" -hide_banner -version | head -n 1
"$DST/ffprobe" -hide_banner -version | head -n 1
"$DST/lame" --version | head -n 1
echo "--- Bibliotheken von lame (nur System-Libs erwartet)"
otool -L "$DST/lame"
