# Validator Proxy Security Layer

## Overview

The validator proxy implements a comprehensive security layer with OpenResty (nginx + Lua) facades that protect the IPFS API from abuse while maintaining full Kubo compatibility.

## Architecture

```
Client → OpenResty Proxy → Validation Sidecar → Kubo IPFS
         (Security Facades)   (Schema Validation)
```

## Components

### 1. OpenResty Security Proxy (`config/nginx.conf`)

**Features:**

-   Multi-layer rate limiting (per IP, per endpoint, daily quotas)
-   CID format validation
-   Content size enforcement (1MB limit)
-   Topic allowlisting for pubsub
-   CORS configuration for browser extensions
-   Comprehensive security headers

**Exposed Endpoints:**

-   `POST /api/v0/pin/add` - Pin content with validation
-   `GET /api/v0/dag/get` - Retrieve content with size limits
-   `POST /api/v0/pubsub/pub` - Publish with topic validation
-   `POST /api/v0/pubsub/sub` - Subscribe with connection limits
-   `GET /api/v0/version` - Safe read-only endpoint
-   `GET /api/v0/id` - Safe read-only endpoint

**Blocked Endpoints:**

-   `/api/v0/add` - Upload endpoints (security risk)
-   `/api/v0/block/*` - Block manipulation
-   `/api/v0/object/*` - Object manipulation
-   `/api/v0/files/*` - Files API
-   All other modification endpoints

### 2. Lua Security Facades (`src/lua/`)

All facades follow a lightweight proxy pattern:
1. Check rate limits/quotas (nginx shared memory)
2. Forward to validation-service for validation
3. Forward validated requests to Kubo
4. Return validation-service errors or Kubo responses

#### Pin/Add Facade (`pin_add_facade.lua`)

-   Daily pin quotas per IP (100 pins/day default)
-   Delegates to validation-service for:
    -   CID format validation (CIDv0/CIDv1)
    -   Content prefetch with 1MB size limit
    -   JSON schema validation
-   Force `recursive=false` for security

#### DAG/Get Facade (`dag_get_facade.lua`)

-   CID format validation only
-   No response content validation (content validated on write)
-   Response size limits enforced at nginx level (5MB max)
-   Streaming preserved for performance
-   **Architectural Decision**: Removed response validation to preserve streaming and reduce latency. Content is validated on write (dag/put), so re-validation on read is unnecessary.

#### DAG/Put Facade (`dag_put_facade.lua`)

-   Daily put quotas per IP (100 puts/day default)
-   Delegates to validation-service for:
    -   HTTP method validation
    -   Multipart form data extraction
    -   Size limit enforcement (1MB)
    -   JSON parsing and schema validation

#### Pubsub Facades (`pubsub_*_facade.lua`)

-   Rate limiting: 30 publishes/minute per IP
-   Connection limits: 2 concurrent subscriptions per IP
-   Delegates to validation-service for:
    -   Topic allowlisting: `mimis/(taglist|discovery)/[a-z0-9-]{1,64}`
    -   Message size limits (64KB)
    -   JSON schema validation

#### Routing/Put Facade (`routing_put_facade.lua`)

-   Delegates to validation-service for:
    -   IPNS record validation
    -   Peer ID format validation
    -   Signature verification

### 3. Validation Service (`../validation-service/`)

**HTTP Service (Port 3000):**

Centralized TypeScript validation service that handles all validation logic:

-   `POST /validate` - Generic JSON schema validation
-   `POST /validate/ipns/:peerId` - IPNS record validation with signature verification
-   `POST /validate/dag/put` - DAG put content validation (multipart, size, JSON, schema)
-   `GET /validate/dag/get` - CID format validation
-   `POST /validate/pin/add?validate-content=true` - Pin validation with optional content prefetch
-   `POST /validate/pubsub/pub` - Pubsub publish validation (topic, size, schema)
-   `POST /validate/pubsub/sub` - Pubsub subscribe validation (topic only)
-   `GET /health` - Health check
-   `GET /schemas` - List available schemas

**Supported Schemas:**

-   `data/write/v1` - Data write validation (UserManifest, DidDocument, EncryptedTagCollection)
-   `pubsub/head/v1` - Pubsub message validation

**Features:**

-   HTTP method validation for all endpoints
-   Request body size validation with disk buffering detection
-   Content prefetching from Kubo for pin/add validation
-   Streaming JSON parsing with size limits
-   AJV-based JSON Schema validation
-   IPNS signature verification using libp2p

## Security Features

### Rate Limiting

-   **API Endpoints**: 60 requests/minute per IP
-   **Pin Operations**: 30 requests/minute per IP + 100/day quota
-   **DAG Operations**: 60 requests/minute per IP
-   **Pubsub**: 60 requests/minute per IP

### Content Validation

-   **Size Limits**: 1MB maximum for all content
-   **Format Validation**: JSON-only content acceptance
-   **Schema Validation**: AJV-based JSON Schema validation
-   **CID Validation**: Proper CIDv0/CIDv1 format checking

### Topic Security (Pubsub)

-   **Allowlist Pattern**: `^mimis/(taglist|discovery)/[a-z0-9-]{1,64}$`
-   **Message Limits**: 64KB maximum size
-   **Connection Limits**: 2 concurrent subscriptions per IP

## Configuration

### Environment Variables

```bash
# Security Settings
PIN_QUOTA_DAILY=100                  # Daily pin limit per IP
MAX_CONTENT_SIZE=1048576            # 1MB content limit
MAX_JSON_SIZE=65536                 # 64KB JSON message limit
VALIDATOR_TIMEOUT=3000              # Validator timeout (ms)
KUBO_TIMEOUT=10000                  # Kubo timeout (ms)

# Service Ports
PROXY_PORT=5001                     # OpenResty proxy port
VALIDATOR_PORT=3000                 # Validation sidecar port
KUBO_PORT=5001                      # Internal Kubo port
```

### Rate Limiting Tuning

Edit `nginx.conf` to adjust rate limiting:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=pin_limit:10m rate=30r/m;
```

## Deployment

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Check service health
curl http://localhost:5001/health
curl http://localhost:3000/health

# View logs
docker-compose logs -f proxy
docker-compose logs -f validator
```

### Manual Testing

```bash
# Test pin facade (will fail without actual content)
curl -X POST http://localhost:5001/api/v0/pin/add?arg=QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o

# Test validation sidecar
curl -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d '{"schema":"data/write/v1","json":{"version":1,"handle":"@test","updated":1234567890,"tags":["test"]}}'

# Test rate limiting
for i in {1..100}; do curl -s http://localhost:5001/api/v0/version & done
```

## Security Test Suite

Run comprehensive security tests:

```bash
# Run all security tests
npm run test:security

# Run specific test categories
npm run test test/security/facade-tests.spec.ts
```

### Test Coverage

-   ✅ Health endpoint validation
-   ✅ Schema validation accuracy
-   ✅ API endpoint blocking
-   ✅ Rate limiting enforcement
-   ✅ CID format validation
-   ✅ Content size limits
-   ✅ Topic allowlisting
-   ✅ CORS headers
-   ✅ Error handling
-   ✅ Performance benchmarks

## Monitoring

### Health Checks

-   `GET /health` - Basic proxy status
-   `GET /health-detailed` - Full system status
-   `GET /nginx-status` - Nginx statistics

### Metrics (Logged)

-   Pin attempts and success rates
-   Content size violations
-   Rate limit violations
-   Schema validation failures
-   Response times

### Log Analysis

```bash
# Monitor security events
docker-compose logs proxy | grep -E "(403|413|415|429)"

# Monitor validation performance
docker-compose logs validator | grep "validationTime"

# Monitor rate limiting
docker-compose logs proxy | grep "rate_limit"
```

## Troubleshooting

### Common Issues

1. **Rate Limited (429)**

    - Check IP-based rate limits
    - Verify daily pin quotas
    - Review Lua rate limiting logic

2. **Content Too Large (413)**

    - Ensure content < 1MB
    - Check JSON message size < 64KB
    - Verify streaming limits

3. **Schema Validation Failed (415)**

    - Check JSON structure against schema
    - Verify required fields present
    - Test against `/validate` endpoint

4. **Topic Not Allowed (403)**
    - Verify topic matches: `mimis/(taglist|discovery)/[a-z0-9-]{1,64}`
    - Check topic length limits

### Debug Mode

Enable debug logging in `nginx.conf`:

```nginx
error_log /var/log/nginx/error.log debug;
```

## Security Considerations

### Defense in Depth

-   **Proxy Layer**: Request filtering and rate limiting
-   **Validation Layer**: Schema and format validation
-   **Container Security**: Read-only filesystems, non-root users
-   **Network Security**: Internal service communication only

### Attack Mitigation

-   **DoS Protection**: Multi-tier rate limiting
-   **Content Abuse**: Size limits and validation
-   **API Abuse**: Endpoint blocking and monitoring
-   **Resource Exhaustion**: Memory limits and quotas

### Monitoring Recommendations

-   Set up alerts for high error rates (413, 429, 502)
-   Monitor validation response times
-   Track pin quota usage patterns
-   Log and analyze blocked requests

## Performance

### Benchmarks

-   **Validation**: < 100ms per request
-   **Pin Facade**: < 500ms end-to-end
-   **Rate Limiting**: < 10ms overhead
-   **Memory Usage**: < 100MB per service

### Scaling

-   Horizontal scaling via multiple proxy instances
-   Shared rate limiting with Redis (future enhancement)
-   Load balancer integration ready
