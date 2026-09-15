#!/bin/sh
# uebernommen aus lingotuner/tools/sync-kit.sh, 2026-09-15
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
set -e

KIT="${KIT_DIR:-../obsidian-kit}"
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit"):
# die meisten hier vendorten pure-Module liegen dort, nicht mehr unter obsidian-kit/src/pure/.
# Bis 2026-09-02 (lingotuner) kopierte dieses Skript weiter von der alten Stelle und starb am
# ersten Modul — mit einem Schaden, der groesser ist als der Abbruch: `set -e` beendet den
# Lauf, also laufen die gekoppelten Module nicht mehr mit und BEIDE VENDOR.json werden nicht
# geschrieben. Die eine Datei, in der man den Vendor-Stand nachschlaegt, behauptet danach den
# alten — leise.
#
# obsidian-kit traegt unter src/vendor/code-kit/ eigene Kopien einiger Module; die werden hier
# bewusst NICHT genommen. Eine Zwischenkopie als Quelle zu nehmen erzeugt eine Kopier-Kette,
# und die sieht bei der naechsten Zaehlung wie ein unabhaengiger Beleg aus.
# Layout hier: obsidian-plugins/slide-deck/../../libs/code-kit (nicht ../../code-kit wie bei
# lingotuner — dessen Default zeigt ins Leere, s. eigener Fund 2026-09-15).
CODE_KIT="${CODE_KIT_DIR:-../../libs/code-kit}"
[ -d "$KIT/src/pure" ] || { echo "Kit nicht gefunden unter $KIT (KIT_DIR setzen)" >&2; exit 1; }
[ -d "$CODE_KIT/src/ts" ] || { echo "code-kit nicht gefunden unter $CODE_KIT (CODE_KIT_DIR setzen)" >&2; exit 1; }
# CORE-META-22: gelesen wird aus einer FESTEN REF, nicht aus dem Arbeitsstand des
# Nachbar-Repos. Ein `cp` aus dessen Worktree koppelt dieses Repo an einen fremden HEAD.
# Default ist die package.json-Version der Quelle; ein Upgrade ist eine BEWUSSTE Handlung.
VER="${KIT_REF:-$(node -p "require('$KIT/package.json').version")}"
CODE_VER="${CODE_KIT_REF:-$(node -p "require('$CODE_KIT/package.json').version")}"
for paar in "$KIT|$VER" "$CODE_KIT|$CODE_VER"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$ref' existiert nicht in $repo." >&2
    echo "  Entweder ist die Version dort ungetaggt, oder KIT_REF/CODE_KIT_REF setzen." >&2
    exit 2
  }
done
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht — die
# naechste Umschichtung soll dieses Skript nicht wieder toeten, sondern nur einen anderen
# Fundort ergeben. Ausgabe: <repo>|<ref>|<quelle>|<quell-relativer-pfad>|<version>
quelle_fuer() { # quelle_fuer <quell-basisname (ohne .ts)>
  for kandidat in \
    "$KIT|$VER|obsidian-kit|src/pure/$1.ts|$VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/pure/$1.ts|$CODE_VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/web/$1.ts|$CODE_VER"; do
    repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    ref=$(printf '%s' "$kandidat" | cut -d'|' -f2)
    rel=$(printf '%s' "$kandidat" | cut -d'|' -f4)
    # In der REF nachsehen, nicht im Worktree — sonst faende die Suche eine Datei, die der
    # Lesevorgang danach nicht bekommt.
    if git -C "$repo" cat-file -e "$ref:$rel" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

# In eine .tmp lesen und erst bei Erfolg verschieben — eine Ausgabe-Umleitung legt die
# Zieldatei an, BEVOR der Lesebefehl laeuft, und hinterlaesst sonst einen Torso, der mit
# Stempelzeile wie ein gueltiges Vendoring aussieht.
hole() { # hole <repo> <ref> <quell-pfad> <ziel>
  git -C "$1" show "$2:$3" > "$4.tmp" || { rm -f "$4.tmp"; return 1; }
  mv "$4.tmp" "$4"
}

stamp() { # stamp <vendored-file> <quell-relativer-pfad> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Kit-interne Querimporte aufs Vendor-Layout umschreiben. Im Kit liegen pure Module unter
# ../vendor/code-kit/pure/ (seit dem code-kit-Umzug), hier flach unter src/vendor/kit/ —
# der Pfad zeigt hier also ins Leere. Das ist die EINZIGE zulaessige Abweichung von verbatim;
# bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen. Betroffen: endpoint-list.ts,
# model-picker.ts (beide importieren aus ../vendor/code-kit/pure/*).
relayer() { # relayer <vendored-file>
  f=$1
  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi
  mv "$f.tmp" "$f"

  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports (../pure/ and ../vendor/code-kit/{pure,web}/) → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# Eintraege als "lokalname" oder "lokalname=quellname", wenn der lokale Dateiname (historisch,
# vor diesem Skript entstanden) vom Kit-Quellnamen abweicht. Einzige bekannte Abweichung:
# think.ts (lokal) <- think-splitter.ts (Quelle) — s. AGENTS.md Gotchas, nicht mechanisch
# angeglichen, um die bestehenden Importe (`./vendor/kit/think`) nicht anzufassen.
PURE_MODULE="clipboard sse endpoint endpoint_config endpoint_diagnostics model-choice model-context model-list-cache reasoning think=think-splitter timeout error_body settings"
OBSIDIAN_MODULE="endpoint-list folder-suggest model-picker settings_walker stream-area"

# Die "vendored"-Liste der VENDOR.json wird aus derselben Liste erzeugt, aus der kopiert wird.
# Zwei Orte fuer dieselbe Wahrheit driften (CORE-META-16) — und zwar leise: die Datei, in der
# man den Vendor-Stand nachschlaegt, waere dann die einzige, die ihn falsch nennt.
liste() { for m in $1; do printf '%s.ts, ' "${m%%=*}"; done | sed 's/, $//'; }

# Erst ALLE Quellen aufloesen, dann kopieren: ein fehlendes Modul ist ein Aufbaufehler und
# wird als solcher gemeldet, statt den Lauf auf halber Strecke abzubrechen.
for m in $PURE_MODULE; do
  quellname=${m#*=}
  quelle_fuer "$quellname" >/dev/null || {
    echo "FEHLER: $quellname.ts liegt weder in $KIT/src/pure/ noch in $CODE_KIT/src/ts/{pure,web}/." >&2
    exit 2
  }
done

for m in $PURE_MODULE; do
  lokalname=${m%%=*}
  quellname=${m#*=}
  fund=$(quelle_fuer "$quellname")
  repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  ref=$(printf '%s' "$fund" | cut -d'|' -f2)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f3)
  rel=$(printf '%s' "$fund" | cut -d'|' -f4)
  ver=$(printf '%s' "$fund" | cut -d'|' -f5)
  hole "$repo" "$ref" "$rel" "src/vendor/kit/$lokalname.ts" || {
    echo "FEHLER: $ref:$rel nicht lesbar in $repo" >&2; exit 2; }
  stamp "src/vendor/kit/$lokalname.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel -> src/vendor/kit/$lokalname.ts"
done

for m in $OBSIDIAN_MODULE; do
  lokalname=${m%%=*}
  quellname=${m#*=}
  hole "$KIT" "$VER" "src/obsidian/$quellname.ts" "src/vendor/kit-obsidian/$lokalname.ts" || {
    echo "FEHLER: $VER:src/obsidian/$quellname.ts nicht lesbar" >&2; exit 2; }
  case "$lokalname" in endpoint-list|model-picker) relayer "src/vendor/kit-obsidian/$lokalname.ts" ;; esac
  stamp "src/vendor/kit-obsidian/$lokalname.ts" "src/obsidian/$quellname.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$quellname.ts -> src/vendor/kit-obsidian/$lokalname.ts"
done

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit + code-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "$(liste "$PURE_MODULE")",
  "note": "Verbatim snapshot aus ZWEI Quellen (obsidian-kit + code-kit); welche Datei woher stammt, sagt ihr eigener Kopf. think.ts stammt aus think-splitter.ts (lokal umbenannt, historisch — Herkunft im Kopf der Datei). Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(liste "$OBSIDIAN_MODULE")",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. endpoint-list.ts und model-picker.ts tragen EINE mechanische Abweichung: kit-interne Importe von ../pure/* sind auf ../kit/* umgeschrieben (Vendor-Layout). Bei jedem Re-Vendoring reproduzieren; sonst darf nichts abweichen."
}
JSON
echo "VENDOR.json -> $VER ($SHA)"
