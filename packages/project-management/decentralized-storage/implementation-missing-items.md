# Implementation Missing Items

This document identifies requirements from the technical specification that are missing or insufficiently addressed in the current implementation planning documents.

## Verified Missing Items

### 1. IPNS Republish Configuration (Spec Section 4.6)

**Technical Spec Requirements** (`technical-spec.md:377-380`):
```
### 4.6 IPNS Republish Policy

- Kubo automatically republish interval: ensure `Ipns.RepublishPeriod` default (12h) is acceptable or reduce (e.g., 4h) for fresher resolution.
- If large scale, implement a custom republisher for hot identities.
```

**Implementation Status**: 
- L **Missing**: No specific `Ipns.RepublishPeriod` configuration in perpetual node architecture or helm deployment
- L **Missing**: No implementation details for custom republisher for hot identities

**Impact**: Could affect IPNS resolution performance and freshness of identity updates.

---

### 2. Content Addressing Validation Details (Spec Section 2.5)

**Technical Spec Requirements** (`technical-spec.md:99`):
```
| Content tampering            | CIDs immutable; IPNS only moves if private key used.                                           |
```

**Implementation Status**:
-  **Mentioned**: Content addressing is referenced in planning documents
- L **Missing**: Detailed CID verification procedures and anti-tampering validation logic

**Impact**: Could allow replay attacks with valid but stale content.

---

### 3. Exponential Backoff Retry Logic Specifics (Spec Section 3.9)

**Technical Spec Requirements** (`technical-spec.md:310`):
```
| IPNS resolve timeout       | Retry with backoff (e.g., 500ms’4s, max 5 attempts).                  |
```

**Implementation Status**:
-  **Mentioned**: Retry mechanisms are referenced in extension planning
- L **Missing**: Specific exponential backoff parameters (500ms’4s, max 5 attempts)

**Impact**: Inconsistent retry behavior could affect user experience and network efficiency.

---

### 4. Background Block Backup Tasks (Spec Section 3.10)

**Technical Spec Requirements** (`technical-spec.md:318`):
```
- Background task: periodically `backupBlocks()` after any successful publish/update.
```

**Implementation Status**:
- L **Missing**: No automatic background block backup scheduling in extension planning
- **Note**: Listed as "Optional Enhancement" in spec but not addressed in planning

**Impact**: Data loss risk if browser storage is cleared between sessions.

---

### 5. Pinning Strategy Implementation Details (Spec Section 4.5)

**Technical Spec Requirements** (`technical-spec.md:371-375`):
```
### 4.5 Pinning Strategy

- Periodic scan: traverse log heads and pin all reachable CIDs.
- Maintain a small index (JSON) of pinned Tag List + DID CIDs for monitoring.
- Optional: export list to Prometheus metric (e.g., `taglist_count`).
```

**Implementation Status**:
-  **Basic**: Pinning mentioned in perpetual node architecture
- L **Missing**: Specific details about periodic scanning and traversing log heads
- L **Missing**: JSON index maintenance for monitoring
- L **Missing**: Prometheus metrics export implementation

**Impact**: Could affect monitoring capabilities and operational visibility.

---

### 6. Custom IPNS Republisher for Hot Identities (Spec Section 4.6)

**Technical Spec Requirements** (`technical-spec.md:380`):
```
- If large scale, implement a custom republisher for hot identities.
```

**Implementation Status**:
- L **Missing**: No implementation planning found for custom IPNS republisher
- **Status**: This requirement is completely absent from all implementation documents

**Impact**: Could affect performance for frequently accessed users in a scaled system.

---

### 7. Security Hardening Measures (Spec Section 4.9)

**Technical Spec Requirements** (`technical-spec.md:396-403`):
```
### 4.9 Security Hardening

| Vector              | Mitigation                                                  |
| Resource abuse      | Set Kubernetes resource limits; monitor inbound peers.      |
| IPNS key compromise | Store keystore on encrypted PVC; restrict access.           |
| OrbitDB spam        | Implement basic filtering (max record size, rate limiting). |
```

**Implementation Status**:
-  **Partially**: Network security groups and basic rate limiting planned
- L **Missing**: Specific "monitor inbound peers" implementation
- L **Missing**: Detailed IPNS keystore encryption on PVC implementation
- L **Missing**: Comprehensive OrbitDB spam filtering beyond basic size limits

**Impact**: Could leave security vulnerabilities in production deployment.

---

### 8. Backup and Recovery Procedures (Spec Section 4.8)

**Technical Spec Requirements** (`technical-spec.md:391-394`):
```
### 4.8 Backup (Node)

- Periodic `ipfs repo backup` (or snapshot PVC) daily.
- Store snapshot off-cluster (e.g., S3) encrypted.
```

**Implementation Status**:
- L **Missing**: No specific implementation details for periodic `ipfs repo backup`
- L **Missing**: No off-cluster encrypted storage (S3) backup implementation planning

**Impact**: Data loss risk and limited disaster recovery capabilities.

---

### 9. OrbitDB Compaction Strategy (Spec Section 4.12)

**Technical Spec Requirements** (`technical-spec.md:468`):
```
| OrbitDB growth       | Periodic compaction: new log with only latest per-handle entries.            |
```

**Implementation Status**:
-  **Basic**: "Basic cleanup of very old entries" mentioned in perpetual node architecture
- L **Missing**: Specific compaction strategy with new log creation containing only latest entries per handle

**Impact**: Could affect long-term storage efficiency and query performance.

---

### 10. Multi-Region Deployment Architecture (Spec Section 4.12)

**Technical Spec Requirements** (`technical-spec.md:467`):
```
| Multi-region         | Deploy additional perpetual nodes; publish multiaddrs list in client config. |
```

**Implementation Status**:
-  **Acknowledged**: Listed as "Future Enhancement (Not Currently Planned)" in infrastructure planning
- L **Missing**: No architectural planning for multiaddr list management in client config

**Impact**: Limited to single-region availability, potential performance issues for global users.

---

## Additional Missing Items Discovered

### 11. Synthetic IPNS Latency Monitoring (Spec Section 4.7)

**Technical Spec Requirements** (`technical-spec.md:389`):
```
| IPNS resolve latency       | Synthetic probe (cron)         |
```

**Implementation Status**:
- L **Missing**: No synthetic probe implementation for IPNS resolve latency monitoring

**Impact**: Limited visibility into IPNS resolution performance in production.

---

### 12. Specific Scrypt Salt Implementation (Spec Section 2.4)

**Technical Spec Requirements** (`technical-spec.md:89`):
```
- Salt: constant domain tag (e.g. `"xcom-did-v1"`).
```

**Implementation Status**:
-  **Parameters**: Scrypt parameters (N, r, p) are specified in extension planning
- L **Missing**: Specific salt value and domain tag implementation details

**Impact**: Could affect key derivation consistency and security.

---

## Summary

**Total Missing Items**: 12 (10 original + 2 additional)

**Categories**:
- **Operational/Infrastructure**: 7 items (IPNS republish, backup procedures, monitoring, etc.)
- **Security**: 3 items (hardening measures, keystore encryption, spam filtering)
- **Performance/Scaling**: 2 items (custom republisher, compaction strategy)

**Priority Assessment**:
- **High Priority**: Items 3, 7, 8, 12 (core security and operational concerns)
- **Medium Priority**: Items 1, 5, 9, 11 (operational efficiency and monitoring)
- **Low Priority**: Items 2, 4, 6, 10 (advanced features and optimizations)

**Recommendation**: Address high-priority missing items before implementation begins, particularly security hardening measures and backup procedures. Medium-priority items should be planned for Phase 2 implementation.