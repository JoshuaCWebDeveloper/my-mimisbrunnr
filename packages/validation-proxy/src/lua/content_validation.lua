-- Shared content validation module
-- Provides common validation functions for size limits, JSON parsing, and schema validation

local cjson = require "cjson"
local http = require "resty.http"

local _M = {}

-- Validate CID format (CIDv0 or CIDv1)
function _M.is_valid_cid(cid)
    if type(cid) ~= "string" then
        return false
    end

    -- CIDv0: "Qm" + 44 base58btc chars
    if string.match(cid, "^Qm[1-9A-HJ-NP-Za-km-z]+$") then
        local len = #cid
        if len == 46 then
            return true
        end
    end

    -- CIDv1 base32 (lowercase, as Helia uses)
    -- b + one or more base32 chars, with loose length bounds
    if string.match(cid, "^b[a-z2-7]+$") then
        local len = #cid
        -- CIDs are never tiny; this keeps out obviously bogus input
        if len >= 40 and len <= 200 then
            return true
        end
    end

    return false
end

function _M.is_valid_ipns_peer_id(peer_id)
    if type(peer_id) ~= "string" then
        return false
    end
    
    local cid = peer_id
    
    -- CIDv0: "Qm" + exactly 44 base58btc chars (46 total)
    if string.match(cid, "^Qm[1-9A-HJ-NP-Za-km-z]+$") then
        local len = #cid
        if len == 46 then
            return true
        end
    end
    
    -- CIDv1 Base36: starts with "12D3KooW" + base36 chars (59+ chars typical)
    if string.match(cid, "^12D3KooW[A-Za-z2-9]+$") then
        local len = #cid
        if len >= 52 then
            return true
        end
    end
    
    -- CIDv1 Base32: "bafk" + base32 chars (lowercase, ~59 chars typical)
    if string.match(cid, "^bafk[a-z2-7]+$") then
        local len = #cid
        if len >= 56 and len <= 100 then
            return true
        end
    end
    
    -- Legacy base58btc without Qm prefix (some keys): "k" + base58btc chars
    if string.match(cid, "^k[1-9A-HJ-NP-Za-km-z]+$") then
        local len = #cid
        if len >= 45 and len <= 100 then
            return true
        end
    end
    
    return false
end

-- Validate content size and parse JSON from raw string
-- Returns: json_obj, error_message
function _M.validate_and_parse_json(content, max_size)
    max_size = max_size or MAX_CONTENT_SIZE

    -- Check size
    local content_size = #content
    if content_size > max_size then
        return nil, "Content too large (max: " .. max_size .. " bytes, got: " .. content_size .. " bytes)"
    end

    -- Attempt JSON parsing with error handling
    local success, json_obj = pcall(cjson.decode, content)
    if not success then
        return nil, "Content is not valid JSON: " .. (json_obj or "parse error")
    end

    return json_obj, nil
end

-- Validate JSON against schema via validation service
-- Returns: success (boolean), error_message (optional)
function _M.validate_schema(json_obj, schema_type)
    schema_type = schema_type or "data/write/v1"

    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)

    local ok, err = httpc:connect("validation-service", 3000)
    if not ok then
        return false, "Validator service unavailable: " .. (err or "unknown error")
    end

    local validation_request = {
        schema = schema_type,
        json = json_obj
    }

    local res, err = httpc:request({
        method = "POST",
        path = "/validate",
        headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = cjson.encode(validation_request)
    })

    if not res then
        httpc:close()
        return false, "Validation request failed: " .. (err or "unknown error")
    end

    local response_body = res:read_body()
    httpc:close()

    if res.status ~= 200 then
        return false, response_body
    end

    return true, nil
end

-- Send error response in consistent format
function _M.send_error(status, error_message)
    ngx.status = status
    local error_response = cjson.encode({
        Message = cjson.encode({ValidationError = error_message})
    })
    ngx.say(error_response)
end

return _M
