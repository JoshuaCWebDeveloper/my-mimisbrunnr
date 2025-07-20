# Docker Compose Architecture

## Overview

The docker-compose.yml file orchestrates the local development environment for the decentralized storage system. It coordinates the official Kubo IPFS node with our custom OrbitDB management service.

## File Location

```
# Root of monorepo
docker-compose.yml
```

## Service Composition

### Complete docker-compose.yml

```yaml
version: '3.8'

services:
  kubo:
    image: ipfs/kubo:latest
    container_name: ipfs-node
    ports:
      - "4001:4001"     # P2P swarm port
      - "8080:8080"     # HTTP gateway
      - "8081:8081"     # WebSocket gateway  
      - "5001:5001"     # HTTP API
    volumes:
      - ipfs-data:/data/ipfs
      - ./packages/perpetual-node/config/kubo:/container-init.d
    environment:
      - IPFS_PROFILE=server
      - IPFS_LOGGING=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "ipfs", "id"]
      interval: 30s
      timeout: 10s
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
      - IPFS_GATEWAY_URL=http://kubo:8080
      - ORBITDB_LOG_NAME=xcom-taglist-discovery
      - ORBITDB_DATA_DIR=/app/data/orbitdb
      - PORT=3000
      - LOG_LEVEL=debug
      - PIN_BATCH_SIZE=10
      - PIN_GC_INTERVAL=3600000
    volumes:
      - orbitdb-data:/app/data
      - ./logs/orbitdb:/app/logs
    ports:
      - "3000:3000"     # Health check and API endpoints
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
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
└── kubo/
    ├── 001-configure-cors.sh      # CORS setup script
    ├── 002-configure-gateway.sh   # Gateway configuration
    └── ipfs-config.json           # Custom IPFS configuration

# Root level
config/docker/
└── .env.example                   # Environment variable template

logs/
├── ipfs/                          # IPFS logs (if needed)
└── orbitdb/                       # OrbitDB service logs
```

### Kubo Configuration Scripts

**packages/perpetual-node/config/kubo/001-configure-cors.sh**
```bash
#!/bin/bash
# Configure CORS for browser extension access

ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET", "POST", "PUT"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization", "Content-Type"]'

ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Methods '["GET"]'
```

**packages/perpetual-node/config/kubo/002-configure-gateway.sh**
```bash
#!/bin/bash
# Configure gateway settings

ipfs config --json Gateway.PublicGateways '{
  "localhost": {
    "Paths": ["/ipfs", "/ipns"],
    "UseSubdomains": false
  }
}'

# Enable experimental features if needed
ipfs config --json Experimental.P2pHttpProxy true
```

**packages/perpetual-node/config/kubo/ipfs-config.json**
```json
{
  "Addresses": {
    "Swarm": [
      "/ip4/0.0.0.0/tcp/4001",
      "/ip4/0.0.0.0/udp/4001/quic-v1",
      "/ip4/0.0.0.0/tcp/8081/ws"
    ],
    "API": "/ip4/0.0.0.0/tcp/5001",
    "Gateway": "/ip4/0.0.0.0/tcp/8080"
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
- Services communicate via internal Docker network `mimisbrunnr-network`
- OrbitDB manager connects to IPFS via `http://kubo:5001`
- No external dependencies required for core functionality

### Port Mapping
- **4001**: IPFS P2P swarm (external peers can connect)
- **5001**: IPFS HTTP API (development access)
- **8080**: IPFS HTTP Gateway (content retrieval)
- **8081**: IPFS WebSocket (browser connections)
- **3000**: OrbitDB Manager API (health checks, metrics)

## Environment Variables

### Default Development Settings

**config/docker/.env.example**
```bash
# IPFS Configuration
IPFS_PROFILE=server
IPFS_LOGGING=info

# OrbitDB Configuration  
ORBITDB_LOG_NAME=xcom-taglist-discovery-dev
ORBITDB_DATA_DIR=/app/data/orbitdb

# Service Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Pinning Configuration
PIN_BATCH_SIZE=5
PIN_GC_INTERVAL=1800000
MAX_PINS_PER_HANDLE=50

# Development Overrides
ENABLE_CORS=true
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
- **ipfs-data**: IPFS repository data (blocks, keys, config)
- **orbitdb-data**: OrbitDB database files and indices
- **logs**: Application logs for debugging

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
- **Kubo**: Uses built-in `ipfs id` command
- **OrbitDB Manager**: HTTP health endpoint with dependency checks

### Health Check Endpoints
```
GET http://localhost:3000/health          # Overall health
GET http://localhost:3000/health/ipfs     # IPFS connection status  
GET http://localhost:3000/health/orbitdb  # OrbitDB peer count
GET http://localhost:5001/api/v0/id       # IPFS node ID
```

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