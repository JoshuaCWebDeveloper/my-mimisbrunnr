# Decentralized Storage Planning

## Implementation Tasks by Package

Based on the technical specification and confirmed architecture decisions:

-   **Confirmed**: IPFS/IPNS approach (Proposal 1)
-   **Identity Method**: Tweet verification (no OAuth)
-   **Storage**: IndexedDB (no wallet integration)
-   **Extension**: Enhance existing mimisbrunnr-ext package
-   **Deployment**: Docker local → Kubernetes via Helm → Cloud via Pulumi

## Package: mimisbrunnr-ext (Browser Extension)

### Core Cryptographic System

-   **Implement scrypt-based key derivation** (N=2^15, r=8, p=1)
-   **Build DID generation** from Ed25519 keypairs
-   **Create identity validation** and verification functions
-   **Implement IndexedDB key storage** (secure browser-based storage)

### Identity Verification System

-   **Build tweet verification flow** for identity proof
-   **Create proof posting interface** (tweet generation with verification codes)
-   **Implement proof validation system** (fetch and verify tweets)
-   **Build handle-to-DID linkage verification**
-   **Detect and reject malicious handle mappings** (handle hijack prevention)
-   **All cryptographic verification** (signature checks, identity validation)

### IPFS/IPNS Integration

-   **Set up in-browser IPFS instance** with `ipfs-core`
-   **Implement IPNS publishing** and resolution
-   **Build content addressing** for tag lists and DID documents
-   **Create swarm connection management**

### OrbitDB Discovery System

-   **Set up OrbitDB log store** for discovery records
-   **Implement lookup key generation** (SHA-256 of lowercase handle)
-   **Build discovery record creation** and validation
-   **Implement last-write-wins consistency** model
-   **Validate discovery records** before trusting them (timestamp monotonicity, signature verification)

### Tag List Management

-   **Build tag list JSON structure** and validation
-   **Implement DID document creation** and updating
-   **Create IPNS publishing workflow**
-   **Build OrbitDB discovery record updates**
-   **Implement tag list discovery** and verification system
-   **Pin tag lists and DID documents** using standard IPFS pin API calls to perpetual node
-   **Manage content lifecycle** (decide when to unpin old content)

### IndexedDB Caching

-   **Build block storage** and restoration system
-   **Implement cache management** and pruning
-   **Create offline-first data access** patterns
-   **Build sync mechanisms** for online/offline transitions

### Extension UI Enhancement

-   **Integrate decentralized identity** into existing UI
-   **Add tag publishing/updating interface**
-   **Create identity verification screens**
-   **Build tag discovery and subscription features**
-   **Handle offline scenarios** and network partitions gracefully
-   **Implement client-side rate limiting** decisions for publishing/updating

## Package: perpetual-node (New - Perpetual Infrastructure)

**Note**: See `perpetual-node-architecture.md` for detailed architecture documentation.

### Custom OrbitDB Service (Node.js/TypeScript)

-   **OrbitDB Manager** - Connect to Kubo IPFS, participate in discovery log pubsub
-   **Replication Handler** - Pin OrbitDB log entries as they replicate (no filtering)
-   **Basic Rate Limiter** - Defensive API rate limiting for infrastructure protection
-   **Health Check API** - Service monitoring endpoints

### Docker Integration

-   **Dockerfile for OrbitDB service** - Custom Node.js container
-   **Uses official Kubo IPFS image** - `ipfs/kubo:latest` (no custom build needed)
-   **docker-compose.yml** - Lives in monorepo root, orchestrates both services
-   **Configuration files** - Kubo IPFS config, environment variables

### Key Features

-   **OrbitDB pubsub participation** - Act as perpetual peer in discovery log network
-   **OrbitDB log pinning** - Pin OrbitDB entries and heads for availability (no filtering)
-   **IPFS infrastructure** - Provide standard IPFS API for client content pinning
-   **Defensive rate limiting** - Basic API protection without affecting data flow
-   **Minimal business logic** - All validation and security handled by clients

## Package: helm (New - Kubernetes Deployment)

**Note**: See `helm-deployment.md` for comprehensive Helm deployment architecture and specifications.

### Helm Charts

-   **Create Kubo deployment manifest**
-   **Build OrbitDB sidecar configuration**
-   **Implement persistent volume claims** for IPFS data
-   **Create service definitions** and ingress rules
-   **Build configmaps** for node configuration
-   **Implement security policies** and RBAC

## Package: infra (New - Cloud Infrastructure)

**Note**: See `infra-package-architecture.md` for comprehensive Azure infrastructure architecture, cost analysis, and implementation details.

### Azure Infrastructure Stack

-   **AKS Cluster** - B1ms worker node (2 vCPU/2GB RAM) with free control plane
-   **Standard Load Balancer** - Production-grade with health checks ($12/month)
-   **Managed Storage** - Premium SSD for IPFS data persistence
-   **Virtual Networking** - VNet with Network Security Groups for security
-   **Container Registry** - Azure Container Registry for custom OrbitDB service
-   **Monitoring** - Application Insights and Log Analytics integration

### Pulumi Infrastructure as Code

-   **TypeScript-native** - Seamless integration with existing monorepo
-   **Environment-specific stacks** - Development and production configurations
-   **Resource organization** - Modular structure for cluster, networking, storage, security
-   **State management** - Pulumi Service for team collaboration and state consistency
-   **Cost optimization** - Budget alerts and right-sizing recommendations

### CI/CD Integration

-   **GitHub Actions workflows** - Automated preview and deployment pipelines
-   **Preview deployments** - Safe infrastructure changes with `pulumi preview`
-   **Automated testing** workflows and security scanning
-   **Infrastructure rollback** - Built-in rollback capabilities on deployment failures

### Total Cost: ~$35.60/month

-   Worker Node: $13/month (B1ms)
-   Load Balancer: $12/month (Standard SKU)
-   Storage: $0.60/month (1GB Premium SSD)
-   Additional Services: ~$10/month (ACR + Monitoring)

## Package: shared/api (New - Data Structures & Types)

### Data Structure Definitions

-   **Define tag list JSON schema** and TypeScript types
-   **Create DID document structure** definitions
-   **Build OrbitDB discovery record** types
-   **Implement validation schemas** for all data structures

## Package: shared/crypto (New - Cryptographic Libraries)

### Core Cryptographic Functions

-   **Extract scrypt key derivation** utilities
-   **Build DID generation** and management libraries
-   **Create Ed25519 signing** and verification functions
-   **Implement identity validation** utilities

## Package: shared/testing (New - Testing Infrastructure)

### Test Utilities

-   **Unit tests** for cryptographic functions
-   **Integration tests** for IPFS/OrbitDB workflows
-   **End-to-end tests** for browser extension
-   **Security penetration testing**
-   **Performance and load testing**

## Implementation Priority

### High Priority (Phase 1)

1. **mimisbrunnr-ext**: Core cryptographic system + tweet verification
2. **mimisbrunnr-ext**: IPFS/IPNS integration
3. **perpetual-node**: Basic Docker setup
4. **Security validation** across all components

### Medium Priority (Phase 2)

1. **mimisbrunnr-ext**: OrbitDB discovery + tag list management
2. **mimisbrunnr-ext**: IndexedDB caching + UI enhancement
3. **perpetual-node**: Full infrastructure
4. **Testing infrastructure**

### Low Priority (Phase 3)

1. **helm**: Kubernetes deployment
2. **infra**: Pulumi cloud infrastructure
3. **shared/api, shared/crypto, shared/testing**: Shared library extraction
4. **Documentation and guides**

## Technical Notes

### Pulumi CI/CD Feasibility

Automated infrastructure updates with Pulumi are highly feasible:

-   **Official CI/CD integrations**: GitHub Actions, GitLab CI, Azure DevOps, Jenkins
-   **Pulumi Service**: Provides state management, policy enforcement, and deployment history
-   **Preview deployments**: Safe testing of infrastructure changes via `pulumi preview`
-   **Policy as Code**: Can enforce security and compliance rules automatically
-   **Rollback capabilities**: Built-in infrastructure rollback on deployment failures

## Next Steps

1. **Examine existing mimisbrunnr-ext** structure and integration points
2. **Begin core cryptographic implementation** in extension
3. **Set up basic Docker infrastructure** for local development
4. **Implement tweet verification system**
