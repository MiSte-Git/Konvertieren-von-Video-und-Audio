#!/bin/bash
set -euo pipefail
APP_NAME="konvertierung"

# Optional: venv nutzen, falls vorhanden
if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# Prüfen, ob PyInstaller installiert ist
if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "Installing pyinstaller..."
  pip install pyinstaller
fi

# Lizenzen automatisch beilegen (falls auffindbar)
copy_ffmpeg_licenses() {
  local dest="bin/licenses/ffmpeg"
  mkdir -p "$dest"

  for p in bin/darwin bin; do
    if [ -d "$p" ]; then
      find "$p" -maxdepth 1 -type f \( \
        -iname 'license*' -o -iname 'copying*' -o -iname 'readme*' \
      \) -exec cp -a {} "$dest/" \; 2>/dev/null || true
    fi
  done
}

copy_ffmpeg_licenses || true

# Build als .app (empfohlen für macOS) und bin/ einpacken
pyinstaller --windowed --name "$APP_NAME" \
  --hidden-import PySide6 \
  --collect-all PySide6 \
  --add-data "bin:bin" \
  --osx-bundle-identifier "de.example.konvertierung" \
  --plist "macos/Info.plist" \
  src/app_qt.py

echo "Build fertig: dist/$APP_NAME.app"
