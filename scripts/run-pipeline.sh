#!/usr/bin/env bash
# run-pipeline.sh — Full SEO pipeline runner
#
# Usage:
#   ./scripts/run-pipeline.sh                        # all brands, all steps
#   ./scripts/run-pipeline.sh --brand habun-rak      # one brand, all steps
#   ./scripts/run-pipeline.sh --skip-generate        # track + sitemap + schema only
#   ./scripts/run-pipeline.sh --only-track           # tracking only
#   ./scripts/run-pipeline.sh --dry-run              # print what would run, do nothing
#
# Environment:
#   OLLAMA_HOST   override Ollama endpoint (default: http://localhost:11434)
#   OPEN_TUNNEL   set to "1" to auto-open SSH tunnel before generating

set -euo pipefail

# ── config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEO_BIN="$REPO_DIR/node_modules/.bin/ts-node $REPO_DIR/src/cli.ts"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/pipeline-$(date +%Y-%m-%d).log"

AZURE_VM="20.216.5.173"
AZURE_USER="seouser"
SSH_KEY="$HOME/.ssh/id_rsa_habun_seo"
TUNNEL_PID_FILE="/tmp/seo-tunnel.pid"

# ── flags ─────────────────────────────────────────────────────────────────────
BRAND=""
SKIP_GENERATE=0
SKIP_TRACK=0
SKIP_SITEMAP=0
SKIP_SCHEMA=0
ONLY_TRACK=0
DRY_RUN=0
CONTENT_TYPE="blog-post"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brand)       BRAND="$2"; shift 2 ;;
    --type)        CONTENT_TYPE="$2"; shift 2 ;;
    --skip-generate) SKIP_GENERATE=1; shift ;;
    --skip-track)  SKIP_TRACK=1; shift ;;
    --skip-sitemap) SKIP_SITEMAP=1; shift ;;
    --skip-schema) SKIP_SCHEMA=1; shift ;;
    --only-track)  ONLY_TRACK=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ $ONLY_TRACK -eq 1 ]]; then
  SKIP_GENERATE=1; SKIP_SITEMAP=1; SKIP_SCHEMA=1
fi

# ── helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
section() {
  echo ""
  echo "══════════════════════════════════════════════════"
  echo "  $*"
  echo "══════════════════════════════════════════════════"
}
run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  [dry-run] $*"
  else
    eval "$*" 2>&1 | tee -a "$LOG_FILE" || true
  fi
}

# ── tunnel management ─────────────────────────────────────────────────────────
open_tunnel() {
  if curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
    log "Ollama already reachable at localhost:11434"
    return 0
  fi

  if [[ ! -f "$SSH_KEY" ]]; then
    log "⚠  SSH key not found ($SSH_KEY) — skipping content generation"
    SKIP_GENERATE=1
    return 1
  fi

  log "Opening SSH tunnel → $AZURE_USER@$AZURE_VM:11434"
  ssh -i "$SSH_KEY" -fN -o StrictHostKeyChecking=no \
      -L 11434:localhost:11434 "$AZURE_USER@$AZURE_VM" &
  echo $! > "$TUNNEL_PID_FILE"
  sleep 3

  if curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
    log "✓ Tunnel open (PID $(cat "$TUNNEL_PID_FILE"))"
  else
    log "⚠  Tunnel opened but Ollama not responding — skipping content generation"
    SKIP_GENERATE=1
  fi
}

close_tunnel() {
  if [[ -f "$TUNNEL_PID_FILE" ]]; then
    kill "$(cat "$TUNNEL_PID_FILE")" 2>/dev/null || true
    rm -f "$TUNNEL_PID_FILE"
    log "SSH tunnel closed"
  fi
}

# ── brand resolution ──────────────────────────────────────────────────────────
get_brands() {
  if [[ -n "$BRAND" ]]; then
    echo "$BRAND"
  else
    # list all brand dirs that have a brand.json
    for d in "$REPO_DIR"/brands/*/; do
      if [[ -f "$d/brand.json" ]]; then
        basename "$d"
      fi
    done
  fi
}

has_gsc_creds() {
  local slug="$1"
  [[ -f "$REPO_DIR/brands/$slug/gsc-credentials.json" ]]
}

# ── per-brand pipeline ────────────────────────────────────────────────────────
run_brand() {
  local slug="$1"
  local brand_dir="$REPO_DIR/brands/$slug"

  if [[ ! -f "$brand_dir/brand.json" ]]; then
    log "⚠  Brand '$slug' not found — skipping"
    return
  fi

  local name
  name=$(node -e "const b=require('$brand_dir/brand.json'); process.stdout.write(b.name)")

  section "$name  ($slug)"

  # generate
  if [[ $SKIP_GENERATE -eq 0 ]]; then
    log "Generating $CONTENT_TYPE content..."
    run "cd '$REPO_DIR' && npx ts-node src/cli.ts generate --brand '$slug' --type '$CONTENT_TYPE' --all"
  else
    log "Skipping content generation"
  fi

  # track
  if [[ $SKIP_TRACK -eq 0 ]]; then
    if has_gsc_creds "$slug"; then
      log "Tracking rankings..."
      run "cd '$REPO_DIR' && npx ts-node src/cli.ts track --brand '$slug'"
    else
      log "⚠  No GSC credentials — skipping rank tracking"
    fi
  fi

  # sitemap
  if [[ $SKIP_SITEMAP -eq 0 ]]; then
    log "Generating sitemap..."
    run "cd '$REPO_DIR' && npx ts-node src/cli.ts sitemap --brand '$slug'"
  fi

  # schema
  if [[ $SKIP_SCHEMA -eq 0 ]]; then
    log "Generating schema markup..."
    run "cd '$REPO_DIR' && npx ts-node src/cli.ts schema --brand '$slug'"
  fi

  log "✓ $name complete"
}

# ── main ──────────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

section "SEO Pipeline  —  $(date '+%A %d %b %Y %H:%M')"
log "Log: $LOG_FILE"
[[ -n "$BRAND" ]] && log "Brand filter: $BRAND" || log "Running all brands"
[[ $DRY_RUN -eq 1 ]] && log "DRY RUN — no commands will execute"

# open tunnel if generate is enabled
if [[ $SKIP_GENERATE -eq 0 ]] && [[ "${OPEN_TUNNEL:-0}" == "1" ]]; then
  open_tunnel
elif [[ $SKIP_GENERATE -eq 0 ]]; then
  if ! curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
    log "⚠  Ollama not reachable. Set OPEN_TUNNEL=1 or open the tunnel manually:"
    log "   ssh -i $SSH_KEY -L 11434:localhost:11434 $AZURE_USER@$AZURE_VM -N &"
    log "   Skipping content generation for this run."
    SKIP_GENERATE=1
  fi
fi

trap close_tunnel EXIT

BRANDS=$(get_brands)
TOTAL=$(echo "$BRANDS" | wc -w | tr -d ' ')
COUNT=0

for slug in $BRANDS; do
  COUNT=$((COUNT + 1))
  log "[$COUNT/$TOTAL] $slug"
  run_brand "$slug"
done

section "Pipeline complete"
log "Brands processed: $TOTAL"
log "Log saved: $LOG_FILE"
