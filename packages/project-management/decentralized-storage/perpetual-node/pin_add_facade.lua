-- Pin/Add Facade with Comprehensive Validation Pipeline
-- File: packages/perpetual-node/config/lua/pin_add_facade.lua

local http = require("resty.http")
local cjson = require("cjson.safe")

-- Configuration constants
local MAX_SIZE = 1048576  -- 1MB
local KUBO_HOST = "127.0.0.1"
local KUBO_PORT = 5001
local VALIDATOR_HOST = "validator"
local VALIDATOR_PORT = 3000

-- Helper function to validate CID format
local function validate_cid(cid)
    if not cid or type(cid) ~= "string" then
        return false, "missing or invalid CID"
    end
    if #cid > 100 then
        return false, "CID too long"
    end
    -- Basic CIDv1 format check (starts with 'b')
    if not string.match(cid, "^b[a-z2-7]+$") then
        return false, "invalid CID format"
    end
    return true
end

-- Helper function to check per-IP daily quota
local function check_daily_quota(ip)
    local dict = ngx.shared.pin_quota
    local key = ip .. ":day"
    local max_daily = tonumber(os.getenv("PIN_ADD_MAX_PER_IP_PER_DAY") or "2000")
    
    local current, err = dict:incr(key, 1, 0, 86400)  -- 24 hour TTL
    if not current then
        ngx.log(ngx.ERR, "quota check failed: ", err)
        return false, "quota check failed"
    end
    
    if current > max_daily then
        return false, "daily quota exceeded"
    end
    
    return true
end

-- Helper function to prefetch and validate root block
local function validate_root_block(cid)
    local httpc = http.new()
    httpc:set_timeout(5000)
    
    local ok, err = httpc:connect(KUBO_HOST, KUBO_PORT)
    if not ok then
        return false, "kubo connection failed"
    end
    
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/dag/get?arg=" .. cid,
        headers = { ["Accept"] = "application/json" }
    })
    
    if not res or res.status ~= 200 then
        httpc:set_keepalive()
        return false, "root block not found or unsupported"
    end
    
    -- Stream with strict size limit
    local reader = res.body_reader
    local chunks = {}
    local total_size = 0
    
    while true do
        local chunk, read_err = reader(8192)
        if read_err then
            httpc:set_keepalive()
            return false, "stream read error"
        end
        if not chunk then
            break
        end
        
        total_size = total_size + #chunk
        if total_size > MAX_SIZE then
            httpc:set_keepalive()
            return false, "root block exceeds 1MB limit"
        end
        
        table.insert(chunks, chunk)
    end
    
    httpc:set_keepalive()
    
    local content = table.concat(chunks)
    local json_obj, decode_err = cjson.decode(content)
    
    if not json_obj then
        return false, "root block is not valid JSON (DAG-JSON/CBOR only)"
    end
    
    return true, json_obj, content
end

-- Helper function to validate JSON schema via sidecar
local function validate_schema(json_obj)
    local httpv = http.new()
    httpv:set_timeout(3000)
    
    local ok, err = httpv:connect(VALIDATOR_HOST, VALIDATOR_PORT)
    if not ok then
        return false, "validator connection failed"
    end
    
    local validation_request = {
        schema = "taglist/v1",
        json = json_obj
    }
    
    local res, err = httpv:request({
        method = "POST",
        path = "/validate",
        headers = { ["Content-Type"] = "application/json" },
        body = cjson.encode(validation_request)
    })
    
    if not res then
        httpv:set_keepalive()
        return false, "validator request failed"
    end
    
    local response_body = res:read_body()
    httpv:set_keepalive()
    
    if res.status ~= 200 then
        return false, response_body or "schema validation failed"
    end
    
    return true
end

-- Helper function to pin via Kubo with forced non-recursive
local function pin_via_kubo(cid)
    local httpc = http.new()
    httpc:set_timeout(15000)
    
    local ok, err = httpc:connect(KUBO_HOST, KUBO_PORT)
    if not ok then
        return false, "kubo connection failed for pinning"
    end
    
    local pin_path = "/api/v0/pin/add?arg=" .. cid .. "&recursive=false"
    local res, err = httpc:request({
        method = "POST",
        path = pin_path
    })
    
    if not res or res.status ~= 200 then
        httpc:set_keepalive()
        return false, "pinning operation failed"
    end
    
    httpc:set_keepalive()
    return true
end

-- Main facade logic
ngx.req.read_body()

-- Extract and validate CID argument
local uri_args = ngx.req.get_uri_args()
local post_args = ngx.req.get_post_args()
local cid_arg = uri_args.arg or post_args.arg

-- Handle multiple args (reject)
if type(cid_arg) == "table" then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"only one CID argument supported"}')
    ngx.var.validation_result = "multiple_args"
    return
end

-- Validate CID format
local cid_ok, cid_err = validate_cid(cid_arg)
if not cid_ok then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"' .. cid_err .. '"}')
    ngx.var.validation_result = "invalid_cid"
    return
end

-- Check daily quota
local quota_ok, quota_err = check_daily_quota(ngx.var.binary_remote_addr)
if not quota_ok then
    ngx.status = 429
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"' .. quota_err .. '"}')
    ngx.var.validation_result = "quota_exceeded"
    return
end

-- Validate root block (size, format, JSON decode)
local root_ok, root_data, root_content = validate_root_block(cid_arg)
if not root_ok then
    ngx.status = 415
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"' .. root_data .. '"}')
    ngx.var.validation_result = "invalid_root"
    return
end

-- Validate against schema
local schema_ok, schema_err = validate_schema(root_data)
if not schema_ok then
    ngx.status = 415
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"' .. (schema_err or "schema validation failed") .. '"}')
    ngx.var.validation_result = "schema_failed"
    return
end

-- All validation passed - pin via Kubo
local pin_ok, pin_err = pin_via_kubo(cid_arg)
if not pin_ok then
    ngx.status = 502
    ngx.header.content_type = "application/json"
    ngx.say('{"Message":"' .. (pin_err or "pinning failed") .. '"}')
    ngx.var.validation_result = "pin_failed"
    return
end

-- Success response (Kubo-compatible format)
ngx.status = 200
ngx.header.content_type = "application/json"
ngx.say('{"Pins":["' .. cid_arg .. '"]}')
ngx.var.validation_result = "success"