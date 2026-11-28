#!/usr/bin/env bash
# Erstellt ein Release und stellt danach auf die naechste Entwicklungsversion um.
#
#   scripts/release.sh            aktuelle Version ohne -dev (1.2.3-dev -> 1.2.3)
#   scripts/release.sh 1.3.0      bestimmte Version
#
# Ablauf: Version in Cargo.toml/Cargo.lock setzen, committen, Tag vX.Y.Z setzen,
# dann auf X.Y.(Z+1)-dev umstellen und committen. Nach Rueckfrage wird
# main mit dem Tag gepusht. GitHub Actions baut daraufhin den Release-Entwurf.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CARGO_TOML="$ROOT/tauri-app/src-tauri/Cargo.toml"
CARGO_LOCK="$ROOT/tauri-app/src-tauri/Cargo.lock"
CRATE="konvertierung-tauri"
BRANCH="main"

fail() { echo "Fehler: $*" >&2; exit 1; }

cd "$ROOT"

current=$(grep -m1 '^version' "$CARGO_TOML" | cut -d'"' -f2)
version=${1:-${current%-dev}}

[[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] \
  || fail "Version '$version' ungueltig, erwartet X.Y.Z (nur Zahlen)."
next="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))-dev"
tag="v$version"

[ "$(git branch --show-current)" = "$BRANCH" ] || fail "Nicht auf Branch $BRANCH."
git diff --quiet && git diff --cached --quiet \
  || fail "Es gibt nicht committete Aenderungen. Bitte zuerst committen."
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && fail "Tag $tag existiert bereits lokal."
git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1 \
  && fail "Tag $tag existiert bereits auf GitHub."

set_version() {
  local v=$1 tmp
  tmp=$(mktemp)
  # Nur die erste version-Zeile (Abschnitt [package]).
  awk -v v="$v" '!done && /^version = "/ { print "version = \"" v "\""; done=1; next } { print }' \
    "$CARGO_TOML" >"$tmp" && cat "$tmp" >"$CARGO_TOML"
  # Im Lockfile die version-Zeile direkt nach dem eigenen Paketnamen.
  awk -v v="$v" -v n="$CRATE" '
    hit && /^version = "/ { print "version = \"" v "\""; hit=0; next }
    { hit = ($0 == "name = \"" n "\""); print }' \
    "$CARGO_LOCK" >"$tmp" && cat "$tmp" >"$CARGO_LOCK"
  rm -f "$tmp"
  [ "$(grep -m1 '^version' "$CARGO_TOML" | cut -d'"' -f2)" = "$v" ] \
    || fail "Version in Cargo.toml konnte nicht gesetzt werden."
}

echo "Aktuelle Version:  $current"
echo "Release:           $version (Tag $tag)"
echo "Danach weiter mit: $next"
read -r -p "Fortfahren? [j/N] " answer
[[ "$answer" =~ ^[jJyY]$ ]] || { echo "Abgebrochen."; exit 0; }

set_version "$version"
git add "$CARGO_TOML" "$CARGO_LOCK"
git commit -q -m "Version $version"
git tag "$tag"

set_version "$next"
git add "$CARGO_TOML" "$CARGO_LOCK"
git commit -q -m "Naechste Entwicklungsversion $next"

echo
echo "Lokal erstellt: Commit Version $version, Tag $tag, Commit $next."
read -r -p "Jetzt $BRANCH und $tag zu GitHub pushen? [j/N] " answer
if [[ "$answer" =~ ^[jJyY]$ ]]; then
  git push origin "$BRANCH" "$tag"
  echo "Gepusht. GitHub Actions baut jetzt den Release-Entwurf."
  echo "Danach auf GitHub unter Releases pruefen und veroeffentlichen."
else
  echo "Nicht gepusht. Spaeter mit: git push origin $BRANCH $tag"
fi
