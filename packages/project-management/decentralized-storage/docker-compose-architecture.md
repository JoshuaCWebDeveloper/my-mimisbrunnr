# Docker Compose Architecture

## Overview

The docker-compose.yml file orchestrates the local development environment for the decentralized storage system. It coordinates the official Kubo IPFS node, nginx filtering proxy, and custom OrbitDB management service.

## File Location

```
# Root of monorepo
docker-compose.yml
```

## Service Composition

### Complete docker-compose.yml (Security Hardened)

```yaml
version: '3.8'

services:
    # Security-hardened IPFS API proxy with Kubo-compatible façades
    ipfs-proxy:
        image: openresty/openresty:alpine
        container_name: ipfs-proxy
        ports:
            - '5001:5001' # Secured IPFS API façades only
        volumes:
            - ./packages/perpetual-node/config/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf:ro
        environment:
            # Security tuning parameters
            - API_RPM=${API_RPM:-60}
            - PIN_ADD_MAX_PER_IP_PER_DAY=${PIN_ADD_MAX_PER_IP_PER_DAY:-2000}
            - PIN_ADD_BURST=${PIN_ADD_BURST:-30}
            - DAG_GET_BURST=${DAG_GET_BURST:-60}
            - PUBSUB_PUB_BURST=${PUBSUB_PUB_BURST:-60}
            - PUBSUB_SUB_BURST=${PUBSUB_SUB_BURST:-60}
            - EXT_ID=${EXT_ID:-chrome-extension-id-placeholder}
        depends_on:
            kubo:
                condition: service_healthy
            validator:
                condition: service_healthy
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:5001/api/v0/version']
            interval: 30s
            timeout: 10s
            retries: 3

    # Security-hardened Kubo IPFS with disabled gateway
    kubo:
        image: ipfs/kubo@sha256:${KUBO_DIGEST} # Never use :latest
        container_name: ipfs-node
        ports:
            - '4001:4001' # P2P swarm port only
            # Gateway ports removed (8080, 8081) - security hardening
            # 5001 not exposed - only accessible through proxy
        volumes:
            - ipfs-data:/data/ipfs
            - ./packages/perpetual-node/config/kubo:/container-init.d
        environment:
            - IPFS_PROFILE=server
            - IPFS_LOGGING=info
            # Security configuration
            - IPNS_REPUBLISH_PERIOD=${IPNS_REPUBLISH_PERIOD:-14400} # 4 hours
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'ipfs', 'id']
            interval: 30s
            timeout: 10s
            retries: 3

    # AJV-based JSON schema validation sidecar
    validator:
        build:
            context: ./packages/perpetual-node
            dockerfile: docker/validator.Dockerfile
        container_name: validator
        ports:
            - '3001:3000' # Internal validation service
        environment:
            - NODE_ENV=development
            - LOG_LEVEL=info
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
            interval: 30s
            timeout: 5s
            retries: 3

    orbitdb-manager:
        build:
            context: ./packages/perpetual-node
            dockerfile: docker/Dockerfile
        container_name: orbitdb-manager
        depends_on:
            kubo:
                condition: service_healthy
        environment:
            - NODE_ENV=development
            - IPFS_API_URL=http://kubo:5001
            # Note: No IPFS_GATEWAY_URL - gateway disabled for security
            - ORBITDB_LOG_NAME=xcom-taglist-discovery
            - ORBITDB_DATA_DIR=/app/data/orbitdb
            - PORT=3000
            - LOG_LEVEL=debug
            - PIN_BATCH_SIZE=10
            - PIN_GC_INTERVAL=3600000
            # Enhanced security settings
            - STORAGE_CLEANUP_INTERVAL=3600000
            - MAX_LOG_ENTRIES_PINNED=1000
        volumes:
            - orbitdb-data:/app/data
            - ./logs/orbitdb:/app/logs
        ports:
            - '3000:3000' # Health check and metrics endpoints
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
            interval: 30s
            timeout: 10s
            retries: 3

volumes:
    ipfs-data:
        driver: local
    orbitdb-data:
        driver: local

networks:
    default:
        name: mimisbrunnr-network
```

## Configuration Structure

### Directory Layout for Configuration

```
# Configuration managed by perpetual-node package
packages/perpetual-node/config/
├── nginx.conf                     # OpenResty config with security façades
├── validator-schemas.json         # AJV schemas for validation
└── kubo/
    ├── 001-security-hardening.sh  # Security configuration script
    ├── 002-disable-gateway.sh     # Gateway removal script
    └── ipfs-config.json           # Security-hardened IPFS configuration

# Docker build contexts
packages/perpetual-node/docker/
├── Dockerfile                     # OrbitDB manager service
└── validator.Dockerfile           # Validation sidecar service

# Root level
config/docker/
└── .env.example                   # Environment variable template with security params

logs/
├── ipfs/                          # IPFS logs (minimal due to hardening)
├── orbitdb/                       # OrbitDB service logs
└── security/                      # Security event logs
```

### Kubo Configuration Scripts

**packages/perpetual-node/config/kubo/001-security-hardening.sh**

```bash
#!/bin/bash
# Security hardening configuration

# Set IPNS republish period to 4 hours (improved freshness)
ipfs config --json Ipns.RepublishPeriod '"4h"'

# Configure repository limits
ipfs config --json Datastore.StorageMax '"20GB"'
ipfs config --json Datastore.GCPeriod '"1h"'

# Disable experimental features for security
ipfs config --json Experimental.P2pHttpProxy false

# Configure connection limits
ipfs config --json Swarm.ConnMgr.HighWater 400
ipfs config --json Swarm.ConnMgr.LowWater 100

# Note: CORS handled by nginx proxy, not Kubo directly
echo "Security hardening applied"
```

**packages/perpetual-node/config/kubo/002-disable-gateway.sh**

```bash
#!/bin/bash
# Disable IPFS gateway for security

# Remove gateway listener entirely
ipfs config --json Addresses.Gateway '""'

# Set gateway security flags
ipfs config --json Gateway.NoFetch true
ipfs config --json Gateway.HTTPHeaders '{}'

# Ensure no public gateways are configured
ipfs config --json Gateway.PublicGateways '{}'

echo "IPFS Gateway disabled for security"
```

**packages/perpetual-node/config/kubo/ipfs-config.json**

```json
{
    "Addresses": {
        "Swarm": ["/ip4/0.0.0.0/tcp/4001", "/ip4/0.0.0.0/udp/4001/quic-v1"],
        "API": "/ip4/0.0.0.0/tcp/5001",
        "Gateway": ""
    },
    "Discovery": {
        "MDNS": {
            "Enabled": true
        }
    },
    "Swarm": {
        "ConnMgr": {
            "HighWater": 400,
            "LowWater": 100
        }
    },
    "Pubsub": {
        "Enabled": true
    },
    "Gateway": {
        "NoFetch": true,
        "HTTPHeaders": {}
    },
    "Experimental": {
        "P2pHttpProxy": false
    },
    "Datastore": {
        "StorageMax": "20GB",
        "GCPeriod": "1h"
    },
    "Ipns": {
        "RepublishPeriod": "4h"
    }
}
```

## Development Workflow

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start with logs visible
docker-compose up

# Start specific service
docker-compose up kubo
```

### Service Management

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs kubo
docker-compose logs orbitdb-manager

# Restart service
docker-compose restart orbitdb-manager

# Stop all services
docker-compose down

# Stop and remove volumes (reset state)
docker-compose down -v
```

### Development Commands

```bash
# Rebuild orbitdb-manager after code changes
docker-compose build orbitdb-manager
docker-compose up -d orbitdb-manager

# Access IPFS API directly
curl http://localhost:5001/api/v0/id

# Check OrbitDB health
curl http://localhost:3000/health

# View IPFS web UI
open http://localhost:5001/webui
```

## Network Configuration

### Internal Communication

-   Services communicate via internal Docker network `mimisbrunnr-network`
-   OrbitDB manager connects to IPFS via `http://kubo:5001`
-   No external dependencies required for core functionality

### Port Mapping (Security Hardened)

-   **4001**: IPFS P2P swarm (external peers can connect)
-   **5001**: Security-hardened IPFS API façades (via OpenResty proxy)
-   **3000**: OrbitDB Manager API (health checks, metrics)
-   **3001**: Validation sidecar service (internal AJV validation)

**Security Note**: IPFS gateway ports (8080, 8081) are not exposed. All API access goes through security-hardened façades.

## Environment Variables

### Default Development Settings

**config/docker/.env.example**

```bash
# IPFS Configuration
IPFS_PROFILE=server
IPFS_LOGGING=info
KUBO_DIGEST=sha256:YOUR_PINNED_DIGEST_HERE

# OrbitDB Configuration
ORBITDB_LOG_NAME=xcom-taglist-discovery-dev
ORBITDB_DATA_DIR=/app/data/orbitdb

# Service Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Security Configuration - Tunable Parameters
API_RPM=60                              # Requests per minute per IP
PIN_ADD_MAX_PER_IP_PER_DAY=2000        # Daily pin quota per IP
PIN_ADD_BURST=30                        # Pin request burst capacity
DAG_GET_BURST=60                        # DAG read burst capacity
PUBSUB_PUB_BURST=60                     # Pubsub publish burst
PUBSUB_SUB_BURST=60                     # Pubsub subscribe burst

# Extension Configuration
EXT_ID=chrome-extension://your-extension-id-here

# Operational Configuration
PIN_BATCH_SIZE=5
PIN_GC_INTERVAL=1800000
MAX_PINS_PER_HANDLE=50
IPNS_REPUBLISH_PERIOD=14400             # 4 hours
STORAGE_CLEANUP_INTERVAL=3600000
MAX_LOG_ENTRIES_PINNED=1000

# Development Overrides
IPFS_SWARM_KEY=
```

### Production Overrides

```bash
# Production settings
NODE_ENV=production
LOG_LEVEL=info
ORBITDB_LOG_NAME=xcom-taglist-discovery
PIN_BATCH_SIZE=20
MAX_PINS_PER_HANDLE=200
ENABLE_CORS=false
```

## Volume Management

### Data Persistence

-   **ipfs-data**: IPFS repository data (blocks, keys, config)
-   **orbitdb-data**: OrbitDB database files and indices
-   **logs**: Application logs for debugging

### Backup Strategy

```bash
# Backup IPFS data
docker run --rm -v mimisbrunnr_ipfs-data:/data -v $(pwd):/backup alpine tar czf /backup/ipfs-backup.tar.gz /data

# Backup OrbitDB data
docker run --rm -v mimisbrunnr_orbitdb-data:/data -v $(pwd):/backup alpine tar czf /backup/orbitdb-backup.tar.gz /data

# Restore from backup
docker run --rm -v mimisbrunnr_ipfs-data:/data -v $(pwd):/backup alpine tar xzf /backup/ipfs-backup.tar.gz -C /
```

## Health Monitoring

### Service Health Checks

-   **Kubo**: Uses built-in `ipfs id` command
-   **OrbitDB Manager**: HTTP health endpoint with dependency checks

### Health Check Endpoints

```
GET http://localhost:3000/health          # OrbitDB Manager overall health
GET http://localhost:3000/health/ipfs     # IPFS connection status
GET http://localhost:3000/health/orbitdb  # OrbitDB peer count
GET http://localhost:3001/health          # Validation sidecar health
GET http://localhost:5001/api/v0/version  # IPFS façade health (limited endpoint)
```

**Security Note**: Direct IPFS API access is restricted. Health checks use approved façade endpoints only.

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check if ports 4001, 5001, 8080 are in use
2. **Permission errors**: Ensure Docker has volume write permissions
3. **IPFS API connection**: Verify CORS configuration for browser extension
4. **OrbitDB replication**: Check if discovery log is accessible via pubsub

### Debug Commands

```bash
# Check IPFS peers
curl http://localhost:5001/api/v0/swarm/peers

# Check OrbitDB logs
docker-compose logs orbitdb-manager | grep -i error

# Reset all data
docker-compose down -v && docker-compose up -d
```

This architecture provides a complete local development environment that mirrors the production Kubernetes deployment structure.
