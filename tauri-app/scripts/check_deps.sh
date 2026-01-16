#!/usr/bin/env bash
set -euo pipefail

missing=0

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
RESET="\033[0m"

ok() {
  echo -e "${GREEN}OK:${RESET} $1"
}

miss() {
  echo -e "${RED}Fehlt:${RESET} $1"
  missing=1
}

note() {
  echo -e "${YELLOW}Hinweis:${RESET} $1"
}

need() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    miss "$cmd"
  else
    ok "$cmd"
  fi
}

need rustc
need cargo
need ffmpeg
need pkg-config
need cargo-tauri
if command -v cargo-tauri >/dev/null 2>&1; then
  tauri_ver="$(cargo tauri --version 2>/dev/null | awk '{print $2}')"
  if [ -n "$tauri_ver" ]; then
    tauri_major="${tauri_ver%%.*}"
    if [ "$tauri_major" -lt 2 ]; then
      note "tauri-cli $tauri_ver erkannt, fuer dieses Projekt wird v2 benoetigt"
      missing=1
    else
      ok "tauri-cli $tauri_ver"
    fi
  else
    note "tauri-cli Version konnte nicht ermittelt werden"
  fi
fi

if command -v uname >/dev/null 2>&1; then
  os="$(uname -s)"
  if [ "$os" = "Linux" ]; then
    if pkg-config --exists gtk+-3.0; then
      ok "gtk+-3.0"
    else
      miss "gtk+-3.0 (libgtk-3-dev)"
    fi
    if pkg-config --exists webkit2gtk-4.1; then
      ok "webkit2gtk-4.1"
    else
      miss "webkit2gtk-4.1 (libwebkit2gtk-4.1-dev)"
    fi
  fi
  if [ "$os" = "Darwin" ]; then
    if xcode-select -p >/dev/null 2>&1; then
      ok "Xcode Command Line Tools"
    else
      miss "Xcode Command Line Tools"
    fi
  fi
fi

if [ "$missing" -eq 1 ]; then
  miss "Es fehlen Abhaengigkeiten."
  exit 1
fi

ok "Alle erforderlichen Abhaengigkeiten sind vorhanden."
