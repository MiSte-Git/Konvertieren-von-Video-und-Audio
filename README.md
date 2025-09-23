# Konvertierung Audio-Video

Bash-Skript mit Zenity-Oberfläche zum Konvertieren von Video- und Audiodateien.
Die Optionen umfassen `Video zu MP3 (ffmpeg + LAME)`, `Audio zu MP3 (ffmpeg + LAME)` und `Video mit DivX zu AVI (Panasonic TV)`.
Für jede Auswahl wird eine Datei per Dialog bestimmt, während ein Fortschrittsfenster läuft.

## Voraussetzungen
- Debian/Ubuntu oder kompatible Distribution
- `ffmpeg`
- `lame`
- `zenity`

Installation unter Debian/Ubuntu:
```bash
sudo apt install ffmpeg lame zenity
```

## Projektstruktur
```
convert_to_mp3_Lame.sh      # Hauptskript
desktop/konvertierung-audio-video.desktop  # Vorlage für Menüeintrag
```

## Installation des Skripts
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

## Menüeintrag anlegen

### Nur für den aktuellen Benutzer
1. Desktop-Datei kopieren:
   ```bash
   mkdir -p ~/.local/share/applications
   cp desktop/konvertierung-audio-video.desktop ~/.local/share/applications/
   ```
2. Falls das Skript an einem anderen Ort liegt, `Exec=` in der Desktop-Datei anpassen.
3. Optional ein eigenes Icon setzen (`Icon=`). Systemicons können unter `/usr/share/icons` gewählt werden.
4. Desktop-Datenbank aktualisieren (optional, GNOME):
   ```bash
   update-desktop-database ~/.local/share/applications
   ```
5. Der Eintrag erscheint danach im Anwendungsmenü unter "Audio & Video" (oder dem entsprechenden Bereich).

### Systemweit (z.B. für bestehende Installation unter `/usr/share/applications`)
1. Desktop-Datei installieren:
   ```bash
   sudo install -m 644 desktop/konvertierung-audio-video.desktop /usr/share/applications/convert-to-mp3_Lame.desktop
   ```
2. Namen/Icon/Kommentar nach Bedarf direkt in `/usr/share/applications/convert-to-mp3_Lame.desktop` anpassen, z.B.:
   ```ini
   [Desktop Entry]
   Name=Konvertieren von Video/Audio (MiSt)
   Comment=Konvertiert MP4-Dateien in MP3 mit FFmpeg, LAME und DivX
   Exec=/usr/local/bin/convert_to_mp3_Lame.sh
   Icon=multimedia
   ```
3. Desktop-Datenbank aktualisieren (optional, GNOME):
   ```bash
   sudo update-desktop-database /usr/share/applications
   ```
4. Systemweite Einträge erscheinen für alle Benutzer im Menü.

## Aktualisieren
Bei Änderungen am Skript erneut Schritt 2 aus der Installation ausführen.
Für Anpassungen am Menüeintrag die Desktop-Datei im Home-Verzeichnis editieren.

## Fehlerbehebung
- **Fehlende Programme:** Sicherstellen, dass `ffmpeg`, `lame` und `zenity` installiert sind.
- **Keine GUI:** Das Skript benötigt eine grafische Sitzung.
- **Konvertierung schlägt fehl:** Fehlermeldung prüfen. Bei ffmpeg-Fehlern Terminal starten und Skript dort aufrufen.

## Lizenz
Bitte hier nach Bedarf ergänzen.
