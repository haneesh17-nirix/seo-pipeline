#!/usr/bin/env bash
# One-shot Ghost blog deployment on Hetzner Cloud
# Usage: bash infra/deploy-ghost.sh
# Requires: HCLOUD_TOKEN in .env, hcloud CLI, ssh key at ~/.ssh/id_ed25519

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
STATE_FILE="$SCRIPT_DIR/.deploy-state.json"

# Load .env
set -a; source "$ENV_FILE"; set +a

# ── Config ────────────────────────────────────────────────────────────────────
SERVER_NAME="sahayi-blog"
SERVER_TYPE="cx22"          # 2 vCPU, 4 GB RAM — €4.51/mo
LOCATION="nbg1"             # Nuremberg (closest with low latency to IN)
IMAGE="ubuntu-22.04"
BLOG_DOMAIN="${SAHAYI_BLOG_DOMAIN:-blog.sahayi.co.in}"
BLOG_EMAIL="${SAHAYI_BLOG_EMAIL:-tech@sahayi.co.in}"
SSH_KEY_NAME="sahayi-deploy"
SSH_PRIV_KEY="${HOME}/.ssh/id_ed25519"

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  echo ""
  echo "  HCLOUD_TOKEN not set."
  echo "  1. Go to: https://console.hetzner.cloud → Project → Security → API Tokens"
  echo "  2. New API Token → Read & Write → copy it"
  echo "  3. Add to .env: HCLOUD_TOKEN=<token>"
  echo ""
  exit 1
fi

export HCLOUD_TOKEN

echo ""
echo "  ── Sahayi Ghost Blog Deployment ──────────────────────────────"
echo "  Domain  : $BLOG_DOMAIN"
echo "  Server  : $SERVER_TYPE @ Hetzner $LOCATION"
echo ""

# ── 1. Upload SSH key if not already there ────────────────────────────────────
PUB_KEY="$(cat "${SSH_PRIV_KEY}.pub")"
if ! hcloud ssh-key list -o columns=name | grep -q "$SSH_KEY_NAME"; then
  echo "  Uploading SSH key..."
  hcloud ssh-key create --name "$SSH_KEY_NAME" --public-key "$PUB_KEY"
  echo "  ✓ SSH key uploaded"
else
  echo "  ✓ SSH key already registered"
fi

# ── 2. Create server ──────────────────────────────────────────────────────────
if hcloud server list -o columns=name | grep -q "^$SERVER_NAME$"; then
  SERVER_IP=$(hcloud server describe "$SERVER_NAME" -o format='{{.PublicNet.IPv4.IP}}')
  echo "  ✓ Server already exists: $SERVER_IP"
else
  echo "  Creating server (this takes ~30s)..."
  hcloud server create \
    --name "$SERVER_NAME" \
    --type "$SERVER_TYPE" \
    --image "$IMAGE" \
    --location "$LOCATION" \
    --ssh-key "$SSH_KEY_NAME" \
    --output json > /tmp/server-create.json
  SERVER_IP=$(cat /tmp/server-create.json | python3 -c "import sys,json; print(json.load(sys.stdin)['server']['public_net']['ipv4']['ip'])")
  echo "  ✓ Server created: $SERVER_IP"
  echo "  Waiting 20s for boot..."
  sleep 20
fi

# Save server IP to state
echo "{\"server_ip\": \"$SERVER_IP\", \"domain\": \"$BLOG_DOMAIN\"}" > "$STATE_FILE"

# ── 3. Wait for SSH ───────────────────────────────────────────────────────────
echo "  Waiting for SSH..."
for i in $(seq 1 20); do
  if ssh -i "$SSH_PRIV_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
     root@"$SERVER_IP" "echo ok" &>/dev/null; then
    echo "  ✓ SSH ready"
    break
  fi
  sleep 3
done

SSH="ssh -i $SSH_PRIV_KEY -o StrictHostKeyChecking=no root@$SERVER_IP"

# ── 4. Install Ghost ──────────────────────────────────────────────────────────
echo "  Installing Ghost (takes 3–5 min)..."

$SSH bash << REMOTE
set -euo pipefail

# System deps
apt-get update -qq
apt-get install -y -qq nginx mysql-server

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y -qq nodejs

# Ghost CLI
npm install -g ghost-cli --silent

# Ghost user
id ghost-user &>/dev/null || useradd --system --create-home ghost-user
usermod -aG sudo ghost-user
echo "ghost-user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/ghost-user

# MySQL — create ghost db and user
mysql -e "CREATE DATABASE IF NOT EXISTS ghost_sahayi;"
mysql -e "CREATE USER IF NOT EXISTS 'ghost'@'localhost' IDENTIFIED BY 'sahayi_ghost_2024';"
mysql -e "GRANT ALL ON ghost_sahayi.* TO 'ghost'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Install Ghost
mkdir -p /var/www/ghost
chown ghost-user:ghost-user /var/www/ghost
chmod 775 /var/www/ghost

su - ghost-user -c "
  cd /var/www/ghost
  ghost install \
    --url http://$SERVER_IP \
    --db mysql \
    --dbhost localhost \
    --dbuser ghost \
    --dbpass sahayi_ghost_2024 \
    --dbname ghost_sahayi \
    --no-prompt \
    --no-setup-nginx \
    --no-setup-ssl \
    --no-setup-mysql \
    --no-start 2>&1 | tail -5
  ghost start 2>&1 | tail -3
"

echo "GHOST_INSTALLED=1"
REMOTE

echo "  ✓ Ghost installed and running"

# ── 5. Extract Ghost Admin API key ───────────────────────────────────────────
echo "  Fetching Admin API key..."

# Ghost stores keys in SQLite/MySQL — create an integration via the Admin API
# First, get the setup token from Ghost's config
SETUP_DONE=$($SSH "mysql -u ghost -psalhayi_ghost_2024 ghost_sahayi \
  -se \"SELECT value FROM settings WHERE key='setup_stage'\" 2>/dev/null || echo unknown")

# Complete Ghost setup programmatically via the init API
$SSH bash << 'SETUP'
curl -s -X POST http://localhost:2368/ghost/api/admin/authentication/setup/ \
  -H "Content-Type: application/json" \
  -d '{
    "setup": [{
      "name": "Sahayi Blog",
      "email": "'"$BLOG_EMAIL"'",
      "password": "Sahayi@Blog2024!",
      "blogTitle": "Sahayi — Home Services Kerala"
    }]
  }' > /tmp/ghost-setup.json 2>&1 || true
cat /tmp/ghost-setup.json
SETUP

# Get a session token for admin API
SESSION=$($SSH "curl -si -X POST http://localhost:2368/ghost/api/admin/session/ \
  -H 'Content-Type: application/json' \
  -d '{\"username\":\"$BLOG_EMAIL\",\"password\":\"Sahayi@Blog2024!\"}' 2>/dev/null \
  | grep 'set-cookie' | grep 'ghost-admin-api' | cut -d';' -f1 | cut -d' ' -f2" || echo "")

# Create integration and get Admin API key
INTEGRATION_JSON=$($SSH "curl -s -X POST http://localhost:2368/ghost/api/admin/integrations/ \
  -H 'Content-Type: application/json' \
  -H 'Cookie: $SESSION' \
  -d '{\"integrations\":[{\"name\":\"SEO Pipeline\"}]}' 2>/dev/null" || echo "{}")

ADMIN_KEY=$(echo "$INTEGRATION_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
integrations = d.get('integrations', [{}])
key = integrations[0].get('api_keys', [{}])[0] if integrations else {}
admin_keys = [k for k in integrations[0].get('api_keys', []) if k.get('type') == 'admin'] if integrations else []
if admin_keys:
    print(admin_keys[0].get('secret', ''))
" 2>/dev/null || echo "")

if [[ -n "$ADMIN_KEY" ]]; then
  # Get integration ID for the full key format id:secret
  INT_ID=$(echo "$INTEGRATION_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
integrations = d.get('integrations', [{}])
admin_keys = [k for k in integrations[0].get('api_keys', []) if k.get('type') == 'admin'] if integrations else []
if admin_keys:
    print(admin_keys[0].get('id', ''))
  " 2>/dev/null || echo "")
  GHOST_ADMIN_KEY="${INT_ID}:${ADMIN_KEY}"
  echo "  ✓ Admin API key retrieved"
else
  echo "  ⚠ Could not auto-extract API key — get it manually from Ghost admin panel"
  GHOST_ADMIN_KEY=""
fi

# ── 6. Write to .env ──────────────────────────────────────────────────────────
update_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

update_env "SAHAYI_BLOG_URL" "http://${SERVER_IP}"
update_env "SAHAYI_BLOG_ADAPTER" "ghost"
update_env "BLOG_ADAPTER" "ghost"
[[ -n "$GHOST_ADMIN_KEY" ]] && update_env "SAHAYI_BLOG_TOKEN" "$GHOST_ADMIN_KEY"
update_env "HETZNER_SERVER_IP" "$SERVER_IP"

echo ""
echo "  ── Done ──────────────────────────────────────────────────────"
echo "  Ghost URL    : http://$SERVER_IP"
echo "  Admin panel  : http://$SERVER_IP/ghost"
echo "  Admin email  : $BLOG_EMAIL"
echo "  Admin pass   : Sahayi@Blog2024!"
if [[ -n "$GHOST_ADMIN_KEY" ]]; then
echo "  API key      : $GHOST_ADMIN_KEY  (written to .env)"
fi
echo ""
echo "  DNS: Add this A record at your registrar:"
echo "    blog.sahayi.co.in  →  A  →  $SERVER_IP"
echo ""
echo "  Then run to enable HTTPS:"
echo "    ssh -i ~/.ssh/id_ed25519 root@$SERVER_IP"
echo "    ghost config --url https://blog.sahayi.co.in"
echo "    ghost setup nginx ssl"
echo "    ghost restart"
echo ""
echo "  Scheduled posts will publish automatically to Ghost."
echo "  Run: cd \$HOME/sahayi-seo && npx ts-node src/cli.ts publish --status"
echo ""
