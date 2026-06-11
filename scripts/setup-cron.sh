#!/usr/bin/env bash
# setup-cron.sh — Install local cron jobs for the SEO pipeline
#
# Usage:
#   ./scripts/setup-cron.sh          # install default schedule
#   ./scripts/setup-cron.sh --remove # remove cron entries

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PIPELINE="$SCRIPT_DIR/run-pipeline.sh"

if [[ "${1:-}" == "--remove" ]]; then
  echo "Removing SEO pipeline cron entries..."
  crontab -l 2>/dev/null | grep -v "seo-pipeline" | crontab - || true
  echo "✓ Removed"
  exit 0
fi

# Check dependencies
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install it first."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Ensure npm is installed."
  exit 1
fi

chmod +x "$PIPELINE"

# Build cron entries
# Using full paths so cron's minimal PATH works
NODE_PATH=$(command -v node)
NPX_PATH=$(command -v npx)
LOG="$REPO_DIR/logs/cron.log"

CRON_ENTRIES=$(cat <<EOF

# ── SEO Pipeline (seo-pipeline) ───────────────────────────────────────────────
# Weekly full pipeline — every Monday at 07:00 local time
# Generates content, tracks rankings, updates sitemap + schema for all brands
0 7 * * 1 OPEN_TUNNEL=1 bash "$PIPELINE" >> "$LOG" 2>&1

# Weekly tracking only — every Thursday at 07:00 (mid-week rank check)
0 7 * * 4 bash "$PIPELINE" --only-track >> "$LOG" 2>&1

# Monthly full generate run — 1st of every month at 06:30
30 6 1 * * OPEN_TUNNEL=1 bash "$PIPELINE" --type blog-post >> "$LOG" 2>&1
# ─────────────────────────────────────────────────────────────────────────────
EOF
)

# Install
echo "Installing cron entries..."
(crontab -l 2>/dev/null; echo "$CRON_ENTRIES") | crontab -

echo ""
echo "✓ Cron jobs installed:"
echo ""
echo "  Mon 07:00  — Full pipeline (generate + track + sitemap + schema) — all brands"
echo "  Thu 07:00  — Rank tracking only — all brands"
echo "  1st 06:30  — Blog post generation — all brands"
echo ""
echo "  Log: $LOG"
echo ""
echo "  View:   crontab -l"
echo "  Remove: ./scripts/setup-cron.sh --remove"
echo ""
echo "  Note: OPEN_TUNNEL=1 auto-opens SSH tunnel to $REPO_DIR/azure VM."
echo "  Ensure ~/.ssh/id_rsa_habun_seo exists and is not passphrase-protected"
echo "  (or use ssh-agent). Without the tunnel, content generation is skipped"
echo "  but tracking still runs."
