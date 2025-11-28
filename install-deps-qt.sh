#!/bin/bash
set -euo pipefail

# Optional: venv aktivieren
if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi

$PY -m pip install --upgrade pip
$PY -m pip uninstall -y PySimpleGUI >/dev/null 2>&1 || true
$PY -m pip install -r requirements.txt

# kurzer Test
$PY - <<'PY'
import sys
import PySide6
from PySide6 import QtWidgets
print('PySide6 OK:', PySide6.__version__)
app = QtWidgets.QApplication(sys.argv)
print('Qt platform:', app.platformName())
PY

echo "Fertig. Starte die neue App mit: $PY src/app_qt.py"
