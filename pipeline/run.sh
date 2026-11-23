#!/usr/bin/env bash
# Knock Knock Bruin pipeline.
#   bash pipeline/run.sh         full run: Moltbook ingest -> clean -> vocab/codex/pulse/debates -> checks -> round_pack.json -> stats
#   bash pipeline/run.sh stats   stats only (after each round): events.ndjson -> agent_stats.json
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export KK_ROOT="$ROOT"
export PYTHONIOENCODING=utf-8
BRUIN="${BRUIN_BIN:-$(command -v bruin || echo "$HOME/.local/bin/bruin")}"
mkdir -p data/raw
if [[ "${1:-}" == "stats" ]]; then
  "$BRUIN" run --workers 1 --config-file "$ROOT/.bruin.yml" --downstream pipeline/assets/stats/events.py
else
  "$BRUIN" run --workers 1 --config-file "$ROOT/.bruin.yml" pipeline
fi
