// Azure OpenAI resource for seo-pipeline
// Deploy: az deployment group create -g <rg> -f infra/azure-openai.bicep
// After deploy, get endpoint + key:
//   az cognitiveservices account show -n <name> -g <rg> --query properties.endpoint -o tsv
//   az cognitiveservices account keys list -n <name> -g <rg> --query key1 -o tsv

@description('Azure region — use eastus or swedencentral for best model availability')
param location string = 'eastus'

@description('Name for the Azure OpenAI resource')
param openAiName string = 'sahayi-seo-openai'

@description('Name for the gpt-4o-mini deployment')
param deploymentName string = 'gpt-4o-mini'

@description('Tokens per minute capacity (1 = 1000 TPM)')
param capacityTpm int = 100

resource openAi 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  parent: openAi
  name: deploymentName
  sku: {
    name: 'Standard'
    capacity: capacityTpm
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o-mini'
      version: '2024-07-18'
    }
    raiPolicyName: 'Microsoft.Default'
  }
}

output endpoint string = openAi.properties.endpoint
output deploymentName string = deployment.name
output resourceId string = openAi.id
