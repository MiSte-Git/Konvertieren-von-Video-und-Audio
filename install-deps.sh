#!/bin/bash
set -euo pipefail

# Installiert/aktualisiert PySimpleGUI vom privaten Index.
# Optional: Aktiviert .venv automatisch, wenn vorhanden.

# venv aktivieren, falls vorhanden
if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# Python/Prüfkommando wählen
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Fehler: Weder python3 noch python gefunden." >&2
  exit 1
fi

echo "Verwende $($PY --version 2>/dev/null)"

# Prüfen, ob die vorhandene PySimpleGUI-Installation nur der Stub ist
is_stub() {
  $PY - <<'PY' 2>/dev/null
import sys
try:
    import PySimpleGUI as sg
except Exception:
    sys.exit(1)
# Prüfe auf typische Attribute
ok = all(hasattr(sg, name) for name in ("Text", "Window", "Button"))
sys.exit(0 if ok else 2)
PY
  rc=$?
  if [ $rc -eq 0 ]; then
    return 1  # ist ok, kein Stub
  fi
  return 0    # Stub oder nicht installiert
}

# Wenn Stub oder nicht installiert: sauber (re)installieren
if is_stub; then
  echo "(Re)installiere PySimpleGUI vom privaten Index ..."
  set +e
  $PY -m pip uninstall -y PySimpleGUI >/dev/null 2>&1
  $PY -m pip cache purge >/dev/null 2>&1
  set -e
  $PY -m pip install --upgrade --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
else
  echo "PySimpleGUI ist bereits korrekt installiert."
fi

# Ergebnis prüfen
$PY - <<'PY'
import PySimpleGUI as sg
print("PySimpleGUI Version:", getattr(sg, "version", "?"))
print("Verfügbar:", all(hasattr(sg, name) for name in ("Text", "Window", "Button", "ProgressBar")))
PY

echo "Fertig. Starte die App mit: $PY src/app.py"
