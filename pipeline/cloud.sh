#!/usr/bin/env bash
# Put the same `knockknock` pipeline on Bruin Cloud (team psychefactory). Token comes from BRUIN_TOKEN in .env (never printed).
#   bash pipeline/cloud.sh status                         check auth + list projects/pipelines/runs
#   bash pipeline/cloud.sh connect <git-repo-url>         connect the public repo as a Cloud project (Cloud parses pipeline/)
#   bash pipeline/cloud.sh motherduck <motherduck-token>  register duckdb-default on Cloud (Cloud's DuckDB = MotherDuck)
#   bash pipeline/cloud.sh run                            trigger a Cloud run of the pipeline
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
export BRUIN_CLOUD_API_KEY="$(grep '^BRUIN_TOKEN=' .env | cut -d= -f2-)"
B="${BRUIN_BIN:-$(command -v bruin || echo "$HOME/.local/bin/bruin")}"
case "${1:-status}" in
  status)
    "$B" cloud auth status; "$B" cloud projects list; "$B" cloud pipelines list; "$B" cloud runs list 2>/dev/null | head -20 || true ;;
  connect)
    "$B" cloud projects create --name knockknock --repo-url "$2" ;;
  motherduck)
    "$B" cloud connections add --name duckdb-default --type duckdb --credentials "{\"host\":\"md:knockknock\",\"token\":\"$2\"}" ;;
  run)
    PID="$("$B" cloud projects list -o json | python -c 'import json,sys;d=json.load(sys.stdin);d=d if isinstance(d,list) else d.get("projects",d.get("data",[]));print([p for p in d if p.get("name")=="knockknock"][0]["id"])')"
    "$B" cloud runs trigger -p "$PID" --pipeline knockknock --note "knock knock round pack" ;;
esac
