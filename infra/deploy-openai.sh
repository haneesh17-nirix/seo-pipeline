#!/bin/bash
# Deploy Azure OpenAI and populate .env automatically
# Usage: bash infra/deploy-openai.sh <resource-group>
# Example: bash infra/deploy-openai.sh sahayi-rg

set -e

RG="${1:-sahayi-rg}"
LOCATION="eastus"
OPENAI_NAME="sahayi-seo-openai"
ENV_FILE="$(dirname "$0")/../.env"

echo ""
echo "  Deploying Azure OpenAI to resource group: $RG"
echo ""

# Create resource group if it doesn't exist
az group create --name "$RG" --location "$LOCATION" --output none
echo "  ✓ Resource group ready"

# Deploy Bicep
az deployment group create \
  --resource-group "$RG" \
  --template-file "$(dirname "$0")/azure-openai.bicep" \
  --parameters location="$LOCATION" openAiName="$OPENAI_NAME" \
  --output none
echo "  ✓ Azure OpenAI deployed"

# Fetch endpoint and key
ENDPOINT=$(az cognitiveservices account show \
  --name "$OPENAI_NAME" --resource-group "$RG" \
  --query "properties.endpoint" -o tsv)

KEY=$(az cognitiveservices account keys list \
  --name "$OPENAI_NAME" --resource-group "$RG" \
  --query "key1" -o tsv)

echo "  ✓ Credentials retrieved"

# Write to .env
if grep -q "^AZURE_OPENAI_ENDPOINT=" "$ENV_FILE"; then
  sed -i '' "s|^AZURE_OPENAI_ENDPOINT=.*|AZURE_OPENAI_ENDPOINT=${ENDPOINT}|" "$ENV_FILE"
  sed -i '' "s|^AZURE_OPENAI_KEY=.*|AZURE_OPENAI_KEY=${KEY}|" "$ENV_FILE"
else
  echo "AZURE_OPENAI_ENDPOINT=${ENDPOINT}" >> "$ENV_FILE"
  echo "AZURE_OPENAI_KEY=${KEY}" >> "$ENV_FILE"
fi

echo "  ✓ .env updated"
echo ""
echo "  Endpoint : $ENDPOINT"
echo "  Deployment: gpt-4o-mini"
echo ""
echo "  Run: pm2 restart sahayi-discord-bot && npx ts-node src/cli.ts generate-content -b sahayi"
