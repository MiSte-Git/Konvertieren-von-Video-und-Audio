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

  # 1) Bereits vorhandene Lizenzdateien im Projektordner einsammeln
  for p in bin/linux bin; do
    if [ -d "$p" ]; then
      # Lizenz-/Copyright-/README-Dateien übernehmen
      find "$p" -maxdepth 1 -type f \( \
        -iname 'license*' -o -iname 'copying*' -o -iname 'copyright*' -o -iname 'readme*' \
      \) -exec cp -a {} "$dest/" \; 2>/dev/null || true
    fi
  done

  # 2) Debian/Ubuntu-typischer Pfad
  if [ -d /usr/share/doc/ffmpeg ]; then
    cp -a /usr/share/doc/ffmpeg/* "$dest/" 2>/dev/null || true
  fi

  # 3) Über dpkg Paketnamen herausfinden und Doc-Verzeichnis übernehmen
  if command -v dpkg >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1; then
    local pkg
    pkg=$(dpkg -S "$(command -v ffmpeg)" 2>/dev/null | cut -d: -f1 | head -n1 || true)
    if [ -n "${pkg:-}" ] && [ -d "/usr/share/doc/$pkg" ]; then
      cp -a "/usr/share/doc/$pkg/"* "$dest/" 2>/dev/null || true
    fi
  fi
}

copy_ffmpeg_licenses || true

# Build mit beigepackten Binaries (bin/ -> bin/ im Bundle)
pyinstaller --onefile --windowed --name "$APP_NAME" \
  --hidden-import PySide6 \
  --collect-all PySide6 \
  --add-data "bin:bin" \
  src/app_qt.py

echo "Build fertig: dist/$APP_NAME"
