# Infrastructure Package Architecture

## Overview

The `packages/infra/` package provides Infrastructure as Code (IaC) for deploying the perpetual IPFS/OrbitDB node infrastructure on Azure using Pulumi. This package creates and manages all cloud resources required to run the decentralized storage backend services.

## Technology Stack

### Core Technologies

-   **Pulumi**: Infrastructure as Code framework with TypeScript support
-   **Azure**: Cloud platform for hosting the perpetual node infrastructure
-   **TypeScript**: Native language integration with the existing monorepo
-   **Azure Native Provider**: Optimal Azure resource management through Pulumi

### Integration Benefits

-   **Monorepo Integration**: Shared TypeScript types between infrastructure and application code
-   **CI/CD Alignment**: GitHub Actions integration matching existing workflows
-   **Type Safety**: Full IntelliSense and compile-time checking for infrastructure code
-   **Preview Deployments**: Safe infrastructure changes with `pulumi preview`

## Azure Infrastructure Stack

### MVP Approach - Minimal Cost Stack

**Philosophy**: Start with essential infrastructure only. Additional services (ACR, Application Insights) can be added later when needed, but are not planned for the near term.

### Core Components & Costs

| Component              | Cost (Monthly) | Configuration                       | Notes                                      |
| ---------------------- | -------------- | ----------------------------------- | ------------------------------------------ |
| **Worker Node**        | $13.00         | B1ms (2 vCPU/2GB RAM)               | 1GB RAM often problematic for IPFS+OrbitDB |
| **Load Balancer**      | $12.00         | Standard SKU                        | Production-ready with health checks        |
| **Block Storage**      | $0.60          | 1GB Managed Disk (Premium SSD)      | Scalable storage for IPFS data             |
| **Control Plane**      | Free           | AKS Standard (non-SLA)              | Kubernetes control plane                   |
| **Container Registry** | **Free**       | GitHub Container Registry           | Use ghcr.io instead of ACR                 |
| **Monitoring**         | **Free**       | Kubernetes native + Azure Free tier | Basic logs via kubectl, free Log Analytics |
| **Total Cost**         | **$25.60**     |                                     | **Original target achieved!**              |

### Azure Resources

#### 1. **Azure Kubernetes Service (AKS)**

```typescript
// AKS cluster with single B1ms node
const cluster = new azure.containerservice.ManagedCluster('perpetual-cluster', {
    resourceGroupName: resourceGroup.name,
    agentPoolProfiles: [
        {
            name: 'system',
            count: 1,
            vmSize: 'Standard_B1ms', // 2 vCPU, 2GB RAM
            mode: 'System',
        },
    ],
    kubernetesVersion: '1.28',
});
```

#### 2. **Standard Load Balancer**

```typescript
// Production-grade load balancer with health checks
const loadBalancer = new azure.network.LoadBalancer('perpetual-lb', {
    resourceGroupName: resourceGroup.name,
    sku: { name: 'Standard' }, // Required for production
    frontendIpConfigurations: [frontendConfig],
});
```

#### 3. **Managed Storage**

```typescript
// Premium SSD for optimal IPFS performance
const disk = new azure.compute.Disk('perpetual-storage', {
    resourceGroupName: resourceGroup.name,
    diskSizeGb: 1,
    sku: { name: 'Premium_LRS' }, // Premium SSD
});
```

#### 4. **Networking Infrastructure**

```typescript
// Virtual network with security groups
const vnet = new azure.network.VirtualNetwork('perpetual-vnet', {
    resourceGroupName: resourceGroup.name,
    addressSpace: { addressPrefixes: ['10.0.0.0/16'] },
});

const nsg = new azure.network.NetworkSecurityGroup('perpetual-nsg', {
    resourceGroupName: resourceGroup.name,
    securityRules: [
        // IPFS API (4001), HTTP (80), HTTPS (443)
        // OrbitDB pubsub and discovery protocols
    ],
});
```

## Package Structure

```
packages/infra/
├── src/
│   ├── cluster/
│   │   ├── aks.ts              # AKS cluster configuration
│   │   ├── nodepool.ts         # Worker node pool setup
│   │   └── rbac.ts             # Role-based access control
│   ├── networking/
│   │   ├── vnet.ts             # Virtual network setup
│   │   ├── nsg.ts              # Network security groups
│   │   ├── loadbalancer.ts     # Standard load balancer
│   │   └── dns.ts              # DNS configuration
│   ├── storage/
│   │   ├── disks.ts            # Managed disk configuration
│   │   ├── storageaccount.ts   # Storage account for logs/backups
│   │   └── pvc.ts              # Persistent volume claims
│   ├── security/
│   │   ├── keyvault.ts         # Azure Key Vault for secrets
│   │   ├── identity.ts         # Managed service identities
│   │   └── policies.ts         # Security policies and compliance
│   ├── monitoring/
│   │   ├── loganalytics.ts     # Free-tier Log Analytics workspace
│   │   └── basic-alerts.ts     # Basic resource monitoring
│   └── container/
│       └── github-registry.ts  # GitHub Container Registry integration
├── pulumi/
│   ├── Pulumi.yaml             # Pulumi project definition
│   ├── Pulumi.dev.yaml         # Development stack configuration
│   ├── Pulumi.prod.yaml        # Production stack configuration
│   ├── index.ts                # Main infrastructure entry point
│   └── config/
│       ├── dev.json            # Development environment config
│       └── prod.json           # Production environment config
├── scripts/
│   ├── deploy.sh               # Deployment automation script
│   ├── destroy.sh              # Infrastructure cleanup script
│   ├── preview.sh              # Preview changes before deployment
│   └── setup.sh                # Initial setup and authentication
├── docs/
│   ├── deployment.md           # Deployment procedures
│   ├── monitoring.md           # Monitoring and alerting setup
│   └── troubleshooting.md      # Common issues and solutions
├── package.json                # NPM package configuration
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Package overview and quick start
```

## Configuration Management

### Environment-Specific Stacks

#### Development Stack (`Pulumi.dev.yaml`)

```yaml
config:
    azure-native:location: 'East US'
    azure-native:environment: 'dev'
    infra:nodeCount: 1
    infra:vmSize: 'Standard_B1ms'
    infra:storageSize: 1 # GB
    infra:containerRegistry: 'github' # Use GitHub Container Registry
    infra:monitoring: 'basic' # Kubernetes native logging
```

#### Production Stack (`Pulumi.prod.yaml`)

```yaml
config:
    azure-native:location: 'East US'
    azure-native:environment: 'prod'
    infra:nodeCount: 1
    infra:vmSize: 'Standard_B1ms'
    infra:storageSize: 5 # GB (larger for production)
    infra:containerRegistry: 'github' # Use GitHub Container Registry
    infra:monitoring: 'basic' # Free-tier Log Analytics
    infra:enableBackups: true
```

### Secrets Management with Azure Key Vault

**Important**: Azure Key Vault pricing is based on operations. Free tier includes 10,000 operations/month. **Keep usage under 100K requests/month** to minimize costs.

```typescript
// Azure Key Vault with optimized configuration
const keyVault = new azure.keyvault.Vault('perpetual-keyvault', {
    resourceGroupName: resourceGroup.name,
    tenantId: current.tenantId,
    sku: {
        name: 'standard', // Use standard tier (cheaper than premium)
        family: 'A',
    },
    accessPolicies: [
        {
            tenantId: current.tenantId,
            objectId: managedIdentity.principalId,
            secretPermissions: ['get'], // Minimal permissions - only read secrets
            keyPermissions: ['get'], // For cryptographic keys if needed
        },
    ],
    enabledForDeployment: false, // Disable unused features
    enabledForDiskEncryption: false,
    enabledForTemplateDeployment: false,
    networkAcls: {
        bypass: 'AzureServices',
        defaultAction: 'Allow', // Restrict in production
    },
});

// Store only essential secrets
const essentialSecrets = [
    new azure.keyvault.Secret('github-token', {
        vaultUri: keyVault.vaultUri,
        value: process.env.GITHUB_TOKEN!,
        contentType: 'text/plain',
    }),
    new azure.keyvault.Secret('ipfs-private-key', {
        vaultUri: keyVault.vaultUri,
        value: process.env.IPFS_PRIVATE_KEY!,
        contentType: 'text/plain',
    }),
];
```

**Cost Optimization Strategies for Key Vault:**

1. **Read Secrets Only on Pod Startup**

    ```typescript
    // In your Kubernetes deployment - use init containers
    initContainers:
    - name: secret-fetcher
      image: azure/azure-cli:latest
      command: ['/bin/sh', '-c']
      args:
      - |
        # Fetch secrets once and write to shared volume
        az keyvault secret show --name github-token --vault-name perpetual-keyvault --query value -o tsv > /shared/github-token
        az keyvault secret show --name ipfs-private-key --vault-name perpetual-keyvault --query value -o tsv > /shared/ipfs-key
      volumeMounts:
      - name: secrets-volume
        mountPath: /shared
    ```

2. **Cache Secrets in Memory**

    - Load secrets once during application startup
    - Store in memory/environment variables for application lifetime
    - Only re-fetch on pod restart or explicit refresh

3. **Minimize Secret Operations**

    - Avoid polling Key Vault for secret updates
    - Use Kubernetes secrets as cache layer after initial fetch
    - Bundle related secrets into single operations where possible

4. **Alternative for Development**
    ```typescript
    // Use Kubernetes secrets for development to avoid Key Vault costs
    const devSecrets = new kubernetes.core.v1.Secret('dev-secrets', {
        metadata: { name: 'perpetual-secrets' },
        stringData: {
            'github-token': process.env.GITHUB_TOKEN!,
            'ipfs-private-key': process.env.IPFS_PRIVATE_KEY!,
        },
    });
    ```

**Expected Key Vault Usage:**

-   **Pod startup**: ~5 secret reads per pod restart
-   **Monthly estimate**: <500 operations (well under 10K free tier limit)
-   **Cost**: $0/month under free tier, minimal above

### Container Deployment Strategy

#### GitHub Container Registry Integration

**Why GitHub Container Registry (ghcr.io)?**

-   **Free**: No additional cost for private repositories
-   **Integrated**: Works seamlessly with existing GitHub Actions workflows
-   **Secure**: Built-in authentication with GitHub tokens
-   **Reliable**: Enterprise-grade infrastructure

```typescript
// Kubernetes secret for GitHub Container Registry authentication
const githubRegistrySecret = new kubernetes.core.v1.Secret('github-registry', {
    metadata: {
        name: 'github-registry-secret',
        namespace: 'default',
    },
    type: 'kubernetes.io/dockerconfigjson',
    data: {
        '.dockerconfigjson': Buffer.from(
            JSON.stringify({
                auths: {
                    'ghcr.io': {
                        username: process.env.GITHUB_USERNAME,
                        password: process.env.GITHUB_TOKEN,
                        auth: Buffer.from(
                            `${process.env.GITHUB_USERNAME}:${process.env.GITHUB_TOKEN}`
                        ).toString('base64'),
                    },
                },
            })
        ).toString('base64'),
    },
});
```

#### Container Image Management

```yaml
# Example Kubernetes deployment using GitHub Container Registry
apiVersion: apps/v1
kind: Deployment
metadata:
    name: perpetual-node
spec:
    template:
        spec:
            containers:
                - name: orbitdb-service
                  image: ghcr.io/your-username/my-mimisbrunnr/perpetual-node:latest
            imagePullSecrets:
                - name: github-registry-secret
```

**Benefits of this approach:**

-   **No ACR costs**: Saves $5-10/month
-   **Simple CI/CD**: Direct integration with GitHub Actions
-   **Version control**: Git tags automatically become image tags
-   **Security**: Private repository access with GitHub tokens

#### Alternative Registries (Future Options)

| Registry                      | Cost               | Pros                                        | Cons                                         |
| ----------------------------- | ------------------ | ------------------------------------------- | -------------------------------------------- |
| **GitHub Container Registry** | Free               | Integrated with GitHub, no extra cost       | Limited to GitHub ecosystem                  |
| **Docker Hub**                | $5/month (private) | Industry standard, widely supported         | Additional cost, separate authentication     |
| **Azure Container Registry**  | $5-10/month        | Native Azure integration, advanced features | Additional cost, overkill for single service |

## Deployment Architecture

### CI/CD Integration

#### GitHub Actions Workflow with Environment Protection

**Setup GitHub Environment:**

1. Go to repository Settings → Environments
2. Create environment named `production`
3. Add required reviewers for approval
4. Configure branch protection rules for `main` branch

```yaml
name: Infrastructure Deployment

on:
    push:
        branches: [main]
        paths: ['packages/infra/**']
    pull_request:
        paths: ['packages/infra/**']

jobs:
    preview:
        runs-on: ubuntu-latest
        if: github.event_name == 'pull_request'
        steps:
            - uses: actions/checkout@v4
            - name: Setup Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: '18'
            - name: Preview infrastructure changes
              run: |
                  cd packages/infra
                  npm install
                  pulumi preview --stack dev
              env:
                  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
                  ARM_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
                  ARM_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
                  ARM_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
                  ARM_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

    deploy-production:
        runs-on: ubuntu-latest
        if: github.ref == 'refs/heads/main'
        environment:
            name: production
            url: https://portal.azure.com/#@/resource/subscriptions/${{ secrets.AZURE_SUBSCRIPTION_ID }}/resourceGroups/perpetual-rg/overview
        steps:
            - uses: actions/checkout@v4
            - name: Setup Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: '18'
            - name: Deploy to production
              run: |
                  cd packages/infra
                  npm install
                  pulumi up --yes --stack prod
              env:
                  PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
                  ARM_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
                  ARM_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
                  ARM_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
                  ARM_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
            - name: Post deployment status
              if: always()
              run: |
                  echo "Deployment completed. Check Azure Portal for resource status."
```

**GitHub Environment Configuration:**

1. **Required Reviewers**: Add team members who must approve production deployments
2. **Wait Timer**: Optional delay before deployment (e.g., 5 minutes for review)
3. **Branch Protection**: Ensure only `main` branch can deploy to production
4. **Environment Secrets**: Store production-specific secrets separately from dev

### Deployment Process

1. **Preview Changes**: `pulumi preview` shows infrastructure diff
2. **Safety Checks**: Policy validation and cost estimation
3. **Staged Deployment**: Deploy to dev first, then production
4. **Rollback Capability**: Built-in rollback on deployment failures
5. **State Management**: Pulumi Service manages infrastructure state

## Integration Points

### With Helm Package (`packages/helm/`)

```typescript
// Export cluster configuration for Helm deployment
export const kubeconfig = cluster.kubeConfigRaw;
export const clusterName = cluster.name;
export const resourceGroupName = resourceGroup.name;
```

### With Perpetual Node (`packages/perpetual-node/`)

```typescript
// GitHub Container Registry integration
export const githubRegistrySecret = githubRegistrySecret.metadata.name;
export const containerImageRepository = 'ghcr.io/your-username/my-mimisbrunnr';
```

### With Shared Libraries

-   **`packages/shared/api`**: Infrastructure resource types
-   **`packages/shared/crypto`**: Key Vault integration for cryptographic keys
-   **`packages/shared/testing`**: Infrastructure testing utilities

## Security Considerations

### Network Security

```typescript
// Comprehensive network security group rules for IPFS/OrbitDB node
const securityRules = [
    // IPFS Swarm Communication
    {
        name: 'AllowIPFSSwarm',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '4001',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 100,
        direction: 'Inbound',
    },
    // IPFS Gateway (for API access)
    {
        name: 'AllowIPFSGateway',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '8080',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 110,
        direction: 'Inbound',
    },
    // IPFS API (for client interactions)
    {
        name: 'AllowIPFSAPI',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '5001',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 120,
        direction: 'Inbound',
    },
    // HTTPS for secure access
    {
        name: 'AllowHTTPS',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '443',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 130,
        direction: 'Inbound',
    },
    // HTTP (only if needed for health checks)
    {
        name: 'AllowHTTP',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '80',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 140,
        direction: 'Inbound',
    },
    // SSH for administrative access (restrict to specific IPs in production)
    {
        name: 'AllowSSH',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '22',
        sourceAddressPrefix: '*', // TODO: Restrict to admin IP ranges
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 150,
        direction: 'Inbound',
    },
    // Kubernetes API server communication
    {
        name: 'AllowKubeAPI',
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '6443',
        sourceAddressPrefix: 'VirtualNetwork',
        destinationAddressPrefix: 'VirtualNetwork',
        access: 'Allow',
        priority: 160,
        direction: 'Inbound',
    },
    // Deny all other inbound traffic (explicit deny rule)
    {
        name: 'DenyAllInbound',
        protocol: '*',
        sourcePortRange: '*',
        destinationPortRange: '*',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Deny',
        priority: 4000,
        direction: 'Inbound',
    },
];

// Apply security rules to the network security group
const nsg = new azure.network.NetworkSecurityGroup('perpetual-nsg', {
    resourceGroupName: resourceGroup.name,
    securityRules: securityRules,
    location: resourceGroup.location,
});

// Associate NSG with the subnet
const nsgAssociation = new azure.network.SubnetNetworkSecurityGroupAssociation(
    'nsg-association',
    {
        subnetId: subnet.id,
        networkSecurityGroupId: nsg.id,
    }
);
```

**Security Considerations:**

-   **IPFS Ports**: 4001 (swarm), 5001 (API), 8080 (gateway) - all required for IPFS functionality
-   **HTTPS/HTTP**: 443/80 for web access and health checks
-   **SSH Access**: Should be restricted to specific admin IP ranges in production
-   **Default Deny**: Explicit deny rule ensures only specified traffic is allowed

### Identity and Access Management

```typescript
// Managed identity for secure service-to-service communication
const managedIdentity = new azure.managedidentity.UserAssignedIdentity(
    'perpetual-identity',
    {
        resourceGroupName: resourceGroup.name,
    }
);

// Role assignment for container registry access
const roleAssignment = new azure.authorization.RoleAssignment('registry-pull', {
    roleDefinitionId:
        '/subscriptions/{subscription-id}/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d', // AcrPull
    principalId: managedIdentity.principalId,
    scope: registry.id,
});
```

## Monitoring and Observability

### Minimal Monitoring Strategy

**Philosophy**: Start with free, built-in monitoring capabilities. Advanced telemetry (Application Insights) is not planned for the near term.

#### Kubernetes Native Monitoring

```bash
# Basic container logs
kubectl logs -f deployment/perpetual-node

# Resource usage monitoring
kubectl top pods
kubectl top nodes

# Health check via readiness/liveness probes
kubectl get pods -w
```

#### Free Azure Log Analytics Integration

```typescript
// Free-tier Log Analytics workspace (500MB/month limit)
const logAnalytics = new azure.operationalinsights.Workspace('basic-logs', {
    resourceGroupName: resourceGroup.name,
    sku: { name: 'Free' },
    retentionInDays: 7, // Minimal retention for free tier
});

// Basic resource health monitoring
const basicAlerts = new azure.insights.MetricAlert('resource-health', {
    resourceGroupName: resourceGroup.name,
    scopes: [cluster.id],
    criteria: [
        {
            metricName: 'node_cpu_usage_percentage',
            threshold: 90,
            operator: 'GreaterThan',
        },
    ],
    severity: 3,
    frequency: 'PT5M',
    windowSize: 'PT15M',
});
```

#### Alternative Monitoring Options

| Approach                 | Cost               | Capabilities                  | When to Use           |
| ------------------------ | ------------------ | ----------------------------- | --------------------- |
| **Kubernetes Native**    | Free               | Basic logs, resource metrics  | MVP, development      |
| **Azure Free Tier**      | Free (limited)     | 500MB logs, basic alerts      | Production monitoring |
| **Prometheus + Grafana** | Free (self-hosted) | Rich metrics, dashboards      | Advanced needs        |
| **Application Insights** | $5-15/month        | Full APM, distributed tracing | Future enhancement    |

#### Monitoring Metrics (Basic)

-   **IPFS Node Health**: Peer connections, block storage
-   **OrbitDB Status**: Log replication, discovery records
-   **Resource Usage**: CPU, memory, disk utilization
-   **Network**: Ingress/egress traffic patterns

### Cost Management

```typescript
// Budget alerts to prevent cost overruns
const budget = new azure.consumption.Budget('perpetual-budget', {
    resourceGroupId: resourceGroup.id,
    amount: 50, // $50/month alert threshold
    timeGrain: 'Monthly',
    notifications: [
        {
            enabled: true,
            threshold: 80, // Alert at 80% of budget
            operator: 'GreaterThan',
            contactEmails: ['admin@mimisbrunnr.com'],
        },
    ],
});
```

## Implementation Plan

### Immediate Implementation (MVP)

These components will be implemented now to provide a production-ready minimal infrastructure:

#### Core Infrastructure

-   [ ] Set up Pulumi project structure and Azure authentication
-   [ ] Deploy basic AKS cluster with single B1ms node
-   [ ] Configure standard load balancer and networking
-   [ ] Set up managed disk storage (1GB Premium SSD)

#### Security and Access Control

-   [ ] Implement comprehensive network security groups
-   [ ] Configure managed identities and RBAC
-   [ ] Set up Azure Key Vault for secrets management
-   [ ] Create GitHub Container Registry authentication

#### CI/CD and Deployment

-   [ ] Implement GitHub Actions workflows with environment protection
-   [ ] Configure approval gates for production deployments
-   [ ] Set up automated preview deployments for pull requests
-   [ ] Configure deployment rollback capabilities

#### Basic Monitoring

-   [ ] Set up free-tier Log Analytics workspace
-   [ ] Configure basic resource health alerts
-   [ ] Implement budget monitoring and cost alerts
-   [ ] Set up Kubernetes native monitoring tools

### Future Enhancements (Not Currently Planned)

These components may be considered for implementation in the future if specific business requirements emerge:

-   **Advanced Monitoring**: Application Insights with distributed tracing and custom metrics
-   **Azure Container Registry**: Private container registry with advanced security scanning
-   **Multi-region Deployment**: High availability across multiple Azure regions
-   **Auto-scaling**: Horizontal pod autoscaling based on IPFS/OrbitDB metrics
-   **Advanced Security**: Azure Defender, private endpoints, network policies
-   **Backup & Disaster Recovery**: Automated backup of IPFS data and configuration
-   **Performance Optimization**: Premium storage tiers, dedicated node pools
-   **Compliance Features**: Azure Policy enforcement, compliance reporting

## Cost Optimization Strategies

### Resource Right-Sizing

-   **Start with B1ms**: Monitor CPU/memory usage and scale as needed
-   **Storage Growth**: Begin with 1GB, auto-scale based on IPFS data growth
-   **Reserved Instances**: Consider 1-year reservations for 30-40% cost savings

### Monitoring and Alerts

-   **Budget Alerts**: Prevent surprise costs with proactive monitoring
-   **Resource Utilization**: Right-size resources based on actual usage
-   **Automated Scaling**: Scale down non-production resources during off-hours

## Next Steps

1. **Initialize Pulumi Project**: Set up the basic project structure
2. **Configure Azure Authentication**: Set up service principal and secrets
3. **Deploy Development Environment**: Start with minimal dev stack
4. **Integrate with Helm Package**: Connect infrastructure outputs to Kubernetes deployment
5. **Set up CI/CD Pipeline**: Automate infrastructure deployments

This infrastructure package provides a production-ready, cost-effective foundation for the perpetual IPFS/OrbitDB node while maintaining flexibility for future scaling and feature additions.
