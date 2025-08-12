# Decentralized Storage – Mitigation Spec

**Status:** Draft

**Owner:** @JoshuaCWebDeveloper / @infra

**Last updated:** 2025‑08‑09

---

## 1) Problem Statement

Our node intentionally exposes a public IPFS API for the browser extension. **The IPFS gateway is disabled**. The current surface includes `/api/v0/pin/add` which allows arbitrary remote CIDs to be fetched and persisted. Attackers can:

-   Force large, unbounded data transfer and storage (disk/bandwidth exhaustion).
-   Use our node as a free CDN/gateway, degrading availability for legitimate users.

The existing 1 MB upload cap + “text-only” heuristics only apply to client uploads (e.g., `/add`), **not** to remote pinning.

**Goal:** Keep the node public and frictionless for the extension, while preventing remote‑CID abuse and bounding resource consumption.

**Non‑Goals:**

-   No end‑user accounts or OAuth.
-   No private API; the extension must remain able to publish/resolve without login.

---

## 2) High‑Level Approach

Introduce a **Kubo‑compatible façade** on `/api/v0/pin/add` that:

1. **Prefetches only the minimal root data** needed to verify size and shape (JSON schema) **before** any full DAG fetch.
2. **Enforces a hard byte ceiling** (≤ 1 MB) for what can be remotely pinned.
3. **Allows only allowed codecs/shapes** (DAG‑JSON / DAG‑CBOR representing our app documents). No UnixFS/dag‑pb/raw for the public remote‑pin path.
4. **Pins** via Kubo **only after** the preflight passes.

The IPFS Gateway is **disabled**; only API endpoints are exposed.

---

## 3) Assumptions & Constraints

-   Our product publishes small JSON DAGs (TagList, DID doc, etc.). Remote pinning of large UnixFS blobs is **not** required for MVP.
-   We run Kubo API on `5001` behind nginx; the IPFS Gateway listener is **removed** (`Addresses.Gateway=""`).
-   The **browser extension runs OrbitDB** and relies on **IPFS PubSub** for live replication; we will expose **guarded pubsub façades** compatible with Kubo.
-   We can add nginx+Lua (OpenResty) logic and a small helper in the orbitdb‑manager if needed.

---

## 4) API Design (Public)

### 4.1 Endpoint (Kubo-compatible façade)

`/api/v0/pin/add`

We keep the path and base semantics identical to Kubo. Clients send `arg=<cid>` via querystring or form body. We accept a subset of flags and pass through the rest.

**Accepted params**

-   `arg` (repeatable): CIDv1 string. MVP supports one `arg`; extra args are rejected with 400.
-   `recursive` (bool): **ignored** by the façade; we enforce `recursive=false` to guarantee a single‑block pin and avoid fetching linked blocks.
-   `timeout` (duration): passed through.

**Responses (Kubo-like)**

-   `200 OK` → `{"Pins":["<cid>"]}`
-   `400 Bad Request` → malformed `arg` / multiple args not supported
-   `413 Payload Too Large` → root block > 1 MB
-   `415 Unsupported Media Type` → root not DAG-JSON/DAG-CBOR or JSON schema fails
-   `429 Too Many Requests` → per-IP/identity quota
-   `507 Insufficient Storage` → repo cap reached

---

## 5) Flow

1. Client calls `/api/v0/pin/add?arg=<cid>` (GET or POST). Any `recursive` param is ignored by the façade.
2. nginx+Lua **intercepts** this location instead of proxying directly to Kubo:

    - validate `cid` format and only one `arg`
    - prefetch **root** via `/api/v0/dag/get?arg=<cid>` with stream cap **1 MB**
    - attempt JSON decode; if ok, **POST** to the **validator sidecar** (`/validate`) with `{ schema: "taglist/v1", json: <object> }`

3. If checks pass, forward to local Kubo: `POST /api/v0/pin/add?arg=<cid>&recursive=false` to pin only the root block.
4. Relay Kubo response; normalize to `{"Pins":["<cid>"]}` on success.

> Note: This root‑only read fetches **one block** (the root). It avoids fetching the entire DAG and thus prevents over‑the‑network transfer beyond our 1 MB cap.

### 5.1 DAG‑CBOR Handling

-   **Allowed:** DAG‑CBOR roots (CIDv1) are accepted alongside DAG‑JSON.
-   **Validation:** We call `dag/get` and consume the JSON representation of the root for schema validation (no child traversal).
-   **Single‑block requirement:** The façade enforces `recursive=false`, and schemas must represent **single‑block documents**. Documents **must not** require linked child blocks to be meaningful. Any CID fields are treated as references only and **are not followed** on the public pin path.
-   **Inline bytes:** If a document carries binary, it must embed it inline (as bytes/strings in the root) and remain under **1 MB** total root size. External UnixFS/raw/dag-pb links are **not permitted** via `/api/v0/pin/add`.

---

## 6) API Hardening (Gateway disabled)

-   **Gateway:** Listener **removed** by setting `Addresses.Gateway` to an empty string. No public `/ipfs/*` or `/ipns/*` routes.
-   **API CORS:** `Access-Control-Allow-Origin: chrome-extension://<EXT_ID>` (and dev origins). No `*`.
-   **Repo caps & GC:** set `Datastore.StorageMax` (e.g., 10–20 GiB) and `GCPeriod` to prevent growth without bound.
-   **Disable** Kubo `Experimental.P2pHttpProxy` (set to `false`).
-   **Pin surface:** intercept public `/api/v0/pin/add` with the façade; do **not** expose raw Kubo `/api/v0/pin/add` externally (other API paths may proxy as‑is).
-   **No auto-pin from pubsub/discovery:** the node never persists content based on pubsub/discovery traffic; pinning occurs only via the `/api/v0/pin/add` façade after validation.

### 6.1 Operational tunables (env)

-   `API_RPM` → default **60** req/min per IP (applies to allow‑listed API paths via `limit_req_zone`).
-   `PIN_ADD_MAX_PER_IP_PER_DAY` → default **2000** successful attempts/IP/day (Lua quota in façade).
-   `PIN_ADD_BURST` → default **30**.
-   `DAG_GET_BURST` → default **60**.
-   `PUBSUB_PUB_BURST` → default **60**.
-   `PUBSUB_SUB_BURST` → default **60**.

> The provided nginx snippet in §7 uses these tuned defaults. You can raise/lower them by templating the config or rebuilding with different constants.

### 6.2 API surface (allow‑list)

Public API endpoints:

-   `POST /api/v0/pin/add` (façade – validated single‑block pin)
-   `POST /api/v0/dag/get` (façade — read‑only root ≤ 1 MB, DAG‑JSON/CBOR only, **AJV‑validated**)
-   `POST /api/v0/pubsub/pub` (façade – topic allow‑list, JSON shape, ≤64 KB messages)
-   `POST /api/v0/pubsub/sub` (façade – topic allow‑list, streaming with subscription/idle caps)

Everything else is **blocked** externally:

-   Deny: `/api/v0/add`, `/api/v0/block/*`, `/api/v0/object/*`, `/api/v0/files/*`, `/api/v0/dag/export`, `/api/v0/dag/import`.
-   If the extension later needs authoring, use the `/api/v0/dag/put`\*\* façade\*\* below (schema + 1 MB cap) instead of `/add`.

### 6.2 Pubsub façade (OrbitDB live replication)

**Purpose:** Support OrbitDB in the extension without exposing raw, abuse‑friendly pubsub.

**Topics:** allow‑list with regex (example): `^mimis/(taglist|discovery)/[a-z0-9\-]{1,64}$` (configure in env).

**Limits:**

-   **Message size:** ≤ 64 KB; **JSON only** for our topics; reject otherwise (415).
-   **Rate limits:** per‑IP publish/subscribe actions (e.g., 10 r/min) and per‑topic caps.
-   **Subscriptions:** max 2 concurrent subs/IP; **idle timeout** 2 minutes without messages (heartbeat every 30s).
-   **CORS:** extension origin only.

**Compatibility:** We keep Kubo path/params (`/api/v0/pubsub/pub?arg=<topic>&arg=<data>`, `/api/v0/pubsub/sub?arg=<topic>`), but intercept to enforce rules, then proxy to Kubo.

---

## 7) Nginx + Lua (OpenResty) Implementation Nginx + Lua (OpenResty) Implementation

> Drop into the existing proxy container. Keeps the public path `/api/v0/pin/add` but enforces size/shape before delegating to Kubo.

```nginx
# nginx.conf excerpts (http{} scope)
limit_req_zone $binary_remote_addr zone=api_rpm:10m rate=60r/m;  # default 60 req/min per IP (tunable)
lua_shared_dict pin_quota 10m;   # per-IP attempt counters/TTL

server {
  listen 80;

  # Global body ceiling for all POSTs (defense-in-depth)
  client_max_body_size 1m;

  # CORS for API (extension origin only)
  location ^~ /api/ {
    if ($request_method = OPTIONS) {
      add_header Access-Control-Allow-Origin "chrome-extension://__EXT_ID__";
      add_header Access-Control-Allow-Methods "POST, GET, OPTIONS";
      add_header Access-Control-Allow-Headers "content-type";
      add_header Access-Control-Max-Age 600;
      return 204;
    }
    add_header Access-Control-Allow-Origin "chrome-extension://__EXT_ID__";

    # Intercept Kubo-compatible pin/add
    location = /api/v0/pin/add {
      limit_req zone=api_rpm burst=30 nodelay;   # tuned burst for short publish spikes
      content_by_lua_block {
        local http  = require("resty.http")
        local cjson = require("cjson.safe")
        local MAX = 1048576 -- 1 MB

        ngx.req.read_body()
        local uri_args = ngx.req.get_uri_args()
        local post_args = ngx.req.get_post_args()
        local arg = uri_args.arg or post_args.arg
        if type(arg) == "table" then
          return ngx.status=400, ngx.say('{"Message":"only one arg supported"}')
        end
        local cid = type(arg) == 'string' and arg or nil
        if not cid or #cid > 100 or not string.match(cid, "^b[a-z0-9]+$") then
          return ngx.status=400, ngx.say('{"Message":"invalid cid"}')
        end
        -- Force non-recursive pin to ensure single-block
        local recursive = "false"

        -- Simple per-IP quota
        local dict = ngx.shared.pin_quota
        local key = ngx.var.binary_remote_addr .. ":day"
        local MAX_PER_DAY = tonumber(os.getenv("PIN_ADD_MAX_PER_IP_PER_DAY") or "2000")
        local n = dict:incr(key, 1, 0, 86400)
        if n and n > MAX_PER_DAY then
          return ngx.status=429, ngx.say('{"Message":"rate limited"}')
        end

        -- Prefetch only the root block
        local httpc = http.new()
        httpc:set_timeout(5000)
        local ok, err = httpc:connect("127.0.0.1", 5001)
        if not ok then
          return ngx.status=502, ngx.say('{"Message":"kubo unreachable"}')
        end
        local res, err = httpc:request({
          method = "POST",
          path   = "/api/v0/dag/get?arg=" .. cid,
          headers = { ["Accept"] = "application/json" },
        })
        if not res or res.status ~= 200 then
          return ngx.status=415, ngx.say('{"Message":"unsupported root or missing"}')
        end

        local reader = res.body_reader
        local buf = {}
        local total = 0
        while true do
          local chunk, e = reader(8192)
          if e then return ngx.status=502, ngx.say('{"Message":"stream error"}') end
          if not chunk then break end
          total = total + #chunk
          if total > MAX then
            return ngx.status=413, ngx.say('{"Message":"root over 1MB"}')
          end
          buf[#buf+1] = chunk
        end
        httpc:set_keepalive()

        local json, derr = cjson.decode(table.concat(buf))
        if not json then
          return ngx.status=415, ngx.say('{"Message":"root not JSON (dag-json/cbor only)"}')
        end

        -- Validate JSON shape via sidecar (AJV)
        local httpv = http.new(); httpv:set_timeout(3000)
        local okv = httpv:connect("validator", 3000)
        if not okv then
          return ngx.status=502, ngx.say('{"Message":"validator unreachable"}')
        end
        local vres, verr = httpv:request({
          method = "POST",
          path   = "/validate",
          headers = { ["Content-Type"] = "application/json" },
          body    = cjson.encode({ schema = "taglist/v1", json = json })
        })
        if not vres then
          return ngx.status=502, ngx.say('{"Message":"validator error"}')
        end
        local vbody = vres:read_body(); httpv:set_keepalive()
        if vres.status ~= 200 then
          return ngx.status=415, ngx.say(vbody or '{"Message":"schema failed"}')
        end

        -- Delegate to real Kubo pin/add
        local httpc2 = http.new(); httpc2:set_timeout(15000)
        local ok2 = httpc2:connect("127.0.0.1", 5001)
        if not ok2 then
          return ngx.status=502, ngx.say('{"Message":"kubo unreachable"}')
        end
        local path = "/api/v0/pin/add?arg="..cid.."&recursive=false"
        local pres, perr = httpc2:request({ method = "POST", path = path })
        if not pres or pres.status ~= 200 then
          return ngx.status=502, ngx.say('{"Message":"pin failed"}')
        end
        httpc2:set_keepalive()

        -- Kubo-like success shape
        ngx.status=200
        ngx.say('{"Pins":["'..cid..'"]}')
      }
    }

    # Allow-list specific API paths
    location = /api/v0/dag/get {
      limit_req zone=api_rpm burst=60 nodelay;   # tuned burst for UI read bursts
      content_by_lua_block {
        local http  = require("resty.http")
        local cjson = require("cjson.safe")
        local MAX = 1048576 -- 1 MB

        ngx.req.read_body()
        local uri_args = ngx.req.get_uri_args()
        local post_args = ngx.req.get_post_args()
        local arg = uri_args.arg or post_args.arg
        if type(arg) == "table" then
          return ngx.status=400, ngx.say('{"Message":"only one arg supported"}')
        end
        local cid = type(arg) == 'string' and arg or nil
        if not cid or #cid > 100 or not string.match(cid, "^b[a-z0-9]+$") then
          return ngx.status=400, ngx.say('{"Message":"invalid cid"}')
        end

        -- Fetch only the root JSON representation from Kubo
        local httpc = http.new(); httpc:set_timeout(5000)
        local ok = httpc:connect("127.0.0.1", 5001)
        if not ok then
          return ngx.status=502, ngx.say('{"Message":"kubo unreachable"}')
        end
        local res = httpc:request({
          method = "POST",
          path   = "/api/v0/dag/get?arg=" .. cid,
          headers = { ["Accept"] = "application/json" },
        })
        if not res or res.status ~= 200 then
          return ngx.status=404, ngx.say('{"Message":"not found or unsupported"}')
        end

        -- Stream with a strict cap and ensure it is JSON
        local reader = res.body_reader
        local buf = {}
        local total = 0
        while true do
          local chunk, e = reader(8192)
          if e then return ngx.status=502, ngx.say('{"Message":"stream error"}') end
          if not chunk then break end
          total = total + #chunk
          if total > MAX then
            return ngx.status=413, ngx.say('{"Message":"root over 1MB"}')
          end
          buf[#buf+1] = chunk
        end
        httpc:set_keepalive()

        local text = table.concat(buf)
        local json = cjson.decode(text)
        if not json then
          return ngx.status=415, ngx.say('{"Message":"root not JSON (dag-json/cbor only)"}')
        end

        -- AJV schema validation
        local httpv = http.new(); httpv:set_timeout(3000)
        local okv = httpv:connect("validator", 3000)
        if not okv then
          return ngx.status=502, ngx.say('{"Message":"validator unreachable"}')
        end
        local vres = httpv:request({
          method = "POST",
          path   = "/validate",
          headers = { ["Content-Type"] = "application/json" },
          body    = cjson.encode({ schema = "taglist/v1", json = json })
        })
        if not vres then
          return ngx.status=502, ngx.say('{"Message":"validator error"}')
        end
        local vbody = vres:read_body(); httpv:set_keepalive()
        if vres.status ~= 200 then
          return ngx.status=415, ngx.say(vbody or '{"Message":"schema failed"}')
        end

        ngx.status = 200
        ngx.header['Content-Type'] = 'application/json'
        ngx.say(text)
      }
    }

    # Legacy write/bulk endpoints are blocked to prevent binary bypasses
    location = /api/v0/add        { return 403; }
    location ^~ /api/v0/block/    { return 403; }
    location ^~ /api/v0/object/   { return 403; }
    location ^~ /api/v0/files/    { return 403; }
    location = /api/v0/dag/export { return 403; }
    location = /api/v0/dag/import { return 403; }

    # Default deny for any other /api/v0/* paths
    location ^~ /api/v0/          { return 404; }
  }

  # Gateway disabled; no public /ipfs or /ipns routes
}
```

### 7.1 Nginx additions for pubsub (guarded façades)

```nginx
# Pubsub publish façade (JSON, ≤64 KB, topic allow-list)
location = /api/v0/pubsub/pub {
  limit_req zone=api_rpm burst=60 nodelay;   # tuned burst for pubsub
  content_by_lua_block {
    local http  = require("resty.http")
    local cjson = require("cjson.safe")
    local MAX = 65536 -- 64 KB

    ngx.req.read_body()
    local args = ngx.req.get_uri_args()
    local topic = args.arg
    if type(topic) ~= 'string' then
      return ngx.status=400, ngx.say('{"Message":"missing topic"}')
    end
    if not string.match(topic, "^mimis/(taglist|discovery)/[a-z0-9\-]{1,64}$") then
      return ngx.status=403, ngx.say('{"Message":"topic not allowed"}')
    end

    -- Second arg is data (may come in body for POST form; normalize to JSON string)
    local post = ngx.req.get_post_args()
    local data = post.arg or args.data or ""
    if #data == 0 or #data > MAX then
      return ngx.status=413, ngx.say('{"Message":"data too large or empty"}')
    end
    local obj = cjson.decode(data)
    if not obj then
      return ngx.status=415, ngx.say('{"Message":"data must be JSON"}')
    end

    -- Optional: AJV shape check via validator
    local httpv = require("resty.http").new(); httpv:set_timeout(3000)
    local okv = httpv:connect("validator", 3000)
    if not okv then return ngx.status=502, ngx.say('{"Message":"validator unreachable"}') end
    local vres = httpv:request({
      method = "POST",
      path = "/validate",
      headers = { ["Content-Type"] = "application/json" },
      body = cjson.encode({ schema = "pubsub/head/v1", json = obj })
    })
    if not vres or vres.status ~= 200 then
      return ngx.status=415, ngx.say('{"Message":"schema failed"}')
    end

    -- Delegate to Kubo pub
    local httpc = http.new(); httpc:set_timeout(5000)
    local ok = httpc:connect("127.0.0.1", 5001)
    if not ok then return ngx.status=502, ngx.say('{"Message":"kubo unreachable"}') end
    local path = "/api/v0/pubsub/pub?arg="..ngx.escape_uri(topic).."&arg="..ngx.escape_uri(data)
    local res = httpc:request({ method = "POST", path = path })
    if not res or res.status ~= 200 then
      return ngx.status=502, ngx.say('{"Message":"pub failed"}')
    end
    httpc:set_keepalive()
    ngx.status=200; ngx.say('{"Message":"published"}')
  }
}

# Pubsub subscribe façade (streaming with caps)
location = /api/v0/pubsub/sub {
  limit_req zone=api_rpm burst=10 nodelay;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  header_filter_by_lua_block {
    ngx.header['Access-Control-Allow-Origin'] = 'chrome-extension://__EXT_ID__'
  }
  access_by_lua_block {
    local args = ngx.req.get_uri_args()
    local topic = args.arg
    if type(topic) ~= 'string' or not string.match(topic, "^mimis/(taglist|discovery)/[a-z0-9\-]{1,64}$") then
      return ngx.exit(403)
    end
    -- TODO: enforce per-IP subscription caps and idle timeout via shared dict + timers
  }
  proxy_pass http://127.0.0.1:5001$request_uri;
}
```

---

## 7.2 Validator Sidecar (AJV) – Pubsub schema

Add this schema to the validator sidecar and register it under key `pubsub/head/v1` (the pub façade already calls the validator with this key).

```json
{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.mimisbrunnr.local/pubsub/head/v1.json",
    "type": "object",
    "required": ["type", "cid", "ts"],
    "properties": {
        "type": { "const": "head" },
        "cid": { "type": "string", "pattern": "^b[a-z2-7]{10,}$" },
        "ts": { "type": "string", "format": "date-time" },
        "prev": { "type": "string", "pattern": "^b[a-z2-7]{10,}$" },
        "author": {
            "type": "string",
            "pattern": "^did:[a-z0-9]+:[A-Za-z0-9._:-]+$"
        },
        "nonce": { "type": "string", "maxLength": 64 }
    },
    "additionalProperties": false
}
```

Notes:

-   Keep messages **small** (the façade enforces ≤ 64 KB); schema ensures a well-formed head announcement.
-   `author` is optional for now; if required later, add it to `required` and enforce DID binding.
-   `prev` allows clients to detect gaps/reorgs; omit if not available.

---

## 7.3 Nginx façade for /api/v0/dag/put (optional)

Expose a **guarded authoring path** for small JSON docs (≤ 1 MB). The extension can store a document, receive the CID, then call the `pin/add` façade to persist it.

```nginx
# AJV-validated authoring of single-block JSON roots
location = /api/v0/dag/put {
  limit_req zone=api_rpm burst=6 nodelay;
  content_by_lua_block {
    local http  = require("resty.http")
    local cjson = require("cjson.safe")
    local MAX = 1048576 -- 1 MB

    ngx.req.read_body()
    local body = ngx.req.get_body_data() or ""
    if #body == 0 or #body > MAX then
      return ngx.status=413, ngx.say('{"Message":"body over 1MB or empty"}')
    end
    local json = cjson.decode(body)
    if not json then
      return ngx.status=415, ngx.say('{"Message":"not json"}')
    end

    -- AJV schema validation (reuse taglist/v1 or pick via client hint)
    local httpv = http.new(); httpv:set_timeout(3000)
    local okv = httpv:connect("validator", 3000)
    if not okv then
      return ngx.status=502, ngx.say('{"Message":"validator unreachable"}')
    end
    local vres = httpv:request({
      method = "POST",
      path   = "/validate",
      headers = { ["Content-Type"] = "application/json" },
      body    = cjson.encode({ schema = "taglist/v1", json = json })
    })
    if not vres then
      return ngx.status=502, ngx.say('{"Message":"validator error"}')
    end
    local vbody = vres:read_body(); httpv:set_keepalive()
    if vres.status ~= 200 then
      return ngx.status=415, ngx.say(vbody or '{"Message":"schema failed"}')
    end

    -- Delegate to Kubo: json -> dag-cbor (no pin here)
    local httpc = http.new(); httpc:set_timeout(10000)
    local ok = httpc:connect("127.0.0.1", 5001)
    if not ok then
      return ngx.status=502, ngx.say('{"Message":"kubo unreachable"}')
    end
    local pres = httpc:request({
      method = "POST",
      path   = "/api/v0/dag/put?input-codec=json&store-codec=dag-cbor&pin=false",
      headers = { ["Content-Type"] = "application/json" },
      body    = body
    })
    if not pres or pres.status ~= 200 then
      return ngx.status=502, ngx.say('{"Message":"dag put failed"}')
    end
    local pbody = pres:read_body(); httpc:set_keepalive()

    ngx.status=200
    ngx.say(pbody)
  }
}
```

---

## 8) Kubo Config: Remove Gateway Listener

Disable the Gateway listener at the Kubo config level and stop exposing any gateway ports.

### Config JSON patch

Set `Addresses.Gateway` to an empty string:

```jsonc
{
    "Addresses": {
        "API": "/ip4/0.0.0.0/tcp/5001",
        "Gateway": ""
    },
    "Gateway": {
        "NoFetch": true,
        "HTTPHeaders": {}
    },
    "Experimental": {
        "P2pHttpProxy": false
    }
}
```

> `"Gateway": ""` removes the listener entirely. `Gateway.NoFetch=true` is optional defense-in-depth if the listener were re-enabled later.

### Init script snippet

```bash
# inside container init
ipfs init --profile=server || true
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config --json Addresses.Gateway '""'
ipfs config --json Gateway.NoFetch true
ipfs config --json Experimental.P2pHttpProxy false
```

### docker-compose changes

-   **Do not** publish gateway ports (8080/8081). Only `5001` is needed:

```yaml
services:
    ipfs:
        image: ipfs/kubo@sha256:REPLACE_WITH_DIGEST # pin exact digest (avoid :latest)
        ports:
            - '5001:5001' # API only
        # remove any 8080/8081 mappings
```

**Notes (image pinning):**

-   Never use floating tags (e.g., `:latest`).
-   Track upgrades with Renovate/Dependabot and bump **digests** intentionally.
-   Optionally verify upstream release signatures and image provenance (SBOM/attestations) before updating.

---

## 9) Monitoring & Alerts

-   **Metrics:**

    -   `pin_add_facade_attempts_total`, `pin_add_facade_rejected_bytes_total`, `pin_add_facade_success_total`.
    -   Per‑IP attempt counters; 413/415/429 rates.
    -   Kubo repo size; GC runs; pin set size.

-   **Probes:** synthetic pin/add on a known tiny CID; synthetic dag/get on a known tiny CID; alert on ≥ P95 latency or error‑rate > 2%.

---

## 10) Test Plan

1. **Unit (Lua):** CID validation, byte‑ceiling, JSON parse errors, schema fails.
2. **Integration:**

    - Small DAG (<=1 MB) → 200 + pinned.
    - Non‑JSON root (unixfs/dag‑pb/raw) → 415.
    - Root >1 MB → 413.
    - `dag/get` root >1 MB → 413; non‑JSON root → 415; schema invalid → 415.
    - Quota exceed → 429.

3. **Adversarial:**

    - Burst 100 requests from single IP → rate‑limit holds.
    - Large DAG (5 GB) → max 1 MB ingress per attempt; no pin; repo size unchanged.

---

## 11) Rollout

-   Ship proxy build with Lua façade behind feature flag `PIN_ADD_FACADE=on`.
-   Staged deploy in canary; observe error/latency; promote to all nodes.
-   After 72h stable, **keep façade at** `/api/v0/pin/add` and ensure raw Kubo API is not exposed externally.

---

## 12) Client-side Hardening (Vuln #5)

**Principle:** The node never auto-pins from pubsub/discovery; only explicit client calls to `/api/v0/pin/add` (façade) persist data. To prevent discovery/pubsub poisoning at the client, the extension MUST implement the following defenses:

1. **Schema validation (messages):** Validate pubsub head messages against `pubsub/head/v1` before acting. Reject on parse/schema failure.
2. **Monotonic heads:** Maintain `lastAccepted` per topic; drop messages with `ts` ≤ last, and treat `prev` mismatches as gaps (no pin until reconciled).
3. **Author binding:** For controlled topics, require `author` DID and verify a detached signature over `{topic,cid,ts,prev?,nonce}` with the DID’s current verification key.
4. **De-dupe & debounce:** Ignore duplicate `{topic,cid}` for a short TTL and apply per-topic backoff to bursts.
5. **No auto-persist:** Fetch the head CID, validate the **document schema** locally, then call `/api/v0/pin/add`. Never pin on receipt alone.
6. **Bounds on follow-ups:** When fetching the head CID, expect DAG‑JSON/CBOR ≤ 1 MB and handle failures gracefully.
7. **Telemetry:** Emit counters: `pubsub_heads_seen_total`, `pubsub_heads_dropped_{schema,stale,unauth,dup}`, `pubsub_heads_pinned_total`.

**Pseudocode (planning-level):**

```ts
onHead(msg) {
  const head = parseAndValidateHeadJSON(msg)           // schema pubsub/head/v1
  if (!head) return

  if (!isMonotonic(head, lastAccepted[topic])) return  // ts/prev
  if (!isAuthorizedAuthor(head, topic)) return         // DID + signature
  if (isDuplicate(topic, head.cid)) return             // TTL de-dupe

  const doc = await fetchRootJson(head.cid)            // ≤1 MB, JSON enforced by node
  if (!validateDocSchema(doc)) return

  await pinCid(head.cid)                               // call façade /api/v0/pin/add
  updateLastAccepted(topic, head)
}
```

**Status:** Client-side scope; does not change node behavior.

---

## 13) Vuln #6 — Status: N/A for current release

**Why:** Current implementation planning does **not** hash small‑domain values (e.g., tags/topics) into opaque IDs, so the “salt vs. secret pepper” issue doesn’t arise.

**Guidance (future‑proofing):** If we ever derive opaque IDs from small‑domain inputs, use **HMAC‑SHA256 with a secret pepper** (not a public salt), keep it stable across environments, document a clear context string, and include a `kid` for rotation. This does not change any runtime behavior today.

---

## 14) Vuln #7 — IPNS replay scope & client checks

**Scope:** Each user controls their **own** IPNS private key. Replaying an **old** (but previously valid) IPNS record can only affect **that user’s** name; it cannot affect other users. Nodes do **not** auto‑pin from IPNS/discovery in this platform.

**Node stance:** Unchanged. We don’t auto‑pin from IPNS; IPNS is a hint channel only.

**Client MUSTs (freshness):**

1. **Monotonic seqno:** Track `lastSeqno[name]`; accept only records with **strictly higher** sequence numbers. Equal or lower → ignore.
2. **Expiry/EOL check:** Reject IPNS records that are **expired** (past validity/EOL). Keep publish lifetimes modest to limit stale windows.
3. **Signature validation:** Rely on IPNS signature verification (in IPFS); do not accept unsigned/invalid records.
4. **No auto‑persist:** Treat IPNS resolves as **hints**; fetch the referenced CID, validate schema, then (optionally) call `/api/v0/pin/add`. Never pin on receipt of an IPNS record alone.
5. **Convergence preference:** Prefer IPNS‑over‑PubSub (if available) for faster update propagation; fall back to DHT resolution with retries/backoff.

**Operational guidance:**

-   Ensure publishes use strictly increasing seqno (Kubo does this by default).
-   Set reasonable IPNS **lifetime** (e.g., ≤ 24–48h) and republish cadence so stale records age out quickly.

**Tests:**

-   Inject an older IPNS record (lower seqno) → client ignores.
-   Inject an expired IPNS record → client ignores.
-   Newer seqno → client fetches CID, validates, then pins via façade.
