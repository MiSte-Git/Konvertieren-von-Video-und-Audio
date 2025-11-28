#!/bin/bash
set -euo pipefail

APP_NAME="konvertierung"
PREFIX="/opt/$APP_NAME"
DESKTOP_TARGET="/usr/share/applications/$APP_NAME.desktop"
ICON_TARGET="/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png"

if [ ! -f dist/$APP_NAME ]; then
  echo "Fehler: dist/$APP_NAME nicht gefunden. Bitte zuerst ./pyinstaller-linux.sh ausführen." >&2
  exit 1
fi

mkdir -p pkg/$APP_NAME/usr/share/applications
mkdir -p pkg/$APP_NAME/usr/share/icons/hicolor/256x256/apps
mkdir -p pkg/$APP_NAME$PREFIX

# Binary kopieren
install -m 755 dist/$APP_NAME pkg/$APP_NAME$PREFIX/$APP_NAME

# Desktop-Datei anpassen und kopieren (Exec auf Installationspfad setzen)
sed "s|^Exec=.*$|Exec=$PREFIX/$APP_NAME|" desktop/konvertierung-python.desktop > pkg/$APP_NAME$DESKTOP_TARGET

# Icon kopieren (falls vorhanden)
if [ -f assets/icons/konvertierung.png ]; then
  install -m 644 assets/icons/konvertierung.png pkg/$APP_NAME$ICON_TARGET
fi

# Einfaches Installationsskript erzeugen
cat > pkg/$APP_NAME/install.sh <<'SH'
#!/bin/bash
set -euo pipefail
APP_NAME="konvertierung"
PREFIX="/opt/$APP_NAME"
DESKTOP_TARGET="/usr/share/applications/$APP_NAME.desktop"
ICON_TARGET="/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png"

sudo install -d -m 755 "$PREFIX"
sudo install -m 755 "$APP_NAME" "$PREFIX/$APP_NAME"
sudo install -D -m 644 "$DESKTOP_TARGET" "$DESKTOP_TARGET"
if [ -f "$ICON_TARGET" ]; then
  sudo install -D -m 644 "$ICON_TARGET" "$ICON_TARGET"
  command -v gtk-update-icon-cache >/dev/null 2>&1 && sudo gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
command -v update-desktop-database >/dev/null 2>&1 && sudo update-desktop-database -q || true

echo "Installiert. Starte über das Anwendungsmenü (Audio/Video) oder: $PREFIX/$APP_NAME"
SH
chmod +x pkg/$APP_NAME/install.sh

echo "Paket vorbereitet unter pkg/$APP_NAME"