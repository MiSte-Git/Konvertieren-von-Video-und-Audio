#!/bin/bash
set -euo pipefail

APP_NAME="konvertierung"
VERSION="1.0.0"
ARCH="amd64"
PREFIX="/opt/$APP_NAME"

# Prüfen
[ -f dist/$APP_NAME ] || { echo "dist/$APP_NAME fehlt. Erst bauen: ./pyinstaller-linux.sh" >&2; exit 1; }

# Staging
PKGDIR="deb/$APP_NAME-$VERSION"
ROOT="$PKGDIR/$APP_NAME-$VERSION"
DEBIAN="$ROOT/DEBIAN"
mkdir -p "$DEBIAN" "$ROOT$PREFIX" "$ROOT/usr/share/applications" "$ROOT/usr/share/icons/hicolor/256x256/apps"

# Dateien
install -m 755 dist/$APP_NAME "$ROOT$PREFIX/$APP_NAME"
if [ -f assets/icons/konvertierung.png ]; then
  install -m 644 assets/icons/konvertierung.png "$ROOT/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png"
fi
# Desktop-Datei
sed "s|^Exec=.*$|Exec=$PREFIX/$APP_NAME|" desktop/konvertierung-python.desktop > "$ROOT/usr/share/applications/$APP_NAME.desktop"

# DEBIAN/control
cat > "$DEBIAN/control" <<CTRL
Package: $APP_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: libc6 (>= 2.31)
Maintainer: Unset <unset@example.com>
Description: Konvertiert Video/Audio (ffmpeg, DivX/MP3)
 A einfache GUI-Anwendung auf Basis von PySide6/Qt.
CTRL

# DEBIAN/postinst
cat > "$DEBIAN/postinst" <<'POST'
#!/bin/sh
set -e
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q || true
fi
exit 0
POST
chmod 755 "$DEBIAN/postinst"

# Build .deb
fakeroot dpkg-deb --build "$ROOT" "deb/${APP_NAME}_${VERSION}_${ARCH}.deb"

echo "Fertig: deb/${APP_NAME}_${VERSION}_${ARCH}.deb"
