#!/usr/bin/env bash
# Startet die App im Entwicklungsmodus direkt aus dem Repo (Linux/macOS).
# UI-Aenderungen (tauri-app/ui) werden live neu geladen,
# Rust-Aenderungen (tauri-app/src-tauri) werden automatisch neu kompiliert.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# cargo ist bei Start aus dem Anwendungsmenue oft nicht im PATH
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
# macOS: Homebrew-Pfade (ffmpeg/lame) fuer GUI-Starts ergaenzen
for p in /opt/homebrew/bin /usr/local/bin; do
  [ -d "$p" ] && case ":$PATH:" in *":$p:"*) ;; *) PATH="$p:$PATH" ;; esac
done
export PATH

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo nicht gefunden. Bitte Rust installieren: https://rustup.rs" >&2
  exit 1
fi
if ! cargo tauri --version >/dev/null 2>&1; then
  echo "tauri-cli fehlt, installiere via cargo ..."
  cargo install tauri-cli --version "^2" --locked
fi

cd "$REPO/tauri-app"

# Aus Terminal gestartet: Ausgabe direkt anzeigen. Aus Menue/Dock: in Logdatei schreiben.
if [ -t 1 ]; then
  exec cargo tauri dev
else
  LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
  mkdir -p "$LOG_DIR"
  exec cargo tauri dev >"$LOG_DIR/konvertierung-dev.log" 2>&1
fi
