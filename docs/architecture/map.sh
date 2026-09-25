#!/usr/bin/env bash
# Re-map CrankMagic with engram (minorrob/engram) and rebuild the architecture page's data (M11).
#
# Runs in a cloud session only (Rob, 2026-09-25), with engram cloned beside this repository and its
# ts-morph vendored once (engram's ./vendor_deps.sh):
#   ENGRAM=/abs/path/to/engram bash docs/architecture/map.sh
#
# Writes, all committed:
#   docs/architecture/.kg/         the CURRENT state, mapped from the code (engram map-codebase: survey,
#                                  structure, and this system's own kinds, proven by probes)
#   docs/architecture/.kg/final/   the FINAL state, forward-modeled from docs/architecture/model/intent.yaml
#                                  (engram forward-model, profile docs/architecture/model/profiles/cloudflare)
#   docs/architecture/architecture.json, embedded in docs/architecture/index.html
# Every stage stops the run on a failed gate (set -e).
set -euo pipefail
cd "$(dirname "$0")/../.."
export ENGRAM="${ENGRAM:-$(cd .. && pwd)/engram}"
S="$ENGRAM/skills/map-codebase/scripts"
K=docs/architecture/.kg
F=$K/final
M=docs/architecture/model
[ -f "$S/survey.py" ] || { echo "engram not found at $ENGRAM (set ENGRAM)"; exit 1; }

# ── The current state: engram map-codebase, stages 0 and 1, plus this system's kinds ──────────────
ROOTFILES=$(git ls-files | grep -E '^[^/]+\.(js|html)$' | grep -v '^import-quintorius')
python3 "$S/survey.py" --repo . --dest "$K" --name crankmagic --include $ROOTFILES \
  'cloud/*' 'game/engine/*' 'game/server/*' 'game/contracts/*' 'game/engine-adapter/*' \
  'game/tools/setup-catalog.mjs' 'game/tools/ai-compatibility.mjs' 'game/tools/windows-credential.mjs' 'game/ui/playmats.mjs' \
  'tools/release-pages.mjs' 'tools/refresh.mjs' 'tools/build-engine-cards.mjs' 'tools/data-manifest.mjs' 'tools/lib/*' 'schema/*.mjs' \
  '.github/workflows/*' \
  'docs/plan-to-100.md' 'docs/plan-data-sync.md' 'docs/plan-account-cloud.md' 'docs/plan-program-2026-09-24.md' \
  'docs/handoff-2026-09-25.md' 'docs/release-pages.md' 'docs/design/2026-09-25-redesign-r3/INTAKE.md' 'docs/engine/PLAN.md' 'AGENTS.md'
python3 tools/architecture-map.py describe-survey "$K/survey.yaml"
node "$S/extract_ts.mjs" --repo . --out "$K/uml-ts.json" --survey "$K/survey.yaml"
python3 "$S/extract_config.py" --repo . --out "$K/config.json" --survey "$K/survey.yaml"
python3 "$S/extract_md.py" --repo . --out "$K/docs.json" --survey "$K/survey.yaml"
rm -f "$K/config-architecture.json"
python3 "$S/kg_build.py" --repo . --kg "$K"                  # the code alone, so the probes can name mapped files
cp "$M/schema-ext.yaml" "$K/schema-ext.yaml"
python3 tools/architecture-map.py current "$K"             # D1, routes and every probed piece
python3 "$S/kg_build.py" --repo . --kg "$K"
python3 "$S/kg_validate.py" --kg "$K" --stage structure

# ── The final state: engram forward-model ──────────────────────────────────────────────────────────
mkdir -p "$F"
rm -f "$F"/*.yaml "$F"/*.json
python3 "$S/forward_generate.py" --intent "$M/intent.yaml" --kg "$F" --profiles-dir "$M/profiles"
cp "$M/schema-ext.yaml" "$F/schema-ext.yaml"
python3 tools/architecture-map.py final "$F"               # this system's kinds, traced to the requirements
python3 "$S/kg_build.py" --repo "$F" --kg "$F"
python3 "$S/kg_validate.py" --kg "$F" --stage full

# ── The page's data, from both graphs ─────────────────────────────────────────────────────────────
python3 tools/architecture-map.py page
