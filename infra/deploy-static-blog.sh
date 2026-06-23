#!/usr/bin/env bash
# Deploy Azure Blob Storage static blog for Sahayi
# Usage: bash infra/deploy-static-blog.sh
# Cost: ~₹20–50/mo (storage + egress). No VM, no CMS, no database.

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

RG="${SAHAYI_AZURE_RG:-sahayi-rg}"
LOCATION="centralindia"
STORAGE_ACCOUNT="sahayiblog$(echo $RANDOM | cut -c1-4)"   # must be globally unique
CDN_PROFILE="sahayi-cdn"
CDN_ENDPOINT="sahayi-blog"
DOMAIN="${SAHAYI_BLOG_DOMAIN:-blog.sahayi.co.in}"

# Reuse existing storage account if already deployed
if grep -q "^AZURE_BLOG_STORAGE=" "$ENV_FILE" 2>/dev/null; then
  STORAGE_ACCOUNT=$(grep "^AZURE_BLOG_STORAGE=" "$ENV_FILE" | cut -d= -f2)
  echo "  Reusing storage account: $STORAGE_ACCOUNT"
fi

update_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf "\n%s=%s" "$key" "$val" >> "$ENV_FILE"
  fi
}

echo ""
echo "  ── Sahayi Static Blog — Azure Blob Storage ──────────────────"
echo "  Resource group : $RG (reusing OpenAI RG)"
echo "  Location       : $LOCATION"
echo "  Storage account: $STORAGE_ACCOUNT"
echo "  Domain target  : $DOMAIN"
echo ""

# ── 1. Create storage account ─────────────────────────────────────────────────
if ! az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" &>/dev/null; then
  echo "  Creating storage account..."
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --allow-blob-public-access true \
    --min-tls-version TLS1_2 \
    --output none
  echo "  ✓ Storage account created"
else
  echo "  ✓ Storage account already exists"
fi

# ── 2. Enable static website ──────────────────────────────────────────────────
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document "index.html" \
  --404-document "404.html" \
  --output none
echo "  ✓ Static website enabled"

# Get static site URL
STATIC_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT" --resource-group "$RG" \
  --query "primaryEndpoints.web" -o tsv | tr -d '\n')

# Get storage key
STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" --resource-group "$RG" \
  --query "[0].value" -o tsv)

# ── 3. Create CDN profile + endpoint ─────────────────────────────────────────
if ! az cdn profile show --name "$CDN_PROFILE" --resource-group "$RG" &>/dev/null; then
  echo "  Creating CDN profile (Standard Microsoft)..."
  az cdn profile create \
    --name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --location global \
    --sku Standard_Microsoft \
    --output none
  echo "  ✓ CDN profile created"
fi

ORIGIN=$(echo "$STATIC_URL" | sed 's|https://||' | sed 's|/||')

if ! az cdn endpoint show --name "$CDN_ENDPOINT" --profile-name "$CDN_PROFILE" --resource-group "$RG" &>/dev/null; then
  echo "  Creating CDN endpoint..."
  az cdn endpoint create \
    --name "$CDN_ENDPOINT" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --location global \
    --origin "$ORIGIN" \
    --origin-host-header "$ORIGIN" \
    --enable-compression true \
    --output none
  echo "  ✓ CDN endpoint created"
fi

CDN_URL="https://${CDN_ENDPOINT}.azureedge.net"

# ── 4. Upload placeholder index + 404 ────────────────────────────────────────
cat > /tmp/sahayi-blog-index.html << 'HTML'
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Sahayi Blog — Home Services Kerala</title>
<meta name="description" content="Tips, guides and stories about home services in Kerala.">
<meta http-equiv="refresh" content="0; url=/blog/">
</head><body><p><a href="/blog/">Sahayi Blog</a></p></body></html>
HTML

cat > /tmp/sahayi-404.html << 'HTML'
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Page Not Found — Sahayi Blog</title></head>
<body><h1>404 — Page not found</h1><p><a href="/blog/">Go to blog</a></p></body></html>
HTML

az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
  --container-name "\$web" --name "index.html" \
  --file /tmp/sahayi-blog-index.html --content-type "text/html" --overwrite \
  --output none

az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
  --container-name "\$web" --name "404.html" \
  --file /tmp/sahayi-404.html --content-type "text/html" --overwrite \
  --output none

echo "  ✓ Placeholder pages uploaded"

# ── 5. Write to .env ──────────────────────────────────────────────────────────
update_env "AZURE_BLOG_STORAGE"    "$STORAGE_ACCOUNT"
update_env "AZURE_BLOG_KEY"        "$STORAGE_KEY"
update_env "AZURE_BLOG_CDN"        "$CDN_URL"
update_env "AZURE_BLOG_STATIC_URL" "$STATIC_URL"
update_env "SAHAYI_BLOG_URL"       "$CDN_URL"
update_env "SAHAYI_BLOG_ADAPTER"   "azure-blob"
update_env "BLOG_ADAPTER"          "azure-blob"

echo ""
echo "  ── Done ──────────────────────────────────────────────────────"
echo "  Static site : $STATIC_URL"
echo "  CDN URL     : $CDN_URL"
echo ""
echo "  DNS — add this CNAME at your domain registrar:"
echo "    blog.sahayi.co.in  CNAME  ${CDN_ENDPOINT}.azureedge.net"
echo ""
echo "  Custom domain on CDN (after DNS propagates ~10 min):"
echo "    az cdn custom-domain create \\"
echo "      --endpoint-name $CDN_ENDPOINT --profile-name $CDN_PROFILE \\"
echo "      --resource-group $RG --name sahayi-blog-domain \\"
echo "      --hostname blog.sahayi.co.in"
echo ""
echo "  Test publish:"
echo "    cd \$HOME/sahayi-seo && npx ts-node src/cli.ts publish -b sahayi --dry-run"
echo ""
