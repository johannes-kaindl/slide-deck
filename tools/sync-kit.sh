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
# Feste Default-Pins (Absicht, wie epub-exporter): ein Lauf ohne Variablen reproduziert den Stand,
# statt still auf den Kit-Arbeitsstand zu heben. Heben = KIT_REF/CODE_KIT_REF setzen, danach npm run gate.
VER="${KIT_REF:-0.41.1}"
# Zweiter Pin, ebenfalls Absicht: help-setting.ts (Hilfe-Zeile, UI-STANDARD §8) kam mit Kit 0.43.0 und
# haengt an keinem anderen Modul — die uebrigen Module behalten ihren Pin (Vorlage: epub-exporter 877eb2c).
KIT_HELP_REF="${KIT_HELP_REF:-0.43.0}"
CODE_VER="${CODE_KIT_REF:-0.7.0}"
for paar in "$KIT|$VER" "$KIT|$KIT_HELP_REF" "$CODE_KIT|$CODE_VER"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$ref' existiert nicht in $repo." >&2
    echo "  Entweder ist die Version dort ungetaggt, oder KIT_REF/CODE_KIT_REF setzen." >&2
    exit 2
  }
done
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}")
HELP_SHA=$(git -C "$KIT" rev-parse --short "$KIT_HELP_REF^{commit}")

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

# uebernommen aus lingotuner/tools/sync-kit.sh, 2026-09-25
# Zweite Fallgruppe: ein PURE_MODULE, das selbst aus obsidian-kit/src/pure/ stammt, aber einen
# Querimport auf code-kit traegt (dessen eigene Vendor-Kopie unter obsidian-kit/src/vendor/code-kit/
# liegt). Hier landen BEIDE Seiten flach nebeneinander in src/vendor/kit/ — der Zielpfad ist also
# NICHT ../kit/ (das waere fuer kit-obsidian/, das eine Ebene hoeher liegt), sondern ./ (Geschwisterdatei
# in derselben Ablage). Anlass: endpoint-source.ts importiert endpoint_config aus
# ../vendor/code-kit/pure/ (obsidian-kit-Perspektive) — Praezedenz: llm-endpoint-manager/tools/sync-kit.sh.
relayer_pure() { # relayer_pure <vendored-file>
  f=$1
  case "$f" in
    src/vendor/kit/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit/ — relayer_pure gilt nur fuer die pure-Schicht" >&2; exit 1 ;;
  esac

  sed -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1./|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1./|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  if grep -qE '\.\./vendor/code-kit/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  for dep in $(sed -n 's|.*from ["'"'"']\./\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ./$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal import (../vendor/code-kit/{pure,web}/) → ./ (flat vendor layout, sibling module in src/vendor/kit/); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# Eintraege als "lokalname" oder "lokalname=quellname", wenn der lokale Dateiname (historisch,
# vor diesem Skript entstanden) vom Kit-Quellnamen abweicht. Einzige bekannte Abweichung:
# think.ts (lokal) <- think-splitter.ts (Quelle) — s. AGENTS.md Gotchas, nicht mechanisch
# angeglichen, um die bestehenden Importe (`./vendor/kit/think`) nicht anzufassen.
PURE_MODULE="clipboard sse endpoint endpoint_config endpoint_diagnostics model-choice model-context model-list-cache reasoning think=think-splitter timeout error_body settings sampling-profiles endpoint-source"
OBSIDIAN_MODULE="endpoint-list folder-suggest hub model-picker settings_walker stream-area endpoint-source"

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
  # endpoint-source.ts (obsidian-kit/src/pure/) traegt einen Querimport auf code-kit — auf die
  # flache Ablage umschreiben (Praezedenz: lingotuner/tools/sync-kit.sh).
  case "$lokalname" in endpoint-source) relayer_pure "src/vendor/kit/$lokalname.ts" ;; esac
  stamp "src/vendor/kit/$lokalname.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel -> src/vendor/kit/$lokalname.ts"
done

for m in $OBSIDIAN_MODULE; do
  lokalname=${m%%=*}
  quellname=${m#*=}
  hole "$KIT" "$VER" "src/obsidian/$quellname.ts" "src/vendor/kit-obsidian/$lokalname.ts" || {
    echo "FEHLER: $VER:src/obsidian/$quellname.ts nicht lesbar" >&2; exit 2; }
  case "$lokalname" in endpoint-list|model-picker|endpoint-source) relayer "src/vendor/kit-obsidian/$lokalname.ts" ;; esac
  stamp "src/vendor/kit-obsidian/$lokalname.ts" "src/obsidian/$quellname.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$quellname.ts -> src/vendor/kit-obsidian/$lokalname.ts"
done

# help-setting.ts: eigener Pin (KIT_HELP_REF), Existenz in genau dieser Ref, nicht im Arbeitsstand.
git -C "$KIT" cat-file -e "$KIT_HELP_REF:src/obsidian/help-setting.ts" 2>/dev/null || {
  echo "FEHLER: help-setting.ts fehlt in $KIT@$KIT_HELP_REF (kam mit Kit 0.43.0)." >&2; exit 2; }
hole "$KIT" "$KIT_HELP_REF" "src/obsidian/help-setting.ts" "src/vendor/kit-obsidian/help-setting.ts" || {
  echo "FEHLER: $KIT_HELP_REF:src/obsidian/help-setting.ts nicht lesbar" >&2; exit 2; }
stamp "src/vendor/kit-obsidian/help-setting.ts" "src/obsidian/help-setting.ts" obsidian-kit "$KIT_HELP_REF"
echo "vendored obsidian-kit@$KIT_HELP_REF/obsidian/help-setting.ts"

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
  "vendored": "$(liste "$OBSIDIAN_MODULE"), help-setting.ts (Kit $KIT_HELP_REF, $HELP_SHA)",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. endpoint-list.ts und model-picker.ts tragen EINE mechanische Abweichung: kit-interne Importe von ../pure/* sind auf ../kit/* umgeschrieben (Vendor-Layout). Bei jedem Re-Vendoring reproduzieren; sonst darf nichts abweichen."
}
JSON
echo "VENDOR.json -> $VER ($SHA)"
