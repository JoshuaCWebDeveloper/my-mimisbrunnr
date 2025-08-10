# Helm Deployment for Perpetual Node

## Overview

This document outlines the Kubernetes Helm chart deployment strategy for the perpetual node infrastructure. The Helm chart translates the Docker Compose architecture into production-ready Kubernetes manifests, enabling scalable deployment of the IPFS-based decentralized storage system.

## Architecture Translation

The Helm deployment mirrors the Docker Compose services with Kubernetes-native configurations:

### Service Mapping (Security Hardened)

| Docker Compose Service   | Kubernetes Resources                | Purpose                                          |
| ------------------------ | ----------------------------------- | ------------------------------------------------ |
| `kubo` (IPFS node)       | Deployment + Service + PVC + Secret | Security-hardened IPFS with encrypted keystore   |
| `ipfs-proxy` (OpenResty) | Deployment + Service + ConfigMap    | Kubo-compatible façades with validation pipeline |
| `validator` (AJV)        | Deployment + Service + ConfigMap    | JSON schema validation sidecar service           |
| `orbitdb-manager`        | Deployment + Service                | OrbitDB discovery and enhanced pinning strategy  |

## Helm Chart Structure

```
packages/helm/
├── Chart.yaml                 # Chart metadata and dependencies
├── values.yaml               # Default configuration values with security params
├── templates/
│   ├── kubo/
│   │   ├── deployment.yaml    # Security-hardened IPFS deployment
│   │   ├── service.yaml       # Internal IPFS service (no gateway)
│   │   ├── pvc.yaml          # Persistent volume with encryption
│   │   └── secret.yaml       # IPNS keystore encryption secret
│   ├── ipfs-proxy/
│   │   ├── deployment.yaml    # OpenResty with Lua façades
│   │   ├── service.yaml       # Public API façade endpoints
│   │   └── configmap.yaml     # Complete façade configuration
│   ├── validator/
│   │   ├── deployment.yaml    # AJV validation sidecar
│   │   ├── service.yaml       # Internal validation service
│   │   └── configmap.yaml     # JSON schemas configuration
│   ├── orbitdb-manager/
│   │   ├── deployment.yaml    # Enhanced OrbitDB service
│   │   └── service.yaml       # Internal OrbitDB endpoints
│   ├── security/
│   │   ├── network-policy.yaml # Network security policies
│   │   ├── pod-security.yaml  # Pod security standards
│   │   └── rbac.yaml         # Minimal RBAC configuration
│   ├── monitoring/
│   │   ├── servicemonitor.yaml # Prometheus metrics scraping
│   │   └── prometheusrule.yaml # Security alerting rules
│   ├── ingress.yaml          # Secured external access
│   └── _helpers.tpl          # Chart helper templates
└── README.md                 # Security-enhanced usage documentation
```

## Component Specifications

### 1. Security-Hardened IPFS/Kubo Node

**Image**: `ipfs/kubo@sha256:PINNED_DIGEST` (never :latest)

**Security Features**:

-   **Gateway Disabled**: No HTTP gateway (ports 8080, 8081 removed)
-   **Encrypted Keystore**: IPNS keys stored on encrypted PVC
-   **Repository Limits**: `StorageMax=20GB`, `GCPeriod=1h`
-   **Enhanced IPNS**: `RepublishPeriod=4h` for improved freshness
-   **P2P Only**: Port 4001 for swarm, API via proxy only

**Security Configuration**:

-   No direct API access (proxy-only via façades)
-   Server profile optimized for security
-   Pubsub enabled with façade filtering
-   Connection limits: HighWater=400, LowWater=100
-   Experimental features disabled (`P2pHttpProxy=false`)

### 2. OpenResty Security Façades

**Image**: `openresty/openresty:alpine`

**Comprehensive Security Pipeline**:

-   **Kubo-Compatible Façades**: `/api/v0/pin/add`, `/api/v0/dag/get`
-   **Pubsub Façades**: Topic allowlisting, size limits, JSON validation
-   **Multi-Layer Validation**: CID format, size limits, schema validation
-   **Rate Limiting**: Per-IP quotas with tunable burst capacity
-   **Content Restrictions**: DAG-JSON/CBOR only, 1MB max, single-block pins

**Security Configuration**:

-   CORS restricted to extension origin only
-   Comprehensive Lua validation pipeline
-   Integration with AJV validation sidecar
-   Blocked endpoints: `/api/v0/add`, `/api/v0/block/*`, etc.
-   Real-time security metrics and logging

### 3. Enhanced OrbitDB Manager

**Image**: Custom Node.js service (built from Dockerfile)

**Enhanced Features**:

-   **Periodic Log Head Scanning**: Comprehensive pinning via log traversal
-   **JSON Pinning Index**: Monitoring-ready pinned content tracking
-   **Prometheus Metrics**: `taglist_count`, pinning success rates
-   **Enhanced Cleanup**: OrbitDB compaction with latest-per-handle strategy
-   **Security Integration**: Coordinates with façade validation pipeline

**Security Configuration**:

-   Never auto-pins from discovery (façade-only pinning)
-   Enhanced rate limiting and content validation
-   Secure internal service communication only
-   Comprehensive operational monitoring and alerting

### 4. AJV Validation Sidecar

**Image**: Custom Node.js service with AJV

**Validation Services**:

-   **Schema Validation**: `taglist/v1`, `pubsub/head/v1` schemas
-   **Fast Response**: Sub-100ms validation for real-time façades
-   **Clear Error Messages**: Detailed validation failure responses
-   **Health Monitoring**: Service availability and validation metrics

**Integration**:

-   Internal HTTP service on port 3000
-   POST `/validate` endpoint with schema selection
-   Used by OpenResty Lua scripts for real-time validation
-   Comprehensive logging for security analysis

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

**External Access Ports (Security Hardened)**:

-   **4001**: IPFS P2P swarm (NodePort/LoadBalancer)
-   **5001**: Security façades only (ClusterIP, Ingress with strict policies)
-   **3000**: OrbitDB Manager metrics (ClusterIP, internal only)

**Removed for Security**:

-   **8080, 8081**: IPFS Gateway disabled entirely
-   **Direct API Access**: All API calls via security façades

**Internal Services**:

-   **3001**: AJV validator sidecar (ClusterIP, internal network only)
-   **5001**: Raw Kubo API (internal cluster communication only)

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

# Security configuration
security:
    extensionId: chrome-extension://your-extension-id
    enableMetrics: true
    enableAlerting: true

# IPFS/Kubo configuration (security hardened)
kubo:
    image:
        repository: ipfs/kubo
        digest: sha256:PINNED_DIGEST_HERE # Never use tags
    storage:
        size: 50Gi
        storageClass: ''
        encryption: true
    profile: server
    logging: info
    security:
        disableGateway: true
        ipnsRepublishPeriod: 4h
        storageMax: 20GB
        gcPeriod: 1h
        disableP2pProxy: true

# OpenResty Security Façades
ipfsProxy:
    image:
        repository: openresty/openresty
        tag: alpine
    security:
        apiRpm: 60 # Requests per minute per IP
        pinAddMaxPerIpPerDay: 2000 # Daily pin quota
        pinAddBurst: 30 # Pin burst capacity
        dagGetBurst: 60 # DAG read burst
        pubsubPubBurst: 60 # Pubsub publish burst
        pubsubSubBurst: 60 # Pubsub subscribe burst
        maxContentSize: 1MB # Hard size limit
        corsOrigin: chrome-extension://your-id

# AJV Validation Sidecar
validator:
    image:
        repository: mimisbrunnr/validator
        tag: latest
    schemas:
        - taglist/v1
        - pubsub/head/v1
    resources:
        requests:
            memory: 128Mi
            cpu: 100m
        limits:
            memory: 256Mi
            cpu: 500m

# Enhanced OrbitDB Manager
orbitdbManager:
    image:
        repository: mimisbrunnr/orbitdb-manager
        tag: latest
    orbitdb:
        logName: xcom-taglist-discovery
        pinBatchSize: 20
        pinGcInterval: 3600000
        maxPinsPerHandle: 200
        enableCompaction: true
        maintainPinIndex: true
    monitoring:
        enablePrometheus: true
        metricsPort: 9090
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

### Security Monitoring and Debugging

```bash
# Check security compliance
kubectl auth can-i --list --as=system:serviceaccount:mimisbrunnr:perpetual-node-sa

# Monitor security events
kubectl get events -n mimisbrunnr --field-selector type=Warning

# View security-relevant logs
kubectl logs -f deployment/kubo -n mimisbrunnr | grep -E 'ERROR|WARN|security'
kubectl logs -f deployment/ipfs-proxy -n mimisbrunnr | grep -E '4[0-9][0-9]|5[0-9][0-9]'
kubectl logs -f deployment/validator -n mimisbrunnr

# Secure port forwarding (façades only)
kubectl port-forward service/ipfs-proxy 5001:5001 -n mimisbrunnr

# Security health checks
curl http://localhost:5001/api/v0/version  # Limited façade endpoint
curl http://localhost:3000/health          # OrbitDB manager health

# Check security metrics
kubectl port-forward service/prometheus 9090:9090 -n monitoring
# Then visit: http://localhost:9090/graph?g0.expr=pin_add_facade_rejected_total
```

### Security Incident Response

```bash
# Check for security violations
kubectl get networkpolicies -n mimisbrunnr
kubectl describe networkpolicy default-deny-all -n mimisbrunnr

# Review resource usage for anomalies
kubectl top pods -n mimisbrunnr
kubectl describe pod <suspicious-pod> -n mimisbrunnr

# Emergency security isolation
kubectl patch networkpolicy default-deny-all -n mimisbrunnr -p '{"spec":{"policyTypes":["Ingress","Egress"],"egress":[]}}'

# Backup and forensics
kubectl get events -n mimisbrunnr -o yaml > security-incident-events.yaml
kubectl logs deployment/ipfs-proxy -n mimisbrunnr > security-incident-proxy-logs.txt
```

## Comprehensive Security Configuration

### Network Policies (Zero-Trust)

```yaml
# Deny all traffic by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
    name: default-deny-all
spec:
    podSelector: {}
    policyTypes:
        - Ingress
        - Egress
---
# Allow only required internal communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
    name: ipfs-proxy-to-kubo
spec:
    podSelector:
        matchLabels:
            app: ipfs-proxy
    policyTypes:
        - Egress
    egress:
        - to:
              - podSelector:
                    matchLabels:
                        app: kubo
          ports:
              - protocol: TCP
                port: 5001
        - to:
              - podSelector:
                    matchLabels:
                        app: validator
          ports:
              - protocol: TCP
                port: 3000
```

### Pod Security Standards

```yaml
apiVersion: v1
kind: Namespace
metadata:
    name: mimisbrunnr
    labels:
        pod-security.kubernetes.io/enforce: restricted
        pod-security.kubernetes.io/audit: restricted
        pod-security.kubernetes.io/warn: restricted
```

### RBAC Configuration (Minimal Privileges)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
    name: perpetual-node-sa
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
    name: perpetual-node-role
rules:
    - apiGroups: ['']
      resources: ['configmaps', 'secrets']
      verbs: ['get', 'list']
    - apiGroups: ['']
      resources: ['pods']
      verbs: ['get', 'list']
```

### Secret Management (Encrypted)

**IPNS Keystore Encryption**:

```yaml
apiVersion: v1
kind: Secret
metadata:
    name: ipns-keystore-key
type: Opaque
data:
    encryption-key: <base64-encoded-key>
```

**Extension CORS Configuration**:

```yaml
apiVersion: v1
kind: Secret
metadata:
    name: extension-config
type: Opaque
data:
    extension-id: <base64-encoded-extension-id>
```

**TLS Certificates** (Let's Encrypt integration):

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
    name: perpetual-node-tls
spec:
    secretName: perpetual-node-tls-secret
    issuerRef:
        name: letsencrypt-prod
        kind: ClusterIssuer
    dnsNames:
        - ipfs-api.your-domain.com
```

### Resource Limits (Security Hardening)

```yaml
resources:
    requests:
        memory: 512Mi
        cpu: 250m
    limits:
        memory: 2Gi
        cpu: 1000m
        ephemeral-storage: 1Gi
securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
        drop:
            - ALL
```

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

### Multi-Region Deployment (Security Considerations)

-   **Cross-region IPFS swarm**: Encrypted private network with shared swarm key
-   **OrbitDB replication**: Authenticated cross-region pubsub with validation
-   **Geo-distributed security**: Consistent façade validation across regions
-   **Regional compliance**: Data residency and encryption requirements
-   **Cross-region monitoring**: Unified security alerting and incident response

This Helm deployment provides a production-ready, scalable foundation for the perpetual node infrastructure while maintaining the security and functionality established in the Docker Compose development environment.
