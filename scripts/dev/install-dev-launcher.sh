#!/usr/bin/env bash
# Legt einen Starter "Konvertierung Audio-Video (Dev)" an, der die App
# immer aus diesem Repo startet (kein Neuinstallieren bei Code-Aenderungen).
#   Linux: Eintrag im Anwendungsmenue (an Taskleiste anheftbar)
#   macOS: ~/Applications/Konvertierung Audio-Video (Dev).command
# Entfernen: bash scripts/dev/install-dev-launcher.sh --remove
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
START="$REPO/scripts/dev/dev-start.sh"
ICON="$REPO/tauri-app/src-tauri/icons/icon.png"
NAME="Konvertierung Audio-Video (Dev)"

case "$(uname -s)" in
  Linux)
    TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/applications/konvertierung-dev.desktop"
    if [ "${1:-}" = "--remove" ]; then
      rm -f "$TARGET"
      echo "Entfernt: $TARGET"
      exit 0
    fi
    mkdir -p "$(dirname "$TARGET")"
    cat >"$TARGET" <<EOF
[Desktop Entry]
Type=Application
Name=$NAME
Comment=Startet die App aus $REPO (cargo tauri dev)
Exec=bash "$START"
Icon=$ICON
Terminal=false
Categories=AudioVideo;Development;
StartupWMClass=konvertierung-tauri
EOF
    command -v update-desktop-database >/dev/null 2>&1 \
      && update-desktop-database -q "$(dirname "$TARGET")" || true
    echo "Starter angelegt: $TARGET"
    echo "Log bei Start aus dem Menue: ~/.cache/konvertierung-dev.log"
    ;;
  Darwin)
    TARGET="$HOME/Applications/$NAME.command"
    if [ "${1:-}" = "--remove" ]; then
      rm -f "$TARGET"
      echo "Entfernt: $TARGET"
      exit 0
    fi
    mkdir -p "$HOME/Applications"
    printf '#!/bin/bash\nexec bash "%s"\n' "$START" >"$TARGET"
    chmod +x "$TARGET"
    echo "Starter angelegt: $TARGET (oeffnet ein Terminal mit der Build-Ausgabe)"
    ;;
  *)
    echo "Nicht unterstuetzt. Unter Windows: scripts\\dev\\install-dev-shortcut.ps1" >&2
    exit 1
    ;;
esac
