#!/usr/bin/env bash
# Fix Ghost PostgreSQL persistence on Azure Container Apps.
#
# Problem: Ghost 5's knex-migrator sets locked=1 in migrations_lock,
# then immediately calls getState() which sees locked=1 and crashes.
# This happens because Ghost 5 starts the HTTP server before migrations
# complete, and Container Apps restarts create a race with the migration lock.
#
# Solution: Run a one-shot Container Apps Job that pre-initialises Ghost's
# PostgreSQL schema using knex-migrator directly, then start Ghost normally.
#
# Usage: bash infra/fix-ghost-postgres.sh
# Requires: az login, PGPASSWORD env or .env loaded

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

while IFS='=' read -r key val; do
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  val="${val%%#*}"
  val="${val%"${val##*[![:space:]]}"}"
  export "$key"="$val" 2>/dev/null || true
done < <(grep -v '^#' "$ENV_FILE" | grep '=')

RG="rg-sahayi-prod"
ENV_NAME="sahayi-prod-env"
ACR="sahayiprodacr"
IMAGE="${ACR}.azurecr.io/ghost-migrate:5-alpine"

PG_HOST="sahayi-prod-pg.postgres.database.azure.com"
PG_USER="ghost_user"
PG_PASS="GhostSahayi2024X"
PG_DB="ghost_blog"
GHOST_URL="https://blog.sahayi.co.in"

echo ""
echo "── Ghost PostgreSQL Migration Job ─────────────────────────────────"
echo "  This script builds a one-shot migrator container and runs it as"
echo "  a Container Apps Job, then restarts Ghost with PostgreSQL."
echo ""

# ── 1. Build the migration-only image ────────────────────────────────────────
mkdir -p /tmp/ghost-migrate-build
cat > /tmp/ghost-migrate-build/Dockerfile << 'DOCKERFILE'
FROM ghost:5-alpine
USER root
RUN apk add --no-cache sqlite
RUN cd /var/lib/ghost/versions/$(ls /var/lib/ghost/versions/ | head -1) \
    && npm install pg --save --legacy-peer-deps --no-audit --no-fund
COPY migrate.js /usr/local/bin/migrate.js
USER node
ENTRYPOINT ["node", "/usr/local/bin/migrate.js"]
DOCKERFILE

cat > /tmp/ghost-migrate-build/migrate.js << 'JS'
// One-shot Ghost knex-migrator init for PostgreSQL.
// Sets up the full Ghost schema then exits 0.
// Ghost Container App can start afterwards without the migration race.
const path = require('path');
const ghostDir = '/var/lib/ghost/versions/' + require('fs').readdirSync('/var/lib/ghost/versions')[0];
const KnexMigrator = require(path.join(ghostDir, 'node_modules/knex-migrator'));

const config = {
  database: {
    client: 'pg',
    connection: {
      host: process.env.database__connection__host,
      port: parseInt(process.env.database__connection__port || '5432'),
      user: process.env.database__connection__user,
      password: process.env.database__connection__password,
      database: process.env.database__connection__database,
      ssl: { rejectUnauthorized: false },
    },
  },
};

(async () => {
  const migrator = new KnexMigrator({ knexMigratorFilePath: ghostDir, ...config });
  try {
    console.log('[migrate] Running knex-migrator init...');
    await migrator.init({ skipInitChecks: true });
    console.log('[migrate] Done.');
    process.exit(0);
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('[migrate] Schema already exists — unlocking and re-running migrate...');
      await migrator.reset({ force: true }).catch(() => {});
      await migrator.migrate({ force: true }).catch(() => {});
      process.exit(0);
    }
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  }
})();
JS

echo "  Building migration image..."
az acr build \
  --registry "$ACR" \
  --image ghost-migrate:5-alpine \
  --file /tmp/ghost-migrate-build/Dockerfile \
  /tmp/ghost-migrate-build \
  --output none

echo "  ✓ Migration image pushed"

# ── 2. Create + run the migration Job ────────────────────────────────────────
ACR_PASS=$(az acr credential show --name "$ACR" --query "passwords[0].value" -o tsv)

JOB_NAME="ghost-pg-migrate"

# Delete existing job if any
az containerapp job delete \
  --name "$JOB_NAME" --resource-group "$RG" --yes 2>/dev/null || true

az containerapp job create \
  --name "$JOB_NAME" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --trigger-type Manual \
  --replica-timeout 300 \
  --replica-retry-limit 0 \
  --replica-completion-count 1 \
  --parallelism 1 \
  --image "${ACR}.azurecr.io/ghost-migrate:5-alpine" \
  --registry-server "${ACR}.azurecr.io" \
  --registry-username "$ACR" \
  --registry-password "$ACR_PASS" \
  --cpu 0.25 --memory 0.5Gi \
  --env-vars \
    "database__connection__host=${PG_HOST}" \
    "database__connection__port=5432" \
    "database__connection__user=${PG_USER}" \
    "database__connection__password=${PG_PASS}" \
    "database__connection__database=${PG_DB}" \
  --output none

echo "  ✓ Migration job created"

echo "  Running migration job..."
az containerapp job start \
  --name "$JOB_NAME" --resource-group "$RG" \
  --output none

echo "  Waiting for migration to complete (up to 5 min)..."
for i in $(seq 1 60); do
  STATUS=$(az containerapp job execution list \
    --name "$JOB_NAME" --resource-group "$RG" \
    --query "[0].properties.status" -o tsv 2>/dev/null || echo "Unknown")
  echo "    Status: $STATUS"
  if [[ "$STATUS" == "Succeeded" ]]; then
    echo "  ✓ Migration completed"
    break
  elif [[ "$STATUS" == "Failed" ]]; then
    echo "  ✗ Migration failed — check logs in Azure Portal"
    exit 1
  fi
  sleep 5
done

# ── 3. Switch Ghost Container App to PostgreSQL ───────────────────────────────
echo "  Switching Ghost to PostgreSQL..."
cat > /tmp/ghost-pg-update.yaml << YAML
properties:
  template:
    containers:
      - name: sahayi-ghost-blog
        image: ${ACR}.azurecr.io/ghost-pg:5-alpine
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - name: url
            value: "${GHOST_URL}"
          - name: NODE_ENV
            value: production
          - name: database__client
            value: pg
          - name: database__connection__host
            value: "${PG_HOST}"
          - name: database__connection__port
            value: "5432"
          - name: database__connection__user
            value: "${PG_USER}"
          - name: database__connection__password
            value: "${PG_PASS}"
          - name: database__connection__database
            value: "${PG_DB}"
          - name: database__connection__ssl__rejectUnauthorized
            value: "false"
          - name: mail__transport
            value: Direct
          - name: privacy__useUpdateCheck
            value: "false"
    volumes: []
YAML

az containerapp update \
  --name sahayi-ghost-blog --resource-group "$RG" \
  --yaml /tmp/ghost-pg-update.yaml \
  --query "properties.latestRevisionName" -o tsv

echo ""
echo "  ── Done ──────────────────────────────────────────────────────────"
echo "  Ghost should now start with PostgreSQL persistence."
echo "  Monitor: az containerapp logs show --name sahayi-ghost-blog --resource-group $RG --tail 50"
echo ""
echo "  After Ghost is healthy, run Ghost setup:"
echo "    curl -X POST https://sahayi-ghost-blog.icyhill-15e4b439.centralindia.azurecontainerapps.io/ghost/api/admin/authentication/setup/ \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"setup\":[{\"name\":\"Sahayi Blog\",\"email\":\"tech@sahayi.co.in\",\"password\":\"SahayiBlog@2024!\",\"blogTitle\":\"Sahayi — Home Services Kerala\"}]}'"
echo ""
