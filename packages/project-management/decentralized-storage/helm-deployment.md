# Helm Deployment for Perpetual Node

## Overview

This document outlines the Kubernetes Helm chart deployment strategy for the perpetual node infrastructure. The Helm chart translates the Docker Compose architecture into production-ready Kubernetes manifests, enabling scalable deployment of the IPFS-based decentralized storage system.

## Architecture Translation

The Helm deployment mirrors the Docker Compose services with Kubernetes-native configurations:

### Service Mapping

| Docker Compose Service | Kubernetes Resources             | Purpose                                         |
| ---------------------- | -------------------------------- | ----------------------------------------------- |
| `kubo` (IPFS node)     | Deployment + Service + PVC       | Core IPFS functionality with persistent storage |
| `ipfs-proxy` (Nginx)   | Deployment + Service + ConfigMap | Content filtering proxy for IPFS API            |
| `orbitdb-manager`      | Deployment + Service             | OrbitDB discovery and pubsub management         |

## Helm Chart Structure

```
packages/helm/
├── Chart.yaml                 # Chart metadata and dependencies
├── values.yaml               # Default configuration values
├── templates/
│   ├── kubo/
│   │   ├── deployment.yaml    # IPFS node deployment
│   │   ├── service.yaml       # IPFS service endpoints
│   │   └── pvc.yaml          # Persistent volume for IPFS data
│   ├── ipfs-proxy/
│   │   ├── deployment.yaml    # Nginx filtering proxy
│   │   ├── service.yaml       # Proxy service endpoints
│   │   └── configmap.yaml     # Nginx configuration with Lua filtering
│   ├── orbitdb-manager/
│   │   ├── deployment.yaml    # OrbitDB management service
│   │   └── service.yaml       # OrbitDB service endpoints
│   ├── ingress.yaml          # External access configuration
│   └── _helpers.tpl          # Chart helper templates
└── README.md                 # Chart usage documentation
```

## Component Specifications

### 1. IPFS/Kubo Node

**Image**: `ipfs/kubo:latest`

**Key Features**:

-   Persistent storage for IPFS repository data
-   Health checks using `ipfs id` command
-   P2P swarm connectivity on port 4001
-   HTTP gateway on port 8080
-   WebSocket gateway on port 8081
-   Internal API on port 5001 (proxy-only access)

**Configuration**:

-   CORS enabled for browser extension access
-   Server profile for production workloads
-   Pubsub enabled for OrbitDB functionality
-   Connection manager limits for resource control

### 2. Nginx Filtering Proxy

**Image**: `openresty/openresty:alpine`

**Key Features**:

-   Lua-based content filtering for IPFS API requests
-   Blocks potentially harmful content types and operations
-   Rate limiting and request validation
-   Depends on Kubo service availability

**Configuration**:

-   Nginx config stored in ConfigMap
-   Upstream to Kubo service internal endpoint
-   Defensive filtering as documented in perpetual-node-architecture.md

### 3. OrbitDB Manager

**Image**: Custom Node.js service (built from Dockerfile)

**Key Features**:

-   Manages OrbitDB discovery log (`xcom-taglist-discovery`)
-   Pubsub participation for peer discovery
-   Content pinning management with garbage collection
-   Health check endpoints for monitoring

**Configuration**:

-   Connects to Kubo via internal service endpoint
-   Configurable pinning limits and GC intervals
-   Development vs production environment settings

## Kubernetes-Specific Configurations

### Persistent Storage

**IPFS Data Volume**:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
    name: ipfs-data
spec:
    accessModes:
        - ReadWriteOnce
    resources:
        requests:
            storage: 50Gi # Configurable via values.yaml
```

**OrbitDB Data Volume**:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
    name: orbitdb-data
spec:
    accessModes:
        - ReadWriteOnce
    resources:
        requests:
            storage: 10Gi # Configurable via values.yaml
```

### Service Dependencies

**Initialization Order**:

1. Kubo deployment with readiness probe
2. IPFS Proxy deployment with initContainer waiting for Kubo
3. OrbitDB Manager deployment with initContainer waiting for Kubo

**Health Check Configuration**:

```yaml
livenessProbe:
    exec:
        command: ['ipfs', 'id']
    initialDelaySeconds: 30
    periodSeconds: 30

readinessProbe:
    httpGet:
        path: /api/v0/id
        port: 5001
    initialDelaySeconds: 10
    periodSeconds: 5
```

### Network Configuration

**Internal Service Communication**:

-   Kubo service: `kubo.default.svc.cluster.local:5001`
-   All services within same namespace
-   No external dependencies required

**External Access Ports**:

-   **4001**: IPFS P2P swarm (NodePort/LoadBalancer)
-   **5001**: IPFS API via proxy (ClusterIP, Ingress)
-   **8080**: IPFS Gateway (ClusterIP, Ingress)
-   **8081**: IPFS WebSocket (ClusterIP, Ingress)
-   **3000**: OrbitDB Manager API (ClusterIP)

### Resource Management

**Default Resource Limits**:

```yaml
kubo:
    resources:
        requests:
            memory: '512Mi'
            cpu: '250m'
        limits:
            memory: '2Gi'
            cpu: '1000m'

ipfsProxy:
    resources:
        requests:
            memory: '128Mi'
            cpu: '100m'
        limits:
            memory: '256Mi'
            cpu: '500m'

orbitdbManager:
    resources:
        requests:
            memory: '256Mi'
            cpu: '200m'
        limits:
            memory: '1Gi'
            cpu: '500m'
```

## Configuration Management

### values.yaml Structure

```yaml
# Global configuration
global:
    namespace: mimisbrunnr
    nodeEnv: production

# IPFS/Kubo configuration
kubo:
    image:
        repository: ipfs/kubo
        tag: latest
    storage:
        size: 50Gi
        storageClass: ''
    profile: server
    logging: info

# Nginx Proxy configuration
ipfsProxy:
    image:
        repository: openresty/openresty
        tag: alpine
    config:
        rateLimitRps: 10
        maxBodySize: 10m

# OrbitDB Manager configuration
orbitdbManager:
    image:
        repository: mimisbrunnr/orbitdb-manager
        tag: latest
    orbitdb:
        logName: xcom-taglist-discovery
        pinBatchSize: 20
        pinGcInterval: 3600000
        maxPinsPerHandle: 200
```

### Environment-Specific Overrides

**Development** (`values-dev.yaml`):

```yaml
kubo:
    logging: debug
    storage:
        size: 10Gi

orbitdbManager:
    orbitdb:
        logName: xcom-taglist-discovery-dev
        pinBatchSize: 5
        pinGcInterval: 1800000
```

**Production** (`values-prod.yaml`):

```yaml
kubo:
    logging: info
    storage:
        size: 100Gi
        storageClass: fast-ssd

ipfsProxy:
    config:
        rateLimitRps: 50

orbitdbManager:
    orbitdb:
        maxPinsPerHandle: 500
```

## Deployment Workflow

### Installation Commands

```bash
# Add chart repository (if published)
helm repo add mimisbrunnr https://charts.mimisbrunnr.io

# Install development environment
helm install perpetual-node mimisbrunnr/perpetual-node \
  -f values-dev.yaml \
  --namespace mimisbrunnr \
  --create-namespace

# Install production environment
helm install perpetual-node mimisbrunnr/perpetual-node \
  -f values-prod.yaml \
  --namespace mimisbrunnr-prod \
  --create-namespace
```

### Upgrade and Rollback

```bash
# Upgrade deployment
helm upgrade perpetual-node mimisbrunnr/perpetual-node \
  -f values-prod.yaml

# Rollback to previous version
helm rollback perpetual-node 1

# Check deployment status
helm status perpetual-node
```

### Monitoring and Debugging

```bash
# Check pod status
kubectl get pods -n mimisbrunnr

# View logs
kubectl logs -f deployment/kubo -n mimisbrunnr
kubectl logs -f deployment/orbitdb-manager -n mimisbrunnr

# Port forwarding for local access
kubectl port-forward service/ipfs-proxy 5001:5001 -n mimisbrunnr
kubectl port-forward service/kubo 8080:8080 -n mimisbrunnr

# Health check endpoints
curl http://localhost:3000/health
curl http://localhost:5001/api/v0/id
```

## Security Considerations

### Network Policies

-   Restrict ingress to required ports only
-   Allow internal communication between services
-   Block direct access to Kubo API (proxy-only)

### RBAC Configuration

-   Minimal service account permissions
-   No cluster-level access required
-   Namespace-scoped operations only

### Secret Management

-   IPFS swarm key (if using private network)
-   TLS certificates for ingress
-   OrbitDB signing keys (if required)

## Integration with Infrastructure as Code

### Pulumi Integration

The Helm chart integrates with the broader infrastructure-as-code setup:

```typescript
// packages/infra/src/kubernetes/perpetual-node.ts
import * as k8s from '@pulumi/kubernetes';

const perpetualNodeChart = new k8s.helm.v3.Chart('perpetual-node', {
    chart: './packages/helm',
    values: {
        global: { nodeEnv: 'production' },
        kubo: { storage: { size: '100Gi' } },
    },
});
```

### CI/CD Pipeline

-   Chart linting with `helm lint`
-   Template validation with `helm template`
-   Automated testing with `helm test`
-   Deployment to staging/production clusters

## Migration from Docker Compose

### Data Migration Strategy

1. **Backup Docker volumes**:

    ```bash
    docker run --rm -v mimisbrunnr_ipfs-data:/data -v $(pwd):/backup alpine tar czf /backup/ipfs-backup.tar.gz /data
    ```

2. **Restore to Kubernetes PVC**:
    ```bash
    kubectl cp ipfs-backup.tar.gz kubo-pod:/tmp/
    kubectl exec kubo-pod -- tar xzf /tmp/ipfs-backup.tar.gz -C /data/ipfs
    ```

### Configuration Translation

-   Docker Compose environment variables → Kubernetes ConfigMaps
-   Docker volumes → PersistentVolumeClaims
-   Docker networks → Kubernetes Services
-   Docker health checks → Kubernetes probes

## Future Enhancements

### Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
    name: orbitdb-manager-hpa
spec:
    scaleTargetRef:
        apiVersion: apps/v1
        kind: Deployment
        name: orbitdb-manager
    minReplicas: 1
    maxReplicas: 3
    metrics:
        - type: Resource
          resource:
              name: cpu
              target:
                  type: Utilization
                  averageUtilization: 70
```

### Service Mesh Integration

-   Istio service mesh for advanced traffic management
-   mTLS for service-to-service communication
-   Observability with distributed tracing

### Multi-Region Deployment

-   Cross-region IPFS swarm connectivity
-   OrbitDB replication across data centers
-   Geo-distributed content delivery

This Helm deployment provides a production-ready, scalable foundation for the perpetual node infrastructure while maintaining the security and functionality established in the Docker Compose development environment.
