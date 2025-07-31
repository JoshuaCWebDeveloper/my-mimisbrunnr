# Decentralized Taglist Identity Specification

## 1. Overview

This document specifies the requirements, design decisions, and implementation guidelines for a decentralized system that links an X.com handle to a publicly readable, mutable tag list without a traditional centralized backend. It defines the problem scope, the roles of on-chain/off-chain style primitives (IPFS, IPNS, OrbitDB, DIDs), and the expectations around security, integrity, and client-only operation.

It serves as a reference for engineers implementing (a) the browser extension client and (b) the perpetual infrastructure node. All normative technical details live in later sections; this overview states only purpose and scope, not protocol minutiae.

## 2. Technical Architecture

### 2.1 Components

| Component                   | Role                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| Browser Extension (Client)  | Generates keys, publishes content, queries discovery log, verifies proofs. |
| Perpetual IPFS/OrbitDB Node | Persistent pinning, DHT availability, pubsub replication anchor.           |
| IPFS Network                | Immutable content addressing for tag lists & DID docs.                     |
| IPNS                        | Mutable pointer to latest DID Document for a user.                         |
| OrbitDB (Log Store)         | Append-only discovery records binding `lookupKey` → `ipnsKey`/`did`.       |
| DID Document                | W3C DID Core JSON; holds public key & service endpoints (tag list).        |
| X.com (Twitter)             | External identity proof (tweet or profile text).                           |
| IndexedDB (Client)          | Local persistence of IPFS blocks across sessions.                          |

### 2.2 Data Structures

**Tag List (taglist.json)**

```json
{
    "version": 1,
    "handle": "@alice",
    "updated": 1737152100000,
    "tags": ["defi", "ux", "ai"]
}
```

**DID Document (simplified)**

```json
{
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:key:z6Mk...",
    "verificationMethod": [
        {
            "id": "did:key:z6Mk#key-1",
            "type": "Ed25519VerificationKey2018",
            "controller": "did:key:z6Mk...",
            "publicKeyMultibase": "z..."
        }
    ],
    "assertionMethod": ["did:key:z6Mk#key-1"],
    "service": [
        {
            "id": "#taglist",
            "type": "TagList",
            "serviceEndpoint": "ipfs://<TAGLIST_CID>"
        },
        {
            "id": "#x-proof",
            "type": "XHandleProof",
            "serviceEndpoint": "https://x.com/alice/status/1234567890123456789"
        }
    ]
}
```

**Discovery Log Entry (OrbitDB log)**

```json
{
    "lookupKey": "sha256(@alice)",
    "handle": "@alice",
    "ipnsKey": "k51qzi5uqu5d...", // IPNS name (peer ID style)
    "did": "did:key:z6Mk...",
    "timestamp": 1737152100000,
    "sig": "<optional entry-level signature>"
}
```

### 2.3 Lookup Key

`lookupKey = SHA-256(lowercase(handle))` — stable, opaque index key; avoids raw handle collisions and simplifies filtering.

### 2.4 Deterministic Key Derivation

Use `scrypt` with fixed parameters to derive a 32-byte seed → Ed25519 keypair. Parameters (balanced for UX & security in browser):

-   `N = 2^15` (32768), `r = 8`, `p = 1`, output = 32 bytes.
-   Salt: constant domain tag (e.g. `"xcom-did-v1"`).
-   Passphrase minimum length enforced (≥16 chars). User chooses strong phrase.

### 2.5 Security & Threat Mitigation

| Threat                       | Mitigation                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Handle hijack (fake mapping) | Must control IPNS key + tweet proof referencing DID; others can’t sign IPNS record.            |
| Malicious OrbitDB writes     | Clients validate latest timestamp per handle; discard stale / conflicting older entries.       |
| Replay of old DID doc        | IPNS republish always points to most recent DID doc; clients compare embedded `updated` times. |
| Content tampering            | CIDs immutable; IPNS only moves if private key used.                                           |
| Stale discovery              | OrbitDB pubsub replication keeps log current; fallback to DHT retrieval via persistent node.   |
| Local session loss           | IndexedDB backup of blocks rehydrates cache.                                                   |

### 2.6 Consistency Model

-   OrbitDB log is multi-head tolerant; pubsub ensures head dissemination.
-   Last-Write-Wins (LWW) semantics on `timestamp` per handle (client chooses max). Optionally enforce monotonicity (reject if `timestamp <= known`).

### 2.7 Trust Boundaries

| Boundary      | Trust Assumption                                                                 |
| ------------- | -------------------------------------------------------------------------------- |
| DID Document  | Trusted if its public key matches IPNS publisher key & proof URL matches handle. |
| OrbitDB Entry | Advisory; must be verified by resolving IPNS + DID proof.                        |
| Tweet Proof   | External anchor—user controls handle.                                            |
| Passphrase    | Sole factor for identity; loss implies regenerated new identity.                 |

### 2.8 Persistence Strategy

-   IPFS Blocks cached in IndexedDB (block key = CID string) for cold-start acceleration.
-   Optional pruning: retain only blocks reachable from currently referenced CIDs (taglist + DID + OrbitDB heads).

### 2.9 Performance Considerations

| Area           | Optimization                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------- |
| Initial load   | Parallel: connect swarm, open OrbitDB, start block restore.                                   |
| Tag list fetch | Cache last valid CID per handle in memory + IndexedDB.                                        |
| DID resolution | Short-circuit if cached DID doc `updated` >= referenced timestamp.                            |
| IPNS latency   | Rely on pinned / republished IPNS on perpetual node; client retries with exponential backoff. |

---

## 3. Client Implementation

### 3.1 Dependencies (Example Libraries)

| Purpose                      | Library                                         |
| ---------------------------- | ----------------------------------------------- |
| IPFS in browser              | `ipfs-core`                                     |
| OrbitDB                      | `orbit-db`                                      |
| Crypto (Ed25519)             | `tweetnacl`                                     |
| Hashing                      | `@noble/hashes` or built-in Web Crypto SHA-256  |
| KDF (scrypt)                 | Node `crypto` (bundled) or `scrypt-js` fallback |
| IndexedDB wrapper (optional) | Native IndexedDB APIs                           |

### 3.2 Initialization Flow

```js
// 1. Create in-memory IPFS instance
const ipfs = await create({ repo: 'in-memory-' + Date.now() });

// 2. Connect to perpetual node (improves DHT + pubsub reachability)
await ipfs.swarm.connect(PERSISTENT_MULTIADDR);

// 3. Restore cached blocks (non-blocking, but earlier is better)
await restoreBlocks(ipfs);

// 4. Create OrbitDB instance & open discovery log
const orbitdb = await OrbitDB.createInstance(ipfs);
const db = await orbitdb.log('xcom-taglist-discovery', {
    accessController: { write: ['*'] },
});
await db.load(); // triggers replication via pubsub
```

### 3.3 Key Derivation & DID Generation

```js
import nacl from 'tweetnacl';
import { scryptSync } from 'crypto';

function deriveIdentity(passphrase) {
    if (passphrase.length < 16)
        throw new Error('Passphrase ≥16 chars required');
    const seed = scryptSync(passphrase, 'xcom-did-v1', 1 << 15, 8, 1, 32);
    const kp = nacl.sign.keyPair.fromSeed(seed);
    const did = didKeyFromPublic(kp.publicKey); // implement multicodec → did:key
    return { did, publicKey: kp.publicKey, secretKey: kp.secretKey };
}
```

### 3.4 Publishing (First-Time)

```js
async function publishTagList({ passphrase, handle, userId, tags, proofUrl }) {
    const { publicKey, secretKey, did } = deriveIdentity(passphrase);

    const taglist = { version: 1, handle, updated: Date.now(), tags };
    const { cid: tagCid } = await ipfs.add(JSON.stringify(taglist));

    const didDoc = buildDidDoc({ did, publicKey, tagCid, proofUrl });
    const { cid: didCid } = await ipfs.add(JSON.stringify(didDoc));

    // Publish DID doc via IPNS (key 'self' automatically tied to peer ID or imported key)
    const ipns = await ipfs.name.publish(`/ipfs/${didCid}`);

    const lookupKey = sha256(handle.toLowerCase());
    await db.add({
        lookupKey,
        handle,
        ipnsKey: ipns.name,
        did,
        timestamp: Date.now(),
    });

    return {
        tagCid: tagCid.toString(),
        didCid: didCid.toString(),
        ipns: ipns.name,
    };
}
```

### 3.5 Updating Tag List

```js
async function updateTagList({ passphrase, handle, newTags, currentDidCid }) {
    const { publicKey, did } = deriveIdentity(passphrase);
    const taglist = { version: 1, handle, updated: Date.now(), tags: newTags };
    const { cid: newTagCid } = await ipfs.add(JSON.stringify(taglist));

    const didDoc = await fetchJsonFromCid(currentDidCid);
    // Replace TagList service endpoint
    didDoc.service = didDoc.service.map(s =>
        s.type === 'TagList'
            ? { ...s, serviceEndpoint: `ipfs://${newTagCid}` }
            : s
    );
    const { cid: newDidCid } = await ipfs.add(JSON.stringify(didDoc));

    await ipfs.name.publish(`/ipfs/${newDidCid}`); // same IPNS key
}
```

### 3.6 Discovery by Handle

```js
async function discover(handle) {
    const lookupKey = sha256(handle.toLowerCase());
    const entries = db
        .iterator({ limit: -1 })
        .collect()
        .map(e => e.payload.value)
        .filter(v => v.lookupKey === lookupKey)
        .sort((a, b) => b.timestamp - a.timestamp);
    if (!entries.length) return null;
    const record = entries[0];
    const resolved = await ipfs.name.resolve(record.ipnsKey); // /ipfs/<didCid>
    const didCid = resolved.replace('/ipfs/', '');
    const didDoc = await fetchJsonFromCid(didCid);
    validateDidDoc(didDoc, record, handle);
    const tagSvc = didDoc.service.find(s => s.type === 'TagList');
    const tagCid = tagSvc.serviceEndpoint.replace('ipfs://', '');
    const tagList = await fetchJsonFromCid(tagCid);
    return { didDoc, tagList, record };
}
```

### 3.7 Validation Logic

-   **Record vs DID**: `record.did === didDoc.id`
-   **Public Key Match**: DID public key derived to same multicodec fingerprint used in IPNS publisher (optional advanced check by mapping peer ID ↔ key if importing key into IPFS keystore).
-   **Proof URL** reachable + contains handle reference (client fetch or user manual verification).
-   **Timestamp Monotonicity**: Reject record if `record.timestamp < cachedTimestamp(handle)`.

### 3.8 IndexedDB Backup & Restore

```js
// Open (create object store on first run)
function openBlockDB() {
    return new Promise(resolve => {
        const req = indexedDB.open('ipfs-blocks', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blocks');
        req.onsuccess = () => resolve(req.result);
    });
}

async function backupBlocks(ipfs) {
    const db = await openBlockDB();
    const tx = db.transaction('blocks', 'readwrite');
    const store = tx.objectStore('blocks');
    for await (const entry of ipfs.block.store.query({})) {
        const blk = await ipfs.block.get(entry.cid);
        store.put(blk.bytes, entry.cid.toString());
    }
}

async function restoreBlocks(ipfs) {
    const db = await openBlockDB();
    const tx = db.transaction('blocks');
    const store = tx.objectStore('blocks');
    return new Promise(resolve => {
        const req = store.openCursor();
        req.onsuccess = async e => {
            const cur = e.target.result;
            if (!cur) return resolve();
            const cidStr = cur.key;
            const bytes = cur.value;
            await ipfs.block.put(bytes, { cid: cidStr });
            cur.continue();
        };
    });
}
```

### 3.9 Error Handling & Retries

| Operation                  | Strategy                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| IPNS resolve timeout       | Retry with backoff (e.g., 500ms→4s, max 5 attempts).                  |
| OrbitDB not yet replicated | Wait for `replicated` / `replicate.progress` events before discovery. |
| Missing DID service        | Fallback: treat record stale; log & notify user.                      |
| Invalid proof              | Mark handle as _unverified_; allow soft usage with warning.           |

### 3.10 Optional Enhancements

-   Cache resolved taglists keyed by handle and `taglist.updated` timestamp.
-   Background task: periodically `backupBlocks()` after any successful publish/update.
-   UI trust badges: Verified if tweet proof passes regex `@handle` + DID fragment.

---

## 4. Node Implementation

### 4.1 Goals of Perpetual Node

| Goal              | Function                                                              |
| ----------------- | --------------------------------------------------------------------- |
| High availability | Stay online to aid DHT & content serving                              |
| Pubsub hub        | Relay OrbitDB replication messages to browsers                        |
| Pinning           | Pin tag lists, DID docs, OrbitDB log heads & entries                  |
| IPNS publishing   | (Optional) Assist with faster IPNS propagation via republish interval |

### 4.2 Deployment Environment

-   **Container**: Docker image based on `ipfs/kubo` (go-ipfs / Kubo)
-   **Orchestration**: Kubernetes pod with persistent volume for `~/.ipfs` (PVC)
-   **Resources**: 1 vCPU, 1–2 GB RAM baseline; scale as content grows.

### 4.3 Kubo Configuration (Excerpt)

`config.Addresses.Swarm`:

```json
[
    "/ip4/0.0.0.0/tcp/4001",
    "/ip4/0.0.0.0/udp/4001/quic",
    "/ip4/0.0.0.0/tcp/8081/ws"
]
```

`API`: `/ip4/0.0.0.0/tcp/5001` (internal Service)
`Gateway`: `/ip4/0.0.0.0/tcp/8080`

**CORS** (if exposing API to controlled origins only):

```bash
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["https://your-extension-id","https://app.example"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT"]'
```

### 4.4 OrbitDB Node Setup

Because OrbitDB requires a JS runtime, deploy a **companion OrbitDB process** (Node.js container) alongside Kubo:

1. Sidecar container runs Node.js.
2. Connects to Kubo via `libp2p` (WS or local API multiaddr) using `ipfs-http-client` or embedded `js-ipfs` with remote peer dialing.
3. Opens/creates the `xcom-taglist-discovery` log.
4. Pins new log entry blocks as they arrive (subscribe to `replicated` events).

### 4.5 Pinning Strategy

-   Periodic scan: traverse log heads and pin all reachable CIDs.
-   Maintain a small index (JSON) of pinned Tag List + DID CIDs for monitoring.
-   Optional: export list to Prometheus metric (e.g., `taglist_count`).

### 4.6 IPNS Republish Policy

-   Kubo automatically republish interval: ensure `Ipns.RepublishPeriod` default (12h) is acceptable or reduce (e.g., 4h) for fresher resolution.
-   If large scale, implement a custom republisher for hot identities.

### 4.7 Monitoring & Observability

| Metric                     | Source                         |
| -------------------------- | ------------------------------ |
| Pin count                  | `ipfs pin ls --type=recursive` |
| Blockstore size            | `ipfs repo stat`               |
| OrbitDB replication events | Companion process logs         |
| IPNS resolve latency       | Synthetic probe (cron)         |

### 4.8 Backup (Node)

-   Periodic `ipfs repo backup` (or snapshot PVC) daily.
-   Store snapshot off-cluster (e.g., S3) encrypted.

### 4.9 Security Hardening

| Vector              | Mitigation                                                  |
| ------------------- | ----------------------------------------------------------- |
| API exposure        | Restrict API to internal network; do not expose publicly.   |
| Resource abuse      | Set Kubernetes resource limits; monitor inbound peers.      |
| IPNS key compromise | Store keystore on encrypted PVC; restrict access.           |
| OrbitDB spam        | Implement basic filtering (max record size, rate limiting). |

### 4.10 Kubernetes Sketch

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: ipfs-perpetual }
spec:
    replicas: 1
    selector: { matchLabels: { app: ipfs-perpetual } }
    template:
        metadata: { labels: { app: ipfs-perpetual } }
        spec:
            containers:
                - name: kubo
                  image: ipfs/kubo:latest
                  ports:
                      - { containerPort: 4001 }
                      - { containerPort: 8080 }
                      - { containerPort: 8081 }
                      - { containerPort: 5001 }
                  volumeMounts:
                      - { name: ipfs-data, mountPath: /data/ipfs }
                - name: orbitdb-sidecar
                  image: node:20-alpine
                  command: ['node', '/app/orbitdb-runner.js']
                  env:
                      - name: IPFS_API
                        value: http://127.0.0.1:5001
            volumes:
                - name: ipfs-data
                  persistentVolumeClaim: { claimName: ipfs-data-pvc }
```

### 4.11 Sidecar OrbitDB Runner (Conceptual)

```js
import { create } from 'ipfs-http-client';
import OrbitDB from 'orbit-db';

const ipfs = create({ url: process.env.IPFS_API });
const orbitdb = await OrbitDB.createInstance(ipfs);
const db = await orbitdb.log('xcom-taglist-discovery');

await db.load();

db.events.on('replicated', async () => {
    // Pin newly seen entry blocks
    for (const e of db.iterator({ limit: 10 }).collect()) {
        const cid = e.hash; // log entry CID
        try {
            await ipfs.pin.add(cid);
        } catch {}
    }
});
```

### 4.12 Scaling Considerations

| Dimension            | Strategy                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| High write frequency | Snapshot & prune old discovery entries (retain last per handle).             |
| Large tag lists      | Enforce max size (e.g., 1MB) in client pre-publish validation.               |
| Multi-region         | Deploy additional perpetual nodes; publish multiaddrs list in client config. |
| OrbitDB growth       | Periodic compaction: new log with only latest per-handle entries.            |

---

**End of Specification**
