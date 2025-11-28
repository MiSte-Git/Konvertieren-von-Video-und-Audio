# Konvertierung Audio-Video

Dieses Repository enthält zwei Varianten:

1) Bash-Skript mit Zenity-Oberfläche (Linux): `convert_to_mp3_Lame.sh`
2) Neue plattformübergreifende Python-GUI (PySimpleGUI): `src/app.py`

Die Python-App unterstützt die gleichen Modi:
- Video → MP3 (ffmpeg + libmp3lame)
- Audio → MP3 (ffmpeg + libmp3lame)
- Video → AVI (DivX/Xvid-kompatibel, qscale=7)

Es wird ein pulsierender Fortschritt und ein Live‑Timer angezeigt. Nach Abschluss/Abbruch/Fehler wird die Dauer gezeigt. Optional wird bei DivX per ffprobe die Laufzeit verglichen.

## Voraussetzungen (Python-App)
- Python 3.8+
- ffmpeg im PATH (optional ffprobe) oder beigepackt in `bin/` bzw. `bin/<os>`
  - `<os>` ist `linux`, `windows` oder `darwin` (macOS)

### Entwicklung / Start
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python src/app.py
```

### ffmpeg/ffprobe beilegen
Lege die Binaries in folgende Pfade (je nach Zielplattform):
- `bin/` (global für alle Plattformen)
- `bin/linux`, `bin/windows`, `bin/darwin` (plattform-spezifisch)

Die App erweitert beim Start automatisch den PATH um diese Ordner.

### Build (PyInstaller)
PyInstaller muss pro Zielplattform auf dieser Plattform ausgeführt werden.

Linux (Onefile, GUI):
```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name konvertierung \
  --add-data "bin:bin" \
  src/app.py
```
Ergebnis: `dist/konvertierung`

Windows (.exe) – auf Windows ausführen:
```powershell
pyinstaller --onefile --windowed --name konvertierung `
  --add-data "bin;bin" `
  src/app.py
```

macOS (Onefile) – auf macOS ausführen:
```bash
pyinstaller --onefile --windowed --name konvertierung \
  --add-data "bin:bin" \
  src/app.py
```

## Bash-Skript (Linux)
Voraussetzungen: `ffmpeg`, `lame`, `zenity`

Installation unter Debian/Ubuntu:
```bash
sudo apt install ffmpeg lame zenity
```

Projektstruktur (Ausschnitt):
```
convert_to_mp3_Lame.sh                     # Bash-Hauptskript
src/app.py                                  # Python GUI
requirements.txt                            # Python-Abhängigkeiten
```

### Installation des Bash-Skripts
1. Skript ausführbar machen:
   ```bash
   chmod +x convert_to_mp3_Lame.sh
   ```
2. Systemweit nach `/usr/local/bin` installieren (erfordert sudo):
   ```bash
   sudo install -m 755 convert_to_mp3_Lame.sh /usr/local/bin/convert_to_mp3_Lame.sh
   ```
3. Testen, ob das Skript läuft:
   ```bash
   /usr/local/bin/convert_to_mp3_Lame.sh
   ```

## Fehlerbehebung (Python-App)
- ffmpeg/ffprobe werden nicht gefunden: Binaries in `bin/` oder `bin/<os>` ablegen oder Systeminstallation vornehmen.
- Keine GUI: Stelle sicher, dass eine grafische Sitzung verfügbar ist.
- Konvertierung schlägt fehl: Log (bei DivX) prüfen und/oder ffmpeg im Terminal testen.

## Lizenz
Bitte hier nach Bedarf ergänzen.
